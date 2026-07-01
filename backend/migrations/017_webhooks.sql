CREATE TABLE IF NOT EXISTS user_webhooks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_name          TEXT NOT NULL,
    target_url          TEXT NOT NULL,
    secret              TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_webhooks_lookup
    ON user_webhooks(user_id, event_name, is_active);
