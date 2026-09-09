import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../apiUtils/security/auth';
import { recordAudit } from '../apiUtils/security/audit';
import auditLogsHandler from '../pages/api/audit-logs';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/security/auth');
jest.mock('../apiUtils/security/audit');

describe('audit log route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminSession as jest.Mock).mockResolvedValue({
      type: 'oauth_user',
      id: 'admin@curved-road.com',
    });
  });

  it('requires an OAuth administrator before reading audit records', async () => {
    (requireAdminSession as jest.Mock).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    });
    const { req, res } = createMocks({ method: 'GET' });

    await auditLogsHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(DatabaseFactory.getDatabase).not.toHaveBeenCalled();
  });

  it('caps the query limit and audits access to the log', async () => {
    const listAuditLogs = jest.fn().mockResolvedValue([]);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ listAuditLogs });
    const { req, res } = createMocks({ method: 'GET', query: { limit: '10000' } });

    await auditLogsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(listAuditLogs).toHaveBeenCalledWith(500);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit_log.list', outcome: 'success' })
    );
  });
});
