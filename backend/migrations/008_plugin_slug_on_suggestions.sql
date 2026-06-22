-- Track which SearchFit plugin generated each change suggestion batch

ALTER TABLE change_suggestions
    ADD COLUMN IF NOT EXISTS plugin_slug TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_change_suggestions_plugin_slug
    ON change_suggestions (plugin_slug);
