-- Website analysis cache for AI-powered URL scan & plugin autofill

CREATE TABLE IF NOT EXISTS website_analysis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url             TEXT NOT NULL,
    url_normalized  TEXT NOT NULL UNIQUE,
    analysis_json   JSONB NOT NULL DEFAULT '{}',
    scan_status     TEXT NOT NULL DEFAULT 'pending'
        CHECK (scan_status IN ('pending', 'scanning', 'completed', 'failed', 'partial')),
    error_message   TEXT,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_website_analysis_expires ON website_analysis(expires_at);
CREATE INDEX IF NOT EXISTS idx_website_analysis_user ON website_analysis(user_id);
