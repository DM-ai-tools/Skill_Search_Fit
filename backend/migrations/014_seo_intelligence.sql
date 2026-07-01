-- Longitudinal SEO intelligence: keyword and ranking snapshots

CREATE TABLE IF NOT EXISTS seo_keywords (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    keyword         TEXT NOT NULL,
    intent          TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, project_id, keyword)
);

CREATE TABLE IF NOT EXISTS seo_rank_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id      UUID NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    rank_position   INT NULL,
    search_volume   INT NULL,
    difficulty      INT NULL,
    serp_features   JSONB NOT NULL DEFAULT '[]'::jsonb,
    source          TEXT NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(keyword_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_user_project
    ON seo_keywords(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_seo_rank_keyword_date
    ON seo_rank_snapshots(keyword_id, snapshot_date DESC);
