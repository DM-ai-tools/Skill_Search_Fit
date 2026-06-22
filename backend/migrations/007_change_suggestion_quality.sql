-- Change suggestion quality fields: location, needs_review, wider impact_score range

ALTER TABLE change_suggestions
    ADD COLUMN IF NOT EXISTS base_url TEXT NULL;

ALTER TABLE suggestion_changes
    ADD COLUMN IF NOT EXISTS location TEXT NULL,
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS review_reason TEXT NULL;

ALTER TABLE suggestion_changes
    DROP CONSTRAINT IF EXISTS report_changes_impact_score_check;

ALTER TABLE suggestion_changes
    DROP CONSTRAINT IF EXISTS suggestion_changes_impact_score_check;

ALTER TABLE suggestion_changes
    ADD CONSTRAINT suggestion_changes_impact_score_check
        CHECK (impact_score IS NULL OR (impact_score BETWEEN 1 AND 100));
