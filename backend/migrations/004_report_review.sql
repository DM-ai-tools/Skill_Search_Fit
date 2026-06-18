-- Report Review & Auto-Publish Pipeline

CREATE TYPE report_status AS ENUM ('uploaded', 'extracting', 'ready', 'failed');
CREATE TYPE change_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE change_type AS ENUM ('metadata', 'schema', 'content', 'technical', 'capture-form');
CREATE TYPE change_priority AS ENUM ('High', 'Medium', 'Low');
CREATE TYPE change_destination AS ENUM ('WordPress', 'Webflow', 'Wix', 'Mailchimp');

CREATE TABLE report_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename        VARCHAR(500) NOT NULL DEFAULT 'pasted-report',
    status          report_status NOT NULL DEFAULT 'uploaded',
    raw_content     TEXT NOT NULL,
    extract_error   TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_reviews_user_id ON report_reviews (user_id);
CREATE INDEX idx_report_reviews_created_at ON report_reviews (created_at DESC);

CREATE TABLE report_changes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id        UUID NOT NULL REFERENCES report_reviews(id) ON DELETE CASCADE,
    page_url         TEXT NOT NULL,
    change_type      change_type NOT NULL,
    priority         change_priority NOT NULL,
    impact_score     SMALLINT NULL CHECK (impact_score BETWEEN 0 AND 10),
    destination      change_destination NOT NULL,
    field_label      TEXT NOT NULL,
    current_state    TEXT NOT NULL,
    proposed_content TEXT NOT NULL,
    edited_content   TEXT NULL,
    source_excerpt   TEXT NULL,
    approval_status  change_status NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_changes_report_id ON report_changes (report_id);
CREATE INDEX idx_report_changes_approval ON report_changes (report_id, approval_status);

CREATE TABLE publish_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id       UUID NOT NULL REFERENCES report_reviews(id) ON DELETE CASCADE,
    destination     change_destination NOT NULL,
    dry_run         BOOLEAN NOT NULL DEFAULT TRUE,
    items_submitted INTEGER NOT NULL DEFAULT 0,
    result          JSONB NOT NULL DEFAULT '[]',
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publish_audit_log_report_id ON publish_audit_log (report_id);
CREATE INDEX idx_publish_audit_log_user_id ON publish_audit_log (user_id);
CREATE INDEX idx_publish_audit_log_published_at ON publish_audit_log (published_at DESC);

CREATE TRIGGER trg_report_reviews_updated_at
    BEFORE UPDATE ON report_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_report_changes_updated_at
    BEFORE UPDATE ON report_changes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
