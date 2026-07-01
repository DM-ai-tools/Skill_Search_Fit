-- Pipeline runs with competitor pre-analysis and inter-skill review pauses

CREATE TABLE pipeline_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id         TEXT NOT NULL,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'analyzing_competitors',
    current_skill_index INT NOT NULL DEFAULT 0,
    base_inputs         JSONB NOT NULL DEFAULT '{}',
    competitor_data     JSONB NOT NULL DEFAULT '{}',
    competitor_failed   BOOLEAN NOT NULL DEFAULT FALSE,
    prior_markdown      JSONB NOT NULL DEFAULT '[]',
    step_results        JSONB NOT NULL DEFAULT '[]',
    pending_inputs      JSONB NULL,
    edited_inputs_count INT NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_runs_user ON pipeline_runs (user_id, created_at DESC);
CREATE INDEX idx_pipeline_runs_project ON pipeline_runs (project_id, pipeline_id);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs (status) WHERE status IN ('paused_for_review', 'analyzing_competitors', 'running');
