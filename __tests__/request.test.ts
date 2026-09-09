import { createMocks } from 'node-mocks-http';

import { getRequestContext, isSameOriginRequest } from '../apiUtils/security/request';

describe('request security helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NEXTAUTH_URL: 'https://updates.newsboy.news' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts only the configured origin', () => {
    const sameOrigin = createMocks({
      headers: { origin: 'https://updates.newsboy.news' },
    }).req;
    const crossOrigin = createMocks({
      headers: { origin: 'https://attacker.example' },
    }).req;
    const missingOrigin = createMocks().req;

    expect(isSameOriginRequest(sameOrigin)).toBe(true);
    expect(isSameOriginRequest(crossOrigin)).toBe(false);
    expect(isSameOriginRequest(missingOrigin)).toBe(false);
  });

  it('accepts only a UUID request ID and normalizes the forwarded IP', () => {
    const suppliedId = '123e4567-e89b-42d3-a456-426614174000';
    const { req } = createMocks({
      headers: {
        'x-request-id': suppliedId,
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'test-agent',
      },
    });

    expect(getRequestContext(req)).toEqual({
      requestId: suppliedId,
      ipAddress: '203.0.113.5',
      userAgent: 'test-agent',
    });
  });

  it('replaces an untrusted request ID', () => {
    const { req } = createMocks({ headers: { 'x-request-id': 'not-a-uuid' } });

    expect(getRequestContext(req).requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
