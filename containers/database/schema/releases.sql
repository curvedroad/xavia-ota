CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(32) NOT NULL DEFAULT 'production'
    CHECK (channel IN ('production', 'qa')),
  runtime_version VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  commit_hash VARCHAR(255) NOT NULL,
  commit_message VARCHAR(255) NOT NULL,
  update_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_releases_channel_runtime_timestamp
  ON releases (channel, runtime_version, timestamp DESC);
