import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';
import { requireAdminSession } from '../../../apiUtils/security/auth';
import { recordAudit } from '../../../apiUtils/security/audit';

const logger = getLogger('trackingByReleaseHandler');

export default async function trackingByReleaseHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;

  const { release_id } = req.query;

  logger.info(`Fetching tracking data for release`, { release_id });

  if (!release_id || typeof release_id !== 'string') {
    res.status(400).json({ error: 'Release ID is required' });
    return;
  }

  try {
    const database = DatabaseFactory.getDatabase();
    const trackings = await database.getReleaseTrackingMetrics(release_id);

    await recordAudit({
      req,
      actor,
      action: 'tracking.view',
      outcome: 'success',
      httpStatus: 200,
      targetType: 'release',
      targetId: release_id,
    });
    res.status(200).json(trackings);
  } catch (error) {
    await recordAudit({
      req,
      actor,
      action: 'tracking.view',
      outcome: 'failure',
      httpStatus: 500,
      targetType: 'release',
      targetId: release_id,
    });
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
}
