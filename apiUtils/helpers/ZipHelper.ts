import crypto from 'crypto';
import fs from 'fs';
import yauzl, { Entry } from 'yauzl';

import { isSafeArchivePath } from '../security/input';
import { StorageFactory } from '../storage/StorageFactory';

export type ZipArchive = Buffer;

const MAX_ENTRY_COUNT = 20_000;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

// Bundle paths carry an upload timestamp, so cached data never goes stale.
// Keep the most recently used archives within a memory budget instead of expiring them.
// Next.js bundles each API route separately, so every route using ZipHelper has its own cache.
const DEFAULT_ZIP_CACHE_MAX_MB = 128;

// Extracted files served by /api/assets (the ~18MB launch bundles above all).
const DEFAULT_ZIP_ENTRY_CACHE_MAX_MB = 64;
// Entry hashes are a few KB per bundle, so a small count bound is enough.
const MAX_HASHED_BUNDLES = 20;

function cacheMaxBytes(envName: string, defaultMb: number): number {
  const mb = Number(process.env[envName]);
  return (Number.isFinite(mb) && mb >= 0 ? mb : defaultMb) * 1024 * 1024;
}

export interface ZipEntryHash {
  sha256Base64: string;
  md5Hex: string;
}

// Keep values within maxBytes, evicting the least recently used first (Map order).
class LruByteCache {
  private values: Map<string, Buffer> = new Map();

  get(key: string): Buffer | undefined {
    const value = this.values.get(key);
    if (value) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  set(key: string, value: Buffer, maxBytes: number): void {
    if (value.length > maxBytes) return;
    this.values.delete(key);
    this.values.set(key, value);
    let total = Array.from(this.values.values()).reduce((sum, cached) => sum + cached.length, 0);
    for (const cachedKey of Array.from(this.values.keys())) {
      if (total <= maxBytes) break;
      total -= this.values.get(cachedKey)?.length ?? 0;
      this.values.delete(cachedKey);
    }
  }

  clear(): void {
    this.values.clear();
  }
}

// Concurrent callers for the same key share one in-flight load.
async function shared<T>(pending: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = load();
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}

export class ZipHelper {
  private static zipCache = new LruByteCache();
  private static pendingZips: Map<string, Promise<ZipArchive>> = new Map();
  private static entryCache = new LruByteCache();
  private static pendingEntries: Map<string, Promise<Buffer>> = new Map();
  private static entryHashes: Map<string, Map<string, ZipEntryHash>> = new Map();
  private static pendingHashes: Map<string, Promise<Map<string, ZipEntryHash>>> = new Map();

  static async loadZipFile(filePath: string): Promise<ZipArchive> {
    const zip = fs.readFileSync(filePath);
    await this.validate(zip);
    return zip;
  }

  static async getZipFromStorage(updateBundlePath: string): Promise<ZipArchive> {
    const cached = this.zipCache.get(updateBundlePath);
    if (cached) return cached;

    return shared(this.pendingZips, updateBundlePath, async () => {
      const zip = await StorageFactory.getStorage().downloadFile(`${updateBundlePath}.zip`);
      await this.validate(zip);
      this.zipCache.set(
        updateBundlePath,
        zip,
        cacheMaxBytes('ZIP_CACHE_MAX_MB', DEFAULT_ZIP_CACHE_MAX_MB)
      );
      return zip;
    });
  }

  /** Same bytes as getFileFromZip, extracted once per bundle file and shared. */
  static async getCachedFileFromZip(
    updateBundlePath: string,
    zip: ZipArchive,
    filePath: string
  ): Promise<Buffer> {
    const key = `${updateBundlePath}:${filePath}`;
    const cached = this.entryCache.get(key);
    if (cached) return cached;

    return shared(this.pendingEntries, key, async () => {
      const file = await this.getFileFromZip(zip, filePath);
      this.entryCache.set(
        key,
        file,
        cacheMaxBytes('ZIP_ENTRY_CACHE_MAX_MB', DEFAULT_ZIP_ENTRY_CACHE_MAX_MB)
      );
      return file;
    });
  }

  /** sha256/md5 of every file in the bundle, read in one sequential pass and kept per bundle. */
  static async getEntryHashes(
    updateBundlePath: string,
    zip: ZipArchive
  ): Promise<Map<string, ZipEntryHash>> {
    const cached = this.entryHashes.get(updateBundlePath);
    if (cached) return cached;

    return shared(this.pendingHashes, updateBundlePath, async () => {
      const hashes = await this.hashEntries(zip);
      this.entryHashes.delete(updateBundlePath);
      this.entryHashes.set(updateBundlePath, hashes);
      const oldest = Array.from(this.entryHashes.keys());
      while (this.entryHashes.size > MAX_HASHED_BUNDLES) this.entryHashes.delete(oldest.shift()!);
      return hashes;
    });
  }

  static clearCache(): void {
    this.zipCache.clear();
    this.pendingZips.clear();
    this.entryCache.clear();
    this.pendingEntries.clear();
    this.entryHashes.clear();
    this.pendingHashes.clear();
  }

  private static hashEntries(zip: ZipArchive): Promise<Map<string, ZipEntryHash>> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(zip, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
        if (error || !zipFile) {
          reject(error ?? new Error('Invalid zip archive'));
          return;
        }

        const hashes = new Map<string, ZipEntryHash>();
        let settled = false;
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
          if (entry.fileName.endsWith('/')) {
            zipFile.readEntry();
            return;
          }

          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(streamError ?? new Error(`Unable to read zip entry: ${entry.fileName}`));
              return;
            }
            const sha256 = crypto.createHash('sha256');
            const md5 = crypto.createHash('md5');
            stream.on('data', (chunk: Buffer) => {
              sha256.update(chunk);
              md5.update(chunk);
            });
            stream.once('error', fail);
            stream.once('end', () => {
              hashes.set(entry.fileName, {
                sha256Base64: sha256.digest('base64'),
                md5Hex: md5.digest('hex'),
              });
              zipFile.readEntry();
            });
          });
        });
        zipFile.once('error', fail);
        zipFile.once('end', () => {
          if (settled) return;
          settled = true;
          resolve(hashes);
        });
        zipFile.readEntry();
      });
    });
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
