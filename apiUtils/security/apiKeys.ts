import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { AuditActor } from '../database/DatabaseInterface';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { UpdateChannel } from './channel';

const API_KEY_PATTERN = /^nbota_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

export interface IssuedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  token: string;
  expiresAt: string;
  channel: UpdateChannel;
}

export interface AuthenticatedApiKey {
  actor: AuditActor;
  channel: UpdateChannel;
}

export async function issueApiKey(input: {
  name: string;
  createdBy: string;
  expiresInDays: number;
  channel: UpdateChannel;
}): Promise<IssuedApiKey> {
  const name = input.name.trim();
  if (!name || name.length > 100)
    throw new Error('API key name must be between 1 and 100 characters');
  if (
    !Number.isInteger(input.expiresInDays) ||
    input.expiresInDays < 1 ||
    input.expiresInDays > 365
  ) {
    throw new Error('API key expiration must be between 1 and 365 days');
  }

  const keyPrefix = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const token = `nbota_${keyPrefix}_${secret}`;
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const record = await DatabaseFactory.getDatabase().createApiKey({
    name,
    channel: input.channel,
    keyPrefix,
    keyHash: hashApiKey(token),
    createdBy: input.createdBy,
    expiresAt,
  });

  return {
    id: record.id,
    name: record.name,
    keyPrefix,
    token,
    expiresAt,
    channel: record.channel,
  };
}

export async function authenticateApiKey(
  authorization: string | undefined
): Promise<AuthenticatedApiKey | null> {
  if (!authorization?.startsWith('Bearer ')) return null;

  const token = authorization.slice('Bearer '.length).trim();
  const match = API_KEY_PATTERN.exec(token);
  if (!match) return null;

  const record = await DatabaseFactory.getDatabase().getApiKeyByPrefix(match[1]);
  if (
    !record ||
    record.revokedAt ||
    !record.expiresAt ||
    new Date(record.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  const actualHash = Buffer.from(hashApiKey(token), 'hex');
  const expectedHash = Buffer.from(record.keyHash, 'hex');
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash))
    return null;

  await DatabaseFactory.getDatabase().markApiKeyUsed(record.id);
  return { actor: { type: 'api_key', id: record.id }, channel: record.channel };
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
