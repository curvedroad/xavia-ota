import fs from 'fs';
import yauzl, { Entry } from 'yauzl';

import { isSafeArchivePath } from '../security/input';
import { StorageFactory } from '../storage/StorageFactory';

export type ZipArchive = Buffer;

const MAX_ENTRY_COUNT = 20_000;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

// Bundle paths carry an upload timestamp, so a cached archive never goes stale.
// Keep the most recently used archives within a memory budget instead of expiring them.
const DEFAULT_ZIP_CACHE_MAX_MB = 256;

function zipCacheMaxBytes(): number {
  const mb = Number(process.env.ZIP_CACHE_MAX_MB);
  return (Number.isFinite(mb) && mb >= 0 ? mb : DEFAULT_ZIP_CACHE_MAX_MB) * 1024 * 1024;
}

export class ZipHelper {
  // Map order is the LRU order: oldest first.
  private static zipCache: Map<string, ZipArchive> = new Map();
  // One download per bundle; concurrent requests share it.
  private static pendingZips: Map<string, Promise<ZipArchive>> = new Map();

  static async loadZipFile(filePath: string): Promise<ZipArchive> {
    const zip = fs.readFileSync(filePath);
    await this.validate(zip);
    return zip;
  }

  static async getZipFromStorage(updateBundlePath: string): Promise<ZipArchive> {
    const cached = this.zipCache.get(updateBundlePath);
    if (cached) {
      this.zipCache.delete(updateBundlePath);
      this.zipCache.set(updateBundlePath, cached);
      return cached;
    }

    const pending = this.pendingZips.get(updateBundlePath);
    if (pending) return pending;

    const download = (async () => {
      const zip = await StorageFactory.getStorage().downloadFile(`${updateBundlePath}.zip`);
      await this.validate(zip);
      this.cacheZip(updateBundlePath, zip);
      return zip;
    })();
    this.pendingZips.set(updateBundlePath, download);
    try {
      return await download;
    } finally {
      this.pendingZips.delete(updateBundlePath);
    }
  }

  static clearCache(): void {
    this.zipCache.clear();
    this.pendingZips.clear();
  }

  private static cacheZip(updateBundlePath: string, zip: ZipArchive): void {
    const maxBytes = zipCacheMaxBytes();
    if (zip.length > maxBytes) return;
    this.zipCache.set(updateBundlePath, zip);
    let total = Array.from(this.zipCache.values()).reduce((sum, cached) => sum + cached.length, 0);
    for (const path of Array.from(this.zipCache.keys())) {
      if (total <= maxBytes) break;
      total -= this.zipCache.get(path)?.length ?? 0;
      this.zipCache.delete(path);
    }
  }

  static async hasFile(zip: ZipArchive, filePath: string): Promise<boolean> {
    return this.findEntry(zip, filePath, false).then((entry) => entry !== null);
  }

  static async getFileFromZip(
    zip: ZipArchive,
    filePath: string,
    maxBytes = MAX_ENTRY_BYTES
  ): Promise<Buffer> {
    const entry = await this.findEntry(zip, filePath, true, maxBytes);
    if (!Buffer.isBuffer(entry)) throw new Error(`File not found in zip: ${filePath}`);
    return entry;
  }

  static async validate(zip: ZipArchive): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      yauzl.fromBuffer(zip, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
        if (error || !zipFile) {
          reject(error ?? new Error('Invalid zip archive'));
          return;
        }

        let settled = false;
        let entryCount = 0;
        let totalUncompressedBytes = 0;
        const fail = (reason: Error) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          reject(reason);
        };

        zipFile.on('entry', (entry: Entry) => {
          try {
            validateEntry(entry);
            entryCount += 1;
            totalUncompressedBytes += entry.uncompressedSize;

            if (entryCount > MAX_ENTRY_COUNT) throw new Error('Zip contains too many entries');
            if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error('Zip entry is too large');
            if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
              throw new Error('Zip uncompressed content is too large');
            }
            if (
              entry.uncompressedSize > 0 &&
              (entry.compressedSize === 0 ||
                entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO)
            ) {
              throw new Error('Zip compression ratio is unsafe');
            }
          } catch (validationError) {
            fail(validationError as Error);
            return;
          }
          zipFile.readEntry();
        });
        zipFile.once('error', fail);
        zipFile.once('end', () => {
          if (settled) return;
          settled = true;
          resolve();
        });
        zipFile.readEntry();
      });
    });
  }

  private static async findEntry(
    zip: ZipArchive,
    filePath: string,
    readContents: boolean,
    maxBytes = MAX_ENTRY_BYTES
  ): Promise<Buffer | Entry | null> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(zip, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
        if (error || !zipFile) {
          reject(error ?? new Error('Invalid zip archive'));
          return;
        }

        let settled = false;
        const finish = (value: Buffer | Entry | null) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          resolve(value);
        };
        const fail = (reason: Error) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          reject(reason);
        };

        zipFile.on('entry', (entry: Entry) => {
          try {
            validateEntry(entry);
          } catch (validationError) {
            fail(validationError as Error);
            return;
          }

          if (entry.fileName !== filePath) {
            zipFile.readEntry();
            return;
          }

          if (entry.uncompressedSize > maxBytes) {
            fail(new Error(`Zip entry exceeds the allowed size: ${filePath}`));
            return;
          }

          if (!readContents) {
            finish(entry);
            return;
          }

          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(streamError ?? new Error(`Unable to read zip entry: ${filePath}`));
              return;
            }

            const chunks: Buffer[] = [];
            let total = 0;
            stream.on('data', (chunk: Buffer) => {
              total += chunk.length;
              if (total > maxBytes) {
                stream.destroy(new Error('Zip entry is too large'));
                return;
              }
              chunks.push(chunk);
            });
            stream.once('error', fail);
            stream.once('end', () => finish(Buffer.concat(chunks)));
          });
        });
        zipFile.once('error', fail);
        zipFile.once('end', () => finish(null));
        zipFile.readEntry();
      });
    });
  }
}

function validateEntry(entry: Entry): void {
  if (!isSafeArchivePath(entry.fileName)) {
    throw new Error('Zip contains an unsafe path');
  }
}
