import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../../../apiUtils/security/auth';
import { recordAudit } from '../../../apiUtils/security/audit';
import { isSameOriginRequest } from '../../../apiUtils/security/request';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function apiKeyHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;
  if (!isSameOriginRequest(req)) {
    await recordAudit({ req, actor, action: 'api_key.revoke', outcome: 'denied', httpStatus: 403 });
    res.status(403).json({ error: 'Invalid request origin' });
    return;
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !UUID_PATTERN.test(id)) {
    await recordAudit({
      req,
      actor,
      action: 'api_key.revoke',
      outcome: 'failure',
      httpStatus: 400,
      targetType: 'api_key',
      targetId: typeof id === 'string' ? id.slice(0, 255) : undefined,
    });
    res.status(400).json({ error: 'Invalid API key ID' });
    return;
  }

  try {
    const apiKey = await DatabaseFactory.getDatabase().revokeApiKey(id);
    if (!apiKey) {
      await recordAudit({
        req,
        actor,
        action: 'api_key.revoke',
        outcome: 'failure',
        httpStatus: 404,
        targetType: 'api_key',
        targetId: id,
      });
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    await recordAudit({
      req,
      actor,
      action: 'api_key.revoke',
      outcome: 'success',
      httpStatus: 200,
      targetType: 'api_key',
      targetId: id,
      metadata: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    await recordAudit({
      req,
      actor,
      action: 'api_key.revoke',
      outcome: 'failure',
      httpStatus: 500,
      targetType: 'api_key',
      targetId: id,
    });
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
}
