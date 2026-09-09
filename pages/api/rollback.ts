import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../../apiUtils/security/auth';
import { recordAudit } from '../../apiUtils/security/audit';
import { isSameOriginRequest } from '../../apiUtils/security/request';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function rollbackHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;
  if (!isSameOriginRequest(req)) {
    await recordAudit({
      req,
      actor,
      action: 'release.rollback',
      outcome: 'denied',
      httpStatus: 403,
    });
    res.status(403).json({ error: 'Invalid request origin' });
    return;
  }

  const { releaseId } = req.body;
  if (!releaseId || typeof releaseId !== 'string' || !UUID_PATTERN.test(releaseId)) {
    await recordAudit({
      req,
      actor,
      action: 'release.rollback',
      outcome: 'failure',
      httpStatus: 400,
      targetType: 'release',
      targetId: typeof releaseId === 'string' ? releaseId.slice(0, 255) : undefined,
    });
    res.status(400).json({ error: 'Invalid releaseId' });
    return;
  }

  try {
    const database = DatabaseFactory.getDatabase();
    const sourceRelease = await database.getRelease(releaseId);
    if (!sourceRelease) {
      await recordAudit({
        req,
        actor,
        action: 'release.rollback',
        outcome: 'failure',
        httpStatus: 404,
        targetType: 'release',
        targetId: releaseId,
      });
      res.status(404).json({ error: 'Release not found' });
      return;
    }

    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const newPath = `updates/${sourceRelease.runtimeVersion}/${timestamp}.zip`;
    await storage.copyFile(sourceRelease.path, newPath);

    const release = await database.createRelease({
      path: newPath,
      runtimeVersion: sourceRelease.runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash: sourceRelease.commitHash,
      commitMessage: sourceRelease.commitMessage,
      updateId: sourceRelease.updateId,
    });

    await recordAudit({
      req,
      actor,
      action: 'release.rollback',
      outcome: 'success',
      httpStatus: 200,
      targetType: 'release',
      targetId: release.id,
      metadata: { sourceReleaseId: releaseId, runtimeVersion: sourceRelease.runtimeVersion },
    });
    res.status(200).json({ success: true, newPath, releaseId: release.id });
  } catch (error) {
    await recordAudit({
      req,
      actor,
      action: 'release.rollback',
      outcome: 'failure',
      httpStatus: 500,
      targetType: 'release',
      targetId: releaseId,
    });
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Rollback failed' });
  }
}
