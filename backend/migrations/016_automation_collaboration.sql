-- Scheduling + collaboration baseline

CREATE TABLE IF NOT EXISTS scheduled_workflows (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_type       TEXT NOT NULL, -- pipeline|plugin|crawl
    workflow_id         TEXT NOT NULL,
    cron_expression     TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_comments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_type       TEXT NOT NULL, -- change_suggestion|pipeline_run|report
    artifact_id         UUID NOT NULL,
    message             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_workflows_project
    ON scheduled_workflows(project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_artifact_comments_lookup
    ON artifact_comments(project_id, artifact_type, artifact_id, created_at DESC);
