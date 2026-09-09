import mime from 'mime';
import { NextApiRequest, NextApiResponse } from 'next';
import nullthrows from 'nullthrows';

import { UpdateHelper } from '../../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { isSafeArchivePath, isValidRuntimeVersion } from '../../apiUtils/security/input';

export default async function assetsEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Expected GET.' });
    return;
  }

  const { asset: assetPath, runtimeVersion, platform } = req.query;

  if (!isSafeArchivePath(assetPath)) {
    res.statusCode = 400;
    res.json({ error: 'Invalid asset path.' });
    return;
  }

  if (platform !== 'ios' && platform !== 'android') {
    res.statusCode = 400;
    res.json({ error: 'No platform provided. Expected "ios" or "android".' });
    return;
  }

  if (!isValidRuntimeVersion(runtimeVersion)) {
    res.statusCode = 400;
    res.json({ error: 'Invalid runtimeVersion.' });
    return;
  }

  try {
    const updateBundlePath = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync(
      runtimeVersion
    );
    const zip = await ZipHelper.getZipFromStorage(updateBundlePath);

    const { metadataJson } = await UpdateHelper.getMetadataAsync({
      updateBundlePath,
      runtimeVersion,
    });

    const platformMetadata = metadataJson?.fileMetadata?.[platform];
    if (!platformMetadata || !Array.isArray(platformMetadata.assets)) {
      throw new Error('Release metadata is invalid');
    }
    const assetMetadata = platformMetadata.assets.find((asset: any) => asset.path === assetPath);
    const isLaunchAsset = platformMetadata.bundle === assetPath;
    if (!assetMetadata && !isLaunchAsset) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }

    const asset = await ZipHelper.getFileFromZip(zip, assetPath);

    res.statusCode = 200;
    res.setHeader('cache-control', 'private, max-age=0');
    res.setHeader(
      'content-type',
      isLaunchAsset ? 'application/javascript' : nullthrows(mime.getType(assetMetadata.ext))
    );
    res.end(asset);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.json({ error: 'Failed to load asset.' });
  }
}
