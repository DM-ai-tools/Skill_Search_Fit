-- Audit trail for pipeline inter-skill change suggestion decisions
ALTER TABLE pipeline_runs
    ADD COLUMN IF NOT EXISTS suggestion_audit_log JSONB NOT NULL DEFAULT '[]'::jsonb;
