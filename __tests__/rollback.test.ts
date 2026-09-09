import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../apiUtils/security/auth';
import { recordAudit } from '../apiUtils/security/audit';
import { isSameOriginRequest } from '../apiUtils/security/request';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import rollbackHandler from '../pages/api/rollback';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/security/auth');
jest.mock('../apiUtils/security/audit');
jest.mock('../apiUtils/security/request');
jest.mock('../apiUtils/storage/StorageFactory');

describe('Rollback API', () => {
  const sourceReleaseId = '11111111-1111-4111-8111-111111111111';
  const newReleaseId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminSession as jest.Mock).mockResolvedValue({
      type: 'oauth_user',
      id: 'admin@curved-road.com',
    });
    (isSameOriginRequest as jest.Mock).mockReturnValue(true);
  });

  it('returns 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('rejects a cross-origin request', async () => {
    (isSameOriginRequest as jest.Mock).mockReturnValue(false);
    const { req, res } = createMocks({ method: 'POST', body: { releaseId: sourceReleaseId } });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it.each([{}, { releaseId: 'not-a-uuid' }])(
    'returns 400 for an invalid releaseId',
    async (body) => {
      const { req, res } = createMocks({ method: 'POST', body });
      await rollbackHandler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'release.rollback', outcome: 'failure', httpStatus: 400 })
      );
    }
  );

  it('looks up trusted release metadata before rollback', async () => {
    const sourceRelease = {
      id: sourceReleaseId,
      path: 'updates/1.0.0/old.zip',
      runtimeVersion: '1.0.0',
      timestamp: '2024-03-20T00:00:00Z',
      commitHash: 'abc1234',
      commitMessage: 'Trusted message',
      updateId: 'update-id',
    };
    const mockDatabase = {
      getRelease: jest.fn().mockResolvedValue(sourceRelease),
      createRelease: jest.fn().mockResolvedValue({ id: newReleaseId }),
    };
    const mockStorage = { copyFile: jest.fn().mockResolvedValue(undefined) };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);

    const { req, res } = createMocks({
      method: 'POST',
      body: { releaseId: sourceReleaseId, path: 'attacker-controlled' },
    });
    await rollbackHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockDatabase.getRelease).toHaveBeenCalledWith(sourceReleaseId);
    expect(mockStorage.copyFile).toHaveBeenCalledWith(
      sourceRelease.path,
      expect.stringMatching(/^updates\/1\.0\.0\/\d{14}\.zip$/)
    );
    expect(mockDatabase.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeVersion: sourceRelease.runtimeVersion,
        commitHash: sourceRelease.commitHash,
        commitMessage: sourceRelease.commitMessage,
      })
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'release.rollback', outcome: 'success' })
    );
  });
});
