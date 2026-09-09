import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../apiUtils/security/auth';
import { recordAudit } from '../apiUtils/security/audit';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import releasesHandler from '../pages/api/releases';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/security/auth');
jest.mock('../apiUtils/security/audit');
jest.mock('../apiUtils/storage/StorageFactory');

describe('Releases API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminSession as jest.Mock).mockResolvedValue({
      type: 'oauth_user',
      id: 'admin@curved-road.com',
    });
  });

  it('returns 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await releasesHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 401 before reading release data when no session exists', async () => {
    (requireAdminSession as jest.Mock).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    });
    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(StorageFactory.getStorage).not.toHaveBeenCalled();
  });

  it('returns authenticated release data', async () => {
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      listDirectories: jest.fn().mockResolvedValue(['1.0.0']),
      listFiles: jest.fn().mockResolvedValue([
        {
          name: 'update.zip',
          created_at: '2024-03-20T00:00:00Z',
          metadata: { size: 1000 },
        },
      ]),
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      listReleases: jest.fn().mockResolvedValue([
        {
          id: 'release-id',
          path: 'updates/1.0.0/update.zip',
          commitHash: 'abc1234',
          commitMessage: 'Release',
        },
      ]),
    });

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).releases[0]).toEqual(
      expect.objectContaining({ id: 'release-id', commitHash: 'abc1234' })
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'release.list', outcome: 'success' })
    );
  });
});
