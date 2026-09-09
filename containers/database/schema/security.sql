CREATE TABLE IF NOT EXISTS ota_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL UNIQUE,
    key_hash CHAR(64) NOT NULL UNIQUE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ota_api_keys_active
    ON ota_api_keys (key_prefix)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ota_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_id UUID NOT NULL,
    actor_type VARCHAR(20) NOT NULL
        CHECK (actor_type IN ('oauth_user', 'api_key', 'system')),
    actor_id VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    outcome VARCHAR(16) NOT NULL
        CHECK (outcome IN ('success', 'failure', 'denied')),
    http_status SMALLINT NOT NULL CHECK (http_status BETWEEN 100 AND 599),
    target_type VARCHAR(64),
    target_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ota_audit_logs_created_at
    ON ota_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_audit_logs_actor
    ON ota_audit_logs (actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_audit_logs_action
    ON ota_audit_logs (action, created_at DESC);
