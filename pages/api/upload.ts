import fs from 'fs';
import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { getLogger } from '../../apiUtils/logger';
import { authenticateApiKey } from '../../apiUtils/security/apiKeys';
import { recordAudit } from '../../apiUtils/security/audit';
import { isSafeArchivePath, isValidRuntimeVersion } from '../../apiUtils/security/input';
import { getRequestContext } from '../../apiUtils/security/request';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const COMMIT_HASH_PATTERN = /^[a-f0-9]{7,64}$/i;
const logger = getLogger('upload');

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function uploadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const actor = await authenticateApiKey(getBearerHeader(req));
  if (!actor) {
    logger.warn('Rejected upload authentication', getRequestContext(req));
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'A valid upload API key is required' });
    return;
  }

  const contentLength = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    await recordAudit({
      req,
      actor,
      action: 'release.upload',
      outcome: 'failure',
      httpStatus: 413,
    });
    res.status(413).json({ error: 'Upload is too large' });
    return;
  }

  const form = formidable({
    maxFiles: 1,
    maxFields: 4,
    maxFileSize: MAX_UPLOAD_BYTES,
    maxFieldsSize: 64 * 1024,
    allowEmptyFiles: false,
  });
  let temporaryFilePath: string | undefined;
  let runtimeVersion: string | undefined;

  try {
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    runtimeVersion = fields.runtimeVersion?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = (fields.commitMessage?.[0] || 'No message provided').trim();
    temporaryFilePath = file?.filepath;

    if (!file || !runtimeVersion || !commitHash) {
      throw new UploadValidationError('Missing file, runtime version or commit hash');
    }
    if (!isValidRuntimeVersion(runtimeVersion)) {
      throw new UploadValidationError('Invalid runtime version');
    }
    if (!COMMIT_HASH_PATTERN.test(commitHash)) {
      throw new UploadValidationError('Invalid commit hash');
    }
    if (commitMessage.length > 255) {
      throw new UploadValidationError('Commit message is too long');
    }

    let zipContent: Buffer;
    try {
      zipContent = await ZipHelper.loadZipFile(file.filepath);
    } catch {
      throw new UploadValidationError('Invalid release archive');
    }

    const metadataJsonFile = await readRequiredJsonFile(zipContent, 'metadata.json');
    const expoConfigJsonFile = await readRequiredJsonFile(zipContent, 'expoconfig.json');
    let metadata: unknown;
    let expoConfig: unknown;
    try {
      metadata = JSON.parse(metadataJsonFile.toString('utf8'));
      expoConfig = JSON.parse(expoConfigJsonFile.toString('utf8'));
    } catch {
      throw new UploadValidationError('Release metadata is not valid JSON');
    }
    validateReleaseMetadata(metadata);
    validateExpoRuntimeVersion(expoConfig, runtimeVersion);

    const updateHash = HashHelper.createHash(metadataJsonFile, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);
    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const updatePath = `updates/${runtimeVersion}`;
    const path = await storage.uploadFile(`${updatePath}/${timestamp}.zip`, zipContent);

    const release = await DatabaseFactory.getDatabase().createRelease({
      path,
      runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
      updateId,
    });

    await recordAudit({
      req,
      actor,
      action: 'release.upload',
      outcome: 'success',
      httpStatus: 200,
      targetType: 'release',
      targetId: release.id,
      metadata: { runtimeVersion, commitHash, updateId },
    });
    res.status(200).json({ success: true, path, releaseId: release.id });
  } catch (error) {
    const status = error instanceof UploadValidationError ? 400 : 500;
    await recordAudit({
      req,
      actor,
      action: 'release.upload',
      outcome: 'failure',
      httpStatus: status,
      metadata: runtimeVersion ? { runtimeVersion } : undefined,
    });
    console.error('Upload error:', error);
    res.status(status).json({
      error: error instanceof UploadValidationError ? error.message : 'Upload failed',
    });
  } finally {
    if (temporaryFilePath) {
      fs.promises.unlink(temporaryFilePath).catch(() => undefined);
    }
  }
}

function getBearerHeader(req: NextApiRequest): string | undefined {
  const authorization = req.headers.authorization;
  return Array.isArray(authorization) ? authorization[0] : authorization;
}

class UploadValidationError extends Error {}

async function readRequiredJsonFile(zip: Buffer, filePath: string): Promise<Buffer> {
  try {
    return await ZipHelper.getFileFromZip(zip, filePath, MAX_METADATA_BYTES);
  } catch {
    throw new UploadValidationError(`Missing or invalid ${filePath}`);
  }
}

function validateReleaseMetadata(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.fileMetadata)) {
    throw new UploadValidationError('Release metadata has an invalid structure');
  }

  const platforms = ['ios', 'android'].filter((platform) => platform in value.fileMetadata);
  if (platforms.length === 0) {
    throw new UploadValidationError('Release metadata has no supported platform');
  }

  for (const platform of platforms) {
    const platformMetadata = value.fileMetadata[platform];
    if (
      !isRecord(platformMetadata) ||
      !isSafeArchivePath(platformMetadata.bundle) ||
      !Array.isArray(platformMetadata.assets)
    ) {
      throw new UploadValidationError(`Release metadata for ${platform} is invalid`);
    }

    const validAssets = platformMetadata.assets.every(
      (asset) =>
        isRecord(asset) &&
        isSafeArchivePath(asset.path) &&
        typeof asset.ext === 'string' &&
        asset.ext.length > 0 &&
        asset.ext.length <= 32
    );
    if (!validAssets) {
      throw new UploadValidationError(`Release assets for ${platform} are invalid`);
    }
  }
}

function validateExpoRuntimeVersion(value: unknown, runtimeVersion: string): void {
  if (!isRecord(value)) {
    throw new UploadValidationError('expoconfig.json has an invalid structure');
  }
  const nestedExpo = isRecord(value.expo) ? value.expo : undefined;
  const configuredRuntimeVersion = value.runtimeVersion ?? nestedExpo?.runtimeVersion;
  if (configuredRuntimeVersion !== runtimeVersion) {
    throw new UploadValidationError('Runtime version does not match expoconfig.json');
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
