import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { issueApiKey } from '../apiUtils/security/apiKeys';
import { requireAdminSession } from '../apiUtils/security/auth';
import { recordAudit } from '../apiUtils/security/audit';
import { isSameOriginRequest } from '../apiUtils/security/request';
import apiKeyHandler from '../pages/api/api-keys/[id]';
import apiKeysHandler from '../pages/api/api-keys';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/security/apiKeys');
jest.mock('../apiUtils/security/auth');
jest.mock('../apiUtils/security/audit');
jest.mock('../apiUtils/security/request');

describe('API key administration routes', () => {
  const actor = { type: 'oauth_user', id: 'admin@curved-road.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminSession as jest.Mock).mockResolvedValue(actor);
    (isSameOriginRequest as jest.Mock).mockReturnValue(true);
  });

  it('lists only non-secret key summaries and audits the action', async () => {
    const listApiKeys = jest.fn().mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'QA',
        keyPrefix: '0123456789ab',
      },
    ]);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ listApiKeys });
    const { req, res } = createMocks({ method: 'GET' });

    await apiKeysHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).not.toContain('keyHash');
    expect(res._getData()).not.toContain('token');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.list', outcome: 'success' })
    );
  });

  it('issues a key for a same-origin administrator and audits it', async () => {
    (issueApiKey as jest.Mock).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'QA',
      keyPrefix: '0123456789ab',
      token: `nbota_0123456789ab_${'A'.repeat(43)}`,
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'QA', expiresInDays: 30 },
    });

    await apiKeysHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(issueApiKey).toHaveBeenCalledWith({
      name: 'QA',
      createdBy: actor.id,
      expiresInDays: 30,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.create', outcome: 'success' })
    );
  });

  it('rejects cross-origin key creation before issuing a key', async () => {
    (isSameOriginRequest as jest.Mock).mockReturnValue(false);
    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'QA', expiresInDays: 30 },
    });

    await apiKeysHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(issueApiKey).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.create', outcome: 'denied' })
    );
  });

  it('revokes an existing key and audits the action', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const revokeApiKey = jest.fn().mockResolvedValue({
      id,
      name: 'QA',
      keyPrefix: '0123456789ab',
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ revokeApiKey });
    const { req, res } = createMocks({ method: 'DELETE', query: { id } });

    await apiKeyHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(revokeApiKey).toHaveBeenCalledWith(id);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.revoke', outcome: 'success', targetId: id })
    );
  });
});
