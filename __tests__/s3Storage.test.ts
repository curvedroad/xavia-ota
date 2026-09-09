import { CopyObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { S3Storage } from '../apiUtils/storage/S3Storage';

describe('S3 storage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_BUCKET_NAME: 'ota-test-bucket',
      S3_REGION: 'test-region',
      S3_ENDPOINT: 'https://object-storage.example',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('copies from a bucket-qualified, URL-encoded source key', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const storage = new S3Storage();

    await storage.copyFile('updates/1.0.0/source file.zip', 'updates/1.0.0/copied.zip');

    const command = send.mock.calls[0][0] as CopyObjectCommand;
    expect(command.input).toEqual(
      expect.objectContaining({
        Bucket: 'ota-test-bucket',
        CopySource: 'ota-test-bucket/updates/1.0.0/source%20file.zip',
        Key: 'updates/1.0.0/copied.zip',
      })
    );
  });

  it('checks the exact release object key', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const storage = new S3Storage();

    await expect(storage.fileExists('updates/1.0.0/release.zip')).resolves.toBe(true);

    const command = send.mock.calls[0][0] as HeadObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'ota-test-bucket',
      Key: 'updates/1.0.0/release.zip',
    });
  });
});
