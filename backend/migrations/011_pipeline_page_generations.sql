-- Pipeline page generation jobs (Full Content Page Pipeline only)

CREATE TABLE pipeline_page_generations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_run_id     UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'generating',
    regeneration_count  INT NOT NULL DEFAULT 0,
    user_feedback       TEXT NULL,
    job_data            JSONB NOT NULL DEFAULT '{}',
    result_html         TEXT NULL,
    page_title          TEXT NULL,
    meta_description    TEXT NULL,
    slug                TEXT NULL,
    full_url            TEXT NULL,
    approved_at         TIMESTAMPTZ NULL,
    deployed_at         TIMESTAMPTZ NULL,
    wordpress_draft_url TEXT NULL,
    error_message       TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pipeline_page_gen_run ON pipeline_page_generations (pipeline_run_id);
CREATE INDEX idx_pipeline_page_gen_user ON pipeline_page_generations (user_id, created_at DESC);
