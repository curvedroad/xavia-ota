export interface Release {
  id: string;
  runtimeVersion: string;
  path: string;
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  updateId?: string;
}

export interface Tracking {
  id: string;
  releaseId: string;
  downloadTimestamp: string;
  platform: string;
}

export interface TrackingMetrics {
  platform: string;
  count: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditActor {
  type: 'oauth_user' | 'api_key' | 'system';
  id: string;
}

export interface AuditLogInput {
  requestId: string;
  actor: AuditActor;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  httpStatus: number;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRecord extends AuditLogInput {
  id: string;
  createdAt: string;
}

export interface DatabaseInterface {
  createRelease(release: Omit<Release, 'id'>): Promise<Release>;
  getRelease(id: string): Promise<Release | null>;
  getReleaseByPath(path: string): Promise<Release | null>;
  listReleases(): Promise<Release[]>;
  createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking>;
  getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]>;
  getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null>;
  createApiKey(apiKey: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    createdBy: string;
    expiresAt: string;
  }): Promise<ApiKeyRecord>;
  getApiKeyByPrefix(keyPrefix: string): Promise<ApiKeyRecord | null>;
  listApiKeys(): Promise<Omit<ApiKeyRecord, 'keyHash'>[]>;
  markApiKeyUsed(id: string): Promise<void>;
  revokeApiKey(id: string): Promise<ApiKeyRecord | null>;
  createAuditLog(log: AuditLogInput): Promise<void>;
  listAuditLogs(limit: number, beforeId?: string | null): Promise<AuditLogRecord[]>;
}
