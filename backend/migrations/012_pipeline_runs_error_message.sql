-- Persist failure reason on pipeline runs

ALTER TABLE pipeline_runs
    ADD COLUMN IF NOT EXISTS error_message TEXT NULL;
