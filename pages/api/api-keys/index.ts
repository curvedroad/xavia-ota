import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { issueApiKey } from '../../../apiUtils/security/apiKeys';
import { requireAdminSession } from '../../../apiUtils/security/auth';
import { recordAudit } from '../../../apiUtils/security/audit';
import { isSameOriginRequest } from '../../../apiUtils/security/request';

export default async function apiKeysHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;

  if (req.method === 'GET') {
    try {
      const apiKeys = await DatabaseFactory.getDatabase().listApiKeys();
      await recordAudit({
        req,
        actor,
        action: 'api_key.list',
        outcome: 'success',
        httpStatus: 200,
      });
      res.status(200).json({ apiKeys });
    } catch (error) {
      console.error('Failed to list API keys:', error);
      await recordAudit({
        req,
        actor,
        action: 'api_key.list',
        outcome: 'failure',
        httpStatus: 500,
      });
      res.status(500).json({ error: 'Failed to list API keys' });
    }
    return;
  }

  if (!isSameOriginRequest(req)) {
    await recordAudit({ req, actor, action: 'api_key.create', outcome: 'denied', httpStatus: 403 });
    res.status(403).json({ error: 'Invalid request origin' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  const expiresInDays = Number(req.body?.expiresInDays ?? 90);
  try {
    const apiKey = await issueApiKey({ name, createdBy: actor.id, expiresInDays });
    await recordAudit({
      req,
      actor,
      action: 'api_key.create',
      outcome: 'success',
      httpStatus: 201,
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { name: apiKey.name, keyPrefix: apiKey.keyPrefix, expiresAt: apiKey.expiresAt },
    });
    res.status(201).json({ apiKey });
  } catch (error) {
    const status = error instanceof Error && error.message.startsWith('API key') ? 400 : 500;
    await recordAudit({
      req,
      actor,
      action: 'api_key.create',
      outcome: 'failure',
      httpStatus: status,
    });
    res.status(status).json({
      error: status === 400 && error instanceof Error ? error.message : 'Failed to create API key',
    });
  }
}
