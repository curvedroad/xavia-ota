import { randomUUID } from 'crypto';
import { isIP } from 'net';
import { NextApiRequest } from 'next';

export interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getRequestContext(req: NextApiRequest): RequestContext {
  const suppliedRequestId = firstHeader(req.headers['x-request-id']);
  const forwardedFor = firstHeader(req.headers['x-forwarded-for'])?.split(',')[0]?.trim();
  const remoteAddress = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  const ipAddress =
    [forwardedFor, remoteAddress].find((value) => value && isIP(value)) || undefined;

  return {
    requestId:
      suppliedRequestId && UUID_PATTERN.test(suppliedRequestId) ? suppliedRequestId : randomUUID(),
    ipAddress,
    userAgent: firstHeader(req.headers['user-agent'])?.slice(0, 1024),
  };
}

export function isSameOriginRequest(req: NextApiRequest): boolean {
  const expectedOrigin = process.env.NEXTAUTH_URL || process.env.HOST;
  const origin = firstHeader(req.headers.origin);

  if (!expectedOrigin || !origin) return false;

  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
