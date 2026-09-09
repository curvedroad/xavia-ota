import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../../apiUtils/security/auth';
import { recordAudit } from '../../apiUtils/security/audit';

export default async function auditLogsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;

  const requestedLimit = Number(
    Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  );
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
  const beforeIdMaybeArray = req.query.beforeId;
  const beforeId = Array.isArray(beforeIdMaybeArray) ? beforeIdMaybeArray[0] : beforeIdMaybeArray;
  if (beforeId !== undefined && !/^[1-9]\d*$/.test(beforeId)) {
    res.status(400).json({ error: 'Invalid beforeId' });
    return;
  }

  try {
    const rows = await DatabaseFactory.getDatabase().listAuditLogs(limit + 1, beforeId);
    const hasMore = rows.length > limit;
    const auditLogs = rows.slice(0, limit);
    const nextCursor = hasMore ? auditLogs.at(-1)?.id ?? null : null;
    await recordAudit({
      req,
      actor,
      action: 'audit_log.list',
      outcome: 'success',
      httpStatus: 200,
      metadata: { limit, beforeId: beforeId ?? null },
    });
    res.status(200).json({ auditLogs, nextCursor });
  } catch (error) {
    console.error('Failed to list audit logs:', error);
    await recordAudit({
      req,
      actor,
      action: 'audit_log.list',
      outcome: 'failure',
      httpStatus: 500,
      metadata: { limit, beforeId: beforeId ?? null },
    });
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
}
