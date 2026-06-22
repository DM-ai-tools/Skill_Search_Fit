-- Per-user platform integrations

CREATE TYPE integration_platform AS ENUM ('WordPress', 'Shopify', 'Webflow', 'Wix', 'Squarespace', 'Mailchimp');
CREATE TYPE integration_status AS ENUM ('connected', 'reauth', 'disconnected');

CREATE TABLE user_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        integration_platform NOT NULL,
    site_url        TEXT NOT NULL,
    -- base64(username:appPassword) — decoded server-side only, never returned to frontend
    access_token    TEXT NOT NULL,
    status          integration_status NOT NULL DEFAULT 'connected',
    last_used_at    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, platform)
);

CREATE INDEX idx_user_integrations_user_id ON user_integrations (user_id);

CREATE TABLE integration_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        integration_platform NOT NULL,
    action          VARCHAR(50) NOT NULL,
    status_before   integration_status NULL,
    status_after    integration_status NULL,
    -- credentials are never stored here
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_audit_log_user_id ON integration_audit_log (user_id);
CREATE INDEX idx_integration_audit_log_created_at ON integration_audit_log (created_at DESC);

CREATE TRIGGER trg_user_integrations_updated_at
    BEFORE UPDATE ON user_integrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
