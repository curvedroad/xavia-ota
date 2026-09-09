import { Pool } from 'pg';

import {
  ApiKeyRecord,
  AuditLogInput,
  AuditLogRecord,
  DatabaseInterface,
  Release,
  Tracking,
  TrackingMetrics,
} from './DatabaseInterface';
import { Tables } from './DatabaseFactory';

export class PostgresDatabase implements DatabaseInterface {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      options: process.env.POSTGRES_OPTIONS,
    });
  }
  async getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp,
        commit_hash as "commitHash", commit_message as "commitMessage", update_id as "updateId"
      FROM ${Tables.RELEASES} WHERE runtime_version = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [runtimeVersion]);
    return rows[0] || null;
  }
  async getReleaseByPath(path: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp,
        commit_hash as "commitHash", commit_message as "commitMessage", update_id as "updateId"
      FROM ${Tables.RELEASES} WHERE path = $1
    `;
    const { rows } = await this.pool.query(query, [path]);
    return rows[0] || null;
  }

  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    const query = `
      INSERT INTO ${Tables.RELEASES_TRACKING} (release_id, platform)
      VALUES ($1, $2)
      RETURNING id, release_id as "releaseId", download_timestamp as "downloadTimestamp", platform
    `;
    const values = [tracking.releaseId, tracking.platform];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE release_id = $1
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query, [releaseId]);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    const query = `
      INSERT INTO ${Tables.RELEASES} (runtime_version, path, timestamp, commit_hash, commit_message, update_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash", update_id as "updateId"
    `;

    const values = [
      release.runtimeVersion,
      release.path,
      release.timestamp,
      release.commitHash,
      release.commitMessage,
      release.updateId,
    ];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getRelease(id: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp,
        commit_hash as "commitHash", commit_message as "commitMessage", update_id as "updateId"
      FROM ${Tables.RELEASES} WHERE id = $1
    `;

    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async listReleases(): Promise<Release[]> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash", commit_message as "commitMessage"
      FROM ${Tables.RELEASES}
      ORDER BY timestamp DESC
    `;

    const { rows } = await this.pool.query(query);
    return rows;
  }

  async createApiKey(apiKey: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    createdBy: string;
    expiresAt: string;
  }): Promise<ApiKeyRecord> {
    const query = `
      INSERT INTO ${Tables.API_KEYS} (name, key_prefix, key_hash, created_by, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, key_prefix as "keyPrefix", key_hash as "keyHash",
        created_by as "createdBy", created_at as "createdAt", expires_at as "expiresAt",
        last_used_at as "lastUsedAt", revoked_at as "revokedAt"
    `;
    const { rows } = await this.pool.query(query, [
      apiKey.name,
      apiKey.keyPrefix,
      apiKey.keyHash,
      apiKey.createdBy,
      apiKey.expiresAt,
    ]);
    return rows[0];
  }

  async getApiKeyByPrefix(keyPrefix: string): Promise<ApiKeyRecord | null> {
    const query = `
      SELECT id, name, key_prefix as "keyPrefix", key_hash as "keyHash",
        created_by as "createdBy", created_at as "createdAt", expires_at as "expiresAt",
        last_used_at as "lastUsedAt", revoked_at as "revokedAt"
      FROM ${Tables.API_KEYS}
      WHERE key_prefix = $1
      LIMIT 1
    `;
    const { rows } = await this.pool.query(query, [keyPrefix]);
    return rows[0] || null;
  }

  async listApiKeys(): Promise<Omit<ApiKeyRecord, 'keyHash'>[]> {
    const query = `
      SELECT id, name, key_prefix as "keyPrefix", created_by as "createdBy",
        created_at as "createdAt", expires_at as "expiresAt",
        last_used_at as "lastUsedAt", revoked_at as "revokedAt"
      FROM ${Tables.API_KEYS}
      ORDER BY created_at DESC
    `;
    const { rows } = await this.pool.query(query);
    return rows;
  }

  async markApiKeyUsed(id: string): Promise<void> {
    await this.pool.query(`UPDATE ${Tables.API_KEYS} SET last_used_at = NOW() WHERE id = $1`, [id]);
  }

  async revokeApiKey(id: string): Promise<ApiKeyRecord | null> {
    const query = `
      UPDATE ${Tables.API_KEYS}
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1
      RETURNING id, name, key_prefix as "keyPrefix", key_hash as "keyHash",
        created_by as "createdBy", created_at as "createdAt", expires_at as "expiresAt",
        last_used_at as "lastUsedAt", revoked_at as "revokedAt"
    `;
    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async createAuditLog(log: AuditLogInput): Promise<void> {
    const query = `
      INSERT INTO ${Tables.AUDIT_LOGS} (
        request_id, actor_type, actor_id, action, outcome, http_status,
        target_type, target_id, ip_address, user_agent, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, '')::inet, $10, $11::jsonb)
    `;
    await this.pool.query(query, [
      log.requestId,
      log.actor.type,
      log.actor.id,
      log.action,
      log.outcome,
      log.httpStatus,
      log.targetType ?? null,
      log.targetId ?? null,
      log.ipAddress ?? null,
      log.userAgent ?? null,
      JSON.stringify(log.metadata ?? {}),
    ]);
  }

  async listAuditLogs(limit: number, beforeId?: string | null): Promise<AuditLogRecord[]> {
    const query = `
      SELECT id, created_at as "createdAt", request_id as "requestId",
        actor_type as "actorType", actor_id as "actorId", action, outcome,
        http_status as "httpStatus", target_type as "targetType", target_id as "targetId",
        host(ip_address) as "ipAddress", user_agent as "userAgent", metadata
      FROM ${Tables.AUDIT_LOGS}
      WHERE ($2::bigint IS NULL OR id < $2::bigint)
      ORDER BY id DESC
      LIMIT $1
    `;
    const { rows } = await this.pool.query(query, [limit, beforeId ?? null]);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      requestId: row.requestId,
      actor: { type: row.actorType, id: row.actorId },
      action: row.action,
      outcome: row.outcome,
      httpStatus: row.httpStatus,
      targetType: row.targetType,
      targetId: row.targetId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: row.metadata,
    }));
  }
}
