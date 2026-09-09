import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { authenticateApiKey, hashApiKey, issueApiKey } from '../apiUtils/security/apiKeys';

jest.mock('../apiUtils/database/DatabaseFactory');

describe('upload API keys', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a secret once while storing only its hash', async () => {
    const createApiKey = jest.fn().mockImplementation(async (input) => ({
      id: 'key-id',
      ...input,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    }));
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ createApiKey });

    const issued = await issueApiKey({
      name: 'QA developer',
      createdBy: 'admin@curved-road.com',
      expiresInDays: 30,
    });

    expect(issued.token).toMatch(/^nbota_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'QA developer',
        keyPrefix: issued.keyPrefix,
        keyHash: expect.any(String),
      })
    );
    expect(createApiKey.mock.calls[0][0].keyHash).toBe(hashApiKey(issued.token));
    expect(createApiKey.mock.calls[0][0]).not.toHaveProperty('token');
  });

  it('authenticates an active bearer key and records last use', async () => {
    const token = `nbota_0123456789ab_${'A'.repeat(43)}`;
    const markApiKeyUsed = jest.fn().mockResolvedValue(undefined);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getApiKeyByPrefix: jest.fn().mockResolvedValue({
        id: 'key-id',
        keyPrefix: '0123456789ab',
        keyHash: hashApiKey(token),
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
      }),
      markApiKeyUsed,
    });

    await expect(authenticateApiKey(`Bearer ${token}`)).resolves.toEqual({
      type: 'api_key',
      id: 'key-id',
    });
    expect(markApiKeyUsed).toHaveBeenCalledWith('key-id');
  });

  it('rejects malformed, expired, revoked, and mismatched keys', async () => {
    const token = `nbota_0123456789ab_${'A'.repeat(43)}`;
    const getApiKeyByPrefix = jest.fn();
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getApiKeyByPrefix,
      markApiKeyUsed: jest.fn(),
    });

    await expect(authenticateApiKey('Bearer malformed')).resolves.toBeNull();

    getApiKeyByPrefix.mockResolvedValue({
      id: 'key-id',
      keyHash: hashApiKey(token),
      expiresAt: '2000-01-01T00:00:00.000Z',
      revokedAt: null,
    });
    await expect(authenticateApiKey(`Bearer ${token}`)).resolves.toBeNull();

    getApiKeyByPrefix.mockResolvedValue({
      id: 'key-id',
      keyHash: hashApiKey(token),
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(authenticateApiKey(`Bearer ${token}`)).resolves.toBeNull();

    getApiKeyByPrefix.mockResolvedValue({
      id: 'key-id',
      keyHash: '0'.repeat(64),
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
    });
    await expect(authenticateApiKey(`Bearer ${token}`)).resolves.toBeNull();
  });
});
