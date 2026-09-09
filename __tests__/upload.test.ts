import formidable from 'formidable';
import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { HashHelper } from '../apiUtils/helpers/HashHelper';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import { authenticateApiKey } from '../apiUtils/security/apiKeys';
import { recordAudit } from '../apiUtils/security/audit';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import uploadHandler from '../pages/api/upload';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/helpers/HashHelper');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/security/apiKeys');
jest.mock('../apiUtils/security/audit');
jest.mock('../apiUtils/storage/StorageFactory');
jest.mock('formidable');

describe('Upload API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateApiKey as jest.Mock).mockResolvedValue({ type: 'api_key', id: 'key-id' });
  });

  it('returns 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 401 when the bearer API key is invalid', async () => {
    (authenticateApiKey as jest.Mock).mockResolvedValue(null);
    const { req, res } = createMocks({ method: 'POST' });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('handles a validated file upload successfully', async () => {
    const mockForm = {
      parse: jest.fn().mockResolvedValue([
        {
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc1234'],
          commitMessage: ['Test commit message'],
        },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    };
    (formidable as unknown as jest.Mock).mockReturnValue(mockForm);

    const mockZip = Buffer.from('test zip');
    const mockMetadataContent = Buffer.from(
      JSON.stringify({
        fileMetadata: {
          ios: { bundle: 'bundles/ios.js', assets: [{ path: 'assets/icon.png', ext: 'png' }] },
        },
      })
    );
    const mockExpoConfigContent = Buffer.from('{"runtimeVersion":"1.0.0"}');
    (ZipHelper.loadZipFile as jest.Mock).mockResolvedValue(mockZip);
    (ZipHelper.getFileFromZip as jest.Mock)
      .mockResolvedValueOnce(mockMetadataContent)
      .mockResolvedValueOnce(mockExpoConfigContent);
    (HashHelper.createHash as jest.Mock).mockReturnValue('abcdef1234567890abcdef1234567890');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890'
    );

    const mockStorage = {
      uploadFile: jest.fn().mockResolvedValue('updates/1.0.0/timestamp.zip'),
    };
    const mockDatabase = {
      createRelease: jest.fn().mockResolvedValue({ id: 'release-id' }),
    };
    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });
    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      path: 'updates/1.0.0/timestamp.zip',
      releaseId: 'release-id',
    });
    expect(mockStorage.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^updates\/1\.0\.0\/\d{14}\.zip$/),
      mockZip
    );
    expect(mockDatabase.createRelease).toHaveBeenCalledWith({
      path: 'updates/1.0.0/timestamp.zip',
      runtimeVersion: '1.0.0',
      timestamp: expect.any(String),
      commitHash: 'abc1234',
      commitMessage: 'Test commit message',
      updateId: 'abcdef12-3456-7890-abcd-ef1234567890',
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'release.upload', outcome: 'success' })
    );
  });

  it('returns 400 for missing required fields', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([{}, {}]),
    });
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });
    await uploadHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects an invalid release archive as client input', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest
        .fn()
        .mockResolvedValue([
          { runtimeVersion: ['1.0.0'], commitHash: ['abc1234'] },
          { file: [{ filepath: 'invalid.zip' }] },
        ]),
    });
    (ZipHelper.loadZipFile as jest.Mock).mockRejectedValue(new Error('invalid zip'));
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });

    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Invalid release archive' });
  });

  it('rejects release metadata without a supported platform', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest
        .fn()
        .mockResolvedValue([
          { runtimeVersion: ['1.0.0'], commitHash: ['abc1234'] },
          { file: [{ filepath: 'test.zip' }] },
        ]),
    });
    (ZipHelper.loadZipFile as jest.Mock).mockResolvedValue(Buffer.from('zip'));
    (ZipHelper.getFileFromZip as jest.Mock)
      .mockResolvedValueOnce(Buffer.from('{"fileMetadata":{}}'))
      .mockResolvedValueOnce(Buffer.from('{"runtimeVersion":"1.0.0"}'));
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });

    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Release metadata has no supported platform',
    });
  });

  it('rejects a runtime version that differs from expoconfig.json', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([
        { runtimeVersion: ['1.0.0'], commitHash: ['abc1234'] },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    });
    (ZipHelper.loadZipFile as jest.Mock).mockResolvedValue(Buffer.from('zip'));
    (ZipHelper.getFileFromZip as jest.Mock)
      .mockResolvedValueOnce(
        Buffer.from(
          JSON.stringify({
            fileMetadata: { ios: { bundle: 'bundles/ios.js', assets: [] } },
          })
        )
      )
      .mockResolvedValueOnce(Buffer.from('{"runtimeVersion":"2.0.0"}'));
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });

    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Runtime version does not match expoconfig.json',
    });
  });

  it('rejects a commit message that cannot fit in the database column', async () => {
    (formidable as unknown as jest.Mock).mockReturnValue({
      parse: jest.fn().mockResolvedValue([
        {
          runtimeVersion: ['1.0.0'],
          commitHash: ['abc1234'],
          commitMessage: ['x'.repeat(256)],
        },
        { file: [{ filepath: 'test.zip' }] },
      ]),
    });
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
    });

    await uploadHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Commit message is too long' });
  });
});
