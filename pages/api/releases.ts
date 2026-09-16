import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { requireAdminSession } from '../../apiUtils/security/auth';
import { recordAudit } from '../../apiUtils/security/audit';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

export default async function releasesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await requireAdminSession(req, res);
  if (!actor) return;

  try {
    const storage = StorageFactory.getStorage();
    const registeredReleases = await DatabaseFactory.getDatabase().listReleases();
    const filesByDirectory = new Map<string, Awaited<ReturnType<typeof storage.listFiles>>>();

    const releases = await Promise.all(
      registeredReleases.map(async (release) => {
        const slashIndex = release.path.lastIndexOf('/');
        const directory = release.path.slice(0, slashIndex);
        const fileName = release.path.slice(slashIndex + 1);
        let files = filesByDirectory.get(directory);
        if (!files) {
          files = await storage.listFiles(directory);
          filesByDirectory.set(directory, files);
        }
        const file = files.find((candidate) => candidate.name === fileName);

        return {
          ...release,
          timestamp: file?.created_at || release.timestamp,
          size: file?.metadata.size ?? 0,
          storagePresent: !!file,
        };
      })
    );

    await recordAudit({
      req,
      actor,
      action: 'release.list',
      outcome: 'success',
      httpStatus: 200,
      metadata: { count: releases.length },
    });
    res.status(200).json({ releases });
  } catch (error) {
    await recordAudit({ req, actor, action: 'release.list', outcome: 'failure', httpStatus: 500 });
    console.error('Failed to fetch releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
}
