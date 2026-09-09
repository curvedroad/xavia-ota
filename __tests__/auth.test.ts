import { createMocks } from 'node-mocks-http';
import { getServerSession } from 'next-auth';

import {
  isAllowedAdminEmail,
  isAllowedGoogleProfile,
  requireAdminSession,
} from '../apiUtils/security/auth';
import { recordAudit } from '../apiUtils/security/audit';

jest.mock('next-auth', () => ({
  ...jest.requireActual('next-auth'),
  getServerSession: jest.fn(),
}));
jest.mock('../apiUtils/security/audit');

describe('Google OAuth allowlist', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_ALLOWED_DOMAIN: 'curved-road.com',
      GOOGLE_ALLOWED_EMAILS: 'admin@curved-road.com,owner@curved-road.com',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows only a verified, explicitly listed domain account', () => {
    expect(
      isAllowedGoogleProfile({
        email: 'ADMIN@curved-road.com',
        email_verified: true,
        hd: 'curved-road.com',
      })
    ).toBe(true);
  });

  it.each([
    [{ email: 'other@curved-road.com', email_verified: true, hd: 'curved-road.com' }],
    [{ email: 'admin@curved-road.com', email_verified: false, hd: 'curved-road.com' }],
    [{ email: 'admin@example.com', email_verified: true, hd: 'example.com' }],
    [{ email: 'admin@curved-road.com', email_verified: true }],
  ])('rejects a profile outside the complete policy', (profile) => {
    expect(isAllowedGoogleProfile(profile)).toBe(false);
  });

  it('rechecks the email allowlist for an existing session', () => {
    expect(isAllowedAdminEmail('ADMIN@curved-road.com')).toBe(true);
    expect(isAllowedAdminEmail('other@curved-road.com')).toBe(false);

    process.env.GOOGLE_ALLOWED_EMAILS = 'owner@curved-road.com';
    expect(isAllowedAdminEmail('admin@curved-road.com')).toBe(false);
  });

  it('fails closed when the allowlist is missing', () => {
    delete process.env.GOOGLE_ALLOWED_EMAILS;
    expect(
      isAllowedGoogleProfile({
        email: 'admin@curved-road.com',
        email_verified: true,
        hd: 'curved-road.com',
      })
    ).toBe(false);
  });

  it('authorizes an existing session only while its email remains allowed', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: 'admin@curved-road.com' },
    });
    const { req, res } = createMocks({ method: 'GET' });

    await expect(requireAdminSession(req, res)).resolves.toEqual({
      type: 'oauth_user',
      id: 'admin@curved-road.com',
    });

    process.env.GOOGLE_ALLOWED_EMAILS = 'owner@curved-road.com';
    await expect(requireAdminSession(req, res)).resolves.toBeNull();
    expect(res._getStatusCode()).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.authorization',
        outcome: 'denied',
        httpStatus: 403,
      })
    );
  });

  it('returns 401 without creating a database log for an anonymous request', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createMocks({ method: 'GET' });

    await expect(requireAdminSession(req, res)).resolves.toBeNull();

    expect(res._getStatusCode()).toBe(401);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
