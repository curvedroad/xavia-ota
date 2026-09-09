import yazl from 'yazl';

import { ZipHelper } from '../apiUtils/helpers/ZipHelper';

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
