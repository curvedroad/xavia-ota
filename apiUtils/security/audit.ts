import { randomUUID } from 'crypto';
import { NextApiRequest } from 'next';

import { AuditActor } from '../database/DatabaseInterface';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { getLogger } from '../logger';
import { getRequestContext } from './request';

const logger = getLogger('audit');

export async function recordAudit(input: {
  req?: NextApiRequest;
  actor: AuditActor;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  httpStatus: number;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const request = input.req ? getRequestContext(input.req) : undefined;

  try {
    await DatabaseFactory.getDatabase().createAuditLog({
      requestId: request?.requestId ?? randomUUID(),
      actor: input.actor,
      action: input.action,
      outcome: input.outcome,
      httpStatus: input.httpStatus,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: request?.ipAddress,
      userAgent: request?.userAgent,
      metadata: input.metadata,
    });
  } catch (error) {
    logger.error('Failed to persist an audit log', {
      action: input.action,
      actorType: input.actor.type,
      actorId: input.actor.id,
      error,
    });
  }
}
