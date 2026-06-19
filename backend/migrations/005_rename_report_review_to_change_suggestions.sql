-- Change Suggestions rename migration
-- Renames all Report Review DB objects to Change Suggestions equivalents.

-- 1. Rename enum type
ALTER TYPE report_status RENAME TO suggestion_status;

-- 2. Rename parent table
ALTER TABLE report_reviews RENAME TO change_suggestions;

-- 3. Rename child table
ALTER TABLE report_changes RENAME TO suggestion_changes;

-- 4. Rename FK column in suggestion_changes
ALTER TABLE suggestion_changes RENAME COLUMN report_id TO suggestion_id;

-- 5. Rename FK column in publish_audit_log
ALTER TABLE publish_audit_log RENAME COLUMN report_id TO suggestion_id;

-- 6. Rename indexes
ALTER INDEX idx_report_reviews_user_id      RENAME TO idx_change_suggestions_user_id;
ALTER INDEX idx_report_reviews_created_at   RENAME TO idx_change_suggestions_created_at;
ALTER INDEX idx_report_changes_report_id    RENAME TO idx_suggestion_changes_suggestion_id;
ALTER INDEX idx_report_changes_approval     RENAME TO idx_suggestion_changes_approval;
ALTER INDEX idx_publish_audit_log_report_id RENAME TO idx_publish_audit_log_suggestion_id;

-- 7. Rename triggers
ALTER TRIGGER trg_report_reviews_updated_at ON change_suggestions  RENAME TO trg_change_suggestions_updated_at;
ALTER TRIGGER trg_report_changes_updated_at ON suggestion_changes  RENAME TO trg_suggestion_changes_updated_at;
