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
  try {
    const auditLogs = await DatabaseFactory.getDatabase().listAuditLogs(limit);
    await recordAudit({
      req,
      actor,
      action: 'audit_log.list',
      outcome: 'success',
      httpStatus: 200,
      metadata: { limit },
    });
    res.status(200).json({ auditLogs });
  } catch (error) {
    console.error('Failed to list audit logs:', error);
    await recordAudit({
      req,
      actor,
      action: 'audit_log.list',
      outcome: 'failure',
      httpStatus: 500,
      metadata: { limit },
    });
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
}
