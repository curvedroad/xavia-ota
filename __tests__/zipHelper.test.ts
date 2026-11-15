import { createHash } from 'crypto';
import yazl from 'yazl';

import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

describe('ZipHelper', () => {
  it('validates and reads a normal OTA archive', async () => {
    const zip = await createZip([
      ['metadata.json', Buffer.from('{"version":"1.0.0"}')],
      ['bundles/ios.js', Buffer.from('console.log("ok")')],
    ]);

    await expect(ZipHelper.validate(zip)).resolves.toBeUndefined();
    await expect(ZipHelper.hasFile(zip, 'metadata.json')).resolves.toBe(true);
    await expect(ZipHelper.getFileFromZip(zip, 'metadata.json')).resolves.toEqual(
      Buffer.from('{"version":"1.0.0"}')
    );
  });

  it('rejects invalid archives and extreme compression ratios', async () => {
    await expect(ZipHelper.validate(Buffer.from('not a zip'))).rejects.toThrow();
    const compressedBomb = await createZip([['large.txt', Buffer.alloc(1024 * 1024)]]);
    await expect(ZipHelper.validate(compressedBomb)).rejects.toThrow('compression ratio');
  });

  it('enforces a tighter per-file limit for metadata reads', async () => {
    const zip = await createZip([['metadata.json', Buffer.from('12345')]]);

    await expect(ZipHelper.getFileFromZip(zip, 'metadata.json', 4)).rejects.toThrow(
      'exceeds the allowed size'
    );
  });
});

describe('ZipHelper.getZipFromStorage', () => {
  afterEach(() => {
    ZipHelper.clearCache();
    jest.restoreAllMocks();
  });

  it('downloads a bundle once for concurrent requests and keeps it cached', async () => {
    const zip = await createZip([['metadata.json', Buffer.from('{}')]]);
    const downloadFile = jest.fn().mockResolvedValue(zip);
    jest.spyOn(StorageFactory, 'getStorage').mockReturnValue({ downloadFile } as never);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => ZipHelper.getZipFromStorage('updates/production/1.7.0/1'))
    );
    await ZipHelper.getZipFromStorage('updates/production/1.7.0/1');

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result === zip)).toBe(true);
  });

  it('hashes every file in one pass with the same values as hashing the extracted file', async () => {
    const zip = await createZip([
      ['metadata.json', Buffer.from('{}')],
      ['assets/a.png', Buffer.from('image-bytes')],
    ]);
    const hashes = await ZipHelper.getEntryHashes('updates/production/1.7.0/2', zip);
    const file = await ZipHelper.getFileFromZip(zip, 'assets/a.png');

    expect(hashes.get('assets/a.png')).toEqual({
      sha256Base64: createHash('sha256').update(file).digest('base64'),
      md5Hex: createHash('md5').update(file).digest('hex'),
    });
    expect(hashes.size).toBe(2);
  });
});

async function createZip(files: Array<[string, Buffer]>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of files) zip.addBuffer(content, name);
  zip.end();

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once('error', reject);
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}
