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
    const directories = await storage.listDirectories('updates/');

    const releasesWithCommitHash = await DatabaseFactory.getDatabase().listReleases();

    const releases = [];
    for (const directory of directories) {
      const folderPath = `updates/${directory}`;
      const files = await storage.listFiles(folderPath);
      const runtimeVersion = directory;

      for (const file of files) {
        const release = releasesWithCommitHash.find((r) => r.path === `${folderPath}/${file.name}`);
        const commitHash = release ? release.commitHash : null;
        releases.push({
          id: release?.id ?? null,
          path: release?.path || `${folderPath}/${file.name}`,
          runtimeVersion,
          timestamp: file.created_at,
          size: file.metadata.size,
          commitHash,
          commitMessage: release?.commitMessage,
        });
      }
    }

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
