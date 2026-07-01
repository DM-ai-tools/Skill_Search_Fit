# Backend Schema

## SkillSearchFit SEO AI Platform — MVP

| Field | Value |
|-------|-------|
| **Database** | PostgreSQL 15+ |
| **Access** | asyncpg (API) · psycopg (migrations/scripts) |
| **ORM** | None — parameterized SQL only |
| **Version** | MVP 2.0 |
| **Last Updated** | June 11, 2026 |
| **Supersedes** | Backend Schema v1.0 |

---

## 1. Overview

This document defines the complete PostgreSQL schema for the MVP, including tables, indexes, constraints, enums, relationships, and seed data guidance.

### Entity Relationship Summary

```
users ──┬── sessions
        ├── projects ──┬── outputs
        │              ├── workspace_sessions
        │              └── executions
        └── activity_logs

plugins ──┬── prompts
          ├── outputs (via plugin_id)
          ├── workspace_sessions (via plugin_id)
          └── executions (via plugin_id)

projects ── outputs
projects ── executions
```

**v2 change:** `executions` is now a first-class, mandatory table (was previously marked "Optional — Recommended" in v1) and is wired into the relationship diagram alongside `outputs` and `workspace_sessions`.

---

## 2. Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- case-insensitive email
```

*(Unchanged from v1.)*

---

## 3. Custom Types

```sql
CREATE TYPE user_role AS ENUM ('user', 'admin');

CREATE TYPE plugin_status AS ENUM ('enabled', 'disabled');

CREATE TYPE prompt_type AS ENUM ('primary', 'system', 'followup');

CREATE TYPE execution_status AS ENUM ('pending', 'running', 'completed', 'failed');
```

*(Unchanged from v1.)*

---

## 4. Tables

### 4.1 `users`

Stores all platform accounts (users and admins).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | User identifier |
| `name` | `VARCHAR(255)` | NOT NULL | Display name |
| `email` | `CITEXT` | NOT NULL, UNIQUE | Login email |
| `password_hash` | `VARCHAR(255)` | NOT NULL | bcrypt/argon2 hash |
| `role` | `user_role` | NOT NULL, DEFAULT `'user'` | Authorization role |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Registration time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Last profile update |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft delete timestamp |

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           CITEXT NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ NULL
);

CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users (role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users (created_at);
```

**v2 change:** added `idx_users_created_at` to support the admin dashboard's "new signups in last 7 days" metric (PRD §8.9 / TRD §5.8).

---

### 4.2 `sessions`

Server-side session store for cookie-based authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Session ID (cookie value) |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Owning user |
| `data` | `JSONB` | NOT NULL, DEFAULT `'{}'` | Session payload |
| `csrf_token` | `VARCHAR(64)` | NOT NULL | Token bound to this session for CSRF validation |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Fixed expiration (no sliding renewal) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Created |
| `ip_address` | `INET` | NULL | Client IP at creation |
| `user_agent` | `TEXT` | NULL | Client user agent |

**Session `data` shape:**

```json
{
  "login_status": true,
  "role": "user"
}
```

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data            JSONB NOT NULL DEFAULT '{}',
    csrf_token      VARCHAR(64) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      INET NULL,
    user_agent      TEXT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
```

**v2 change:** added `csrf_token` column. The token is generated at session creation, returned to the client as the readable `ssf_csrf` cookie, and validated against this column on every non-GET `/api/v1/*` request (double-submit pattern — see TRD §4.6). Session ID is regenerated (new row created, old row deleted) on every login, including re-login.

**Cleanup job:** `DELETE FROM sessions WHERE expires_at < NOW()` (cron or startup task). *(Unchanged.)*

---

### 4.3 `projects`

User-owned containers for plugin outputs and workspace sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Project identifier |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Owner |
| `project_name` | `VARCHAR(255)` | NOT NULL | Display name |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Created |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Last modified |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft delete |

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_name    VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ NULL
);

CREATE INDEX idx_projects_user_id ON projects (user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_projects_user_name ON projects (user_id, project_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created_at ON projects (created_at);
```

**v2 change:** added `idx_projects_created_at` to support admin dashboard's "total projects" / growth-over-time metrics. The unique `(user_id, project_name)` constraint already enforced project-name uniqueness in v1 — now formally documented in PRD/app-flow as the source of the "name already exists" error.

---

### 4.4 `plugins`

Plugin catalog managed by admins.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Plugin identifier |
| `plugin_name` | `VARCHAR(255)` | NOT NULL | Display name |
| `description` | `TEXT` | NOT NULL, DEFAULT `''` | Short description |
| `category` | `VARCHAR(100)` | NOT NULL, DEFAULT `'general'` | Category slug |
| `icon` | `VARCHAR(255)` | NOT NULL, DEFAULT `'puzzle'` | Icon key or URL |
| `input_fields` | `JSONB` | NOT NULL, DEFAULT `'[]'` | Dynamic form schema |
| `schema_version` | `INTEGER` | NOT NULL, DEFAULT `1` | Increments when `input_fields` changes |
| `output_template` | `JSONB` | NULL | Output rendering hints |
| `status` | `plugin_status` | NOT NULL, DEFAULT `'enabled'` | Visibility |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Created |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Last modified |

**`input_fields` JSON schema (array of objects):**

```json
[
  {
    "name": "keyword",
    "label": "Target Keyword",
    "type": "text",
    "required": true,
    "placeholder": "e.g. best seo tools",
    "help_text": "Primary keyword to analyze"
  },
  {
    "name": "locale",
    "label": "Locale",
    "type": "select",
    "required": true,
    "options": [
      { "value": "en-US", "label": "English (US)" },
      { "value": "en-GB", "label": "English (UK)" }
    ]
  }
]
```

**Supported field types:** `text`, `textarea`, `number`, `select`, `url`, `checkbox`

```sql
CREATE TABLE plugins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_name     VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    category        VARCHAR(100) NOT NULL DEFAULT 'general',
    icon            VARCHAR(255) NOT NULL DEFAULT 'puzzle',
    input_fields    JSONB NOT NULL DEFAULT '[]',
    schema_version  INTEGER NOT NULL DEFAULT 1,
    output_template JSONB NULL,
    status          plugin_status NOT NULL DEFAULT 'enabled',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plugins_status ON plugins (status);
CREATE INDEX idx_plugins_category ON plugins (category);
```

**v2 change:** added `schema_version INTEGER NOT NULL DEFAULT 1`. This is an **additive column with a default** — existing rows are unaffected, no data migration logic required beyond the `ALTER TABLE`. The application layer auto-increments this value whenever an admin saves changes to `input_fields` (see §5.2 trigger).

---

### 4.5 `prompts`

Prompt templates linked to plugins. Content may be empty in MVP.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Prompt identifier |
| `plugin_id` | `UUID` | NOT NULL, FK → `plugins(id)` ON DELETE CASCADE | Parent plugin |
| `prompt_type` | `prompt_type` | NOT NULL | Role of prompt |
| `prompt_content` | `TEXT` | NOT NULL, DEFAULT `''` | Template body |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Created |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Last modified |

```sql
CREATE TABLE prompts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id       UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    prompt_type     prompt_type NOT NULL,
    prompt_content  TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plugin_id, prompt_type)
);

CREATE INDEX idx_prompts_plugin_id ON prompts (plugin_id);
```

*(Unchanged from v1 — prompt edits do not affect `schema_version`, since prompts are independent of `input_fields`.)*

---

### 4.6 `outputs`

Saved plugin execution results tied to projects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Output identifier |
| `project_id` | `UUID` | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | Parent project |
| `plugin_id` | `UUID` | NOT NULL, FK → `plugins(id)` ON DELETE RESTRICT | Source plugin |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Creator |
| `execution_id` | `UUID` | NULL, FK → `executions(id)` ON DELETE SET NULL | Originating execution record |
| `input_snapshot` | `JSONB` | NOT NULL, DEFAULT `'{}'` | Inputs at execution time |
| `schema_version` | `INTEGER` | NOT NULL | Plugin schema version at time of execution |
| `generated_output` | `JSONB` | NOT NULL | Result payload |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Saved time |

**`generated_output` shape:**

```json
{
  "markdown": "## Results\n\n...",
  "structured": {},
  "execution_id": "uuid"
}
```

```sql
CREATE TABLE outputs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plugin_id           UUID NOT NULL REFERENCES plugins(id) ON DELETE RESTRICT,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    execution_id        UUID NULL REFERENCES executions(id) ON DELETE SET NULL,
    input_snapshot      JSONB NOT NULL DEFAULT '{}',
    schema_version      INTEGER NOT NULL,
    generated_output    JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outputs_project_id ON outputs (project_id);
CREATE INDEX idx_outputs_plugin_id ON outputs (plugin_id);
CREATE INDEX idx_outputs_user_id ON outputs (user_id);
CREATE INDEX idx_outputs_execution_id ON outputs (execution_id);
CREATE INDEX idx_outputs_created_at ON outputs (created_at DESC);
```

**v2 changes:**
- Added `execution_id` (nullable FK to `executions`, `ON DELETE SET NULL`) — links a saved output back to its full execution record (inputs, timing, raw result) without making `outputs` depend on `executions` surviving forever (executions are pruned after 30 days; the saved output remains intact even if its execution record is later deleted).
- Added `schema_version` (NOT NULL — every output is created at execution time, when a version is always known) so historical outputs can be correctly re-rendered or diffed against the current plugin schema.
- Both additions are populated by the application at write time; **note for migration**: since `schema_version` is `NOT NULL` with no default, existing v1 rows (if any exist in a pre-launch dev DB) need a backfill (`UPDATE outputs SET schema_version = 1`) before this constraint can be applied — see §8 Migration Order.

---

### 4.7 `workspace_sessions`

Stores last-used inputs per project+plugin for "resume session" in workspace left sidebar.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Session record ID |
| `project_id` | `UUID` | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | Project |
| `plugin_id` | `UUID` | NOT NULL, FK → `plugins(id)` ON DELETE CASCADE | Plugin |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Owner |
| `inputs` | `JSONB` | NOT NULL, DEFAULT `'{}'` | Last submitted inputs |
| `schema_version` | `INTEGER` | NOT NULL | Plugin schema version `inputs` was captured against |
| `notes` | `TEXT` | NOT NULL, DEFAULT `''` | Workspace notes |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Last activity |

```sql
CREATE TABLE workspace_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plugin_id       UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inputs          JSONB NOT NULL DEFAULT '{}',
    schema_version  INTEGER NOT NULL DEFAULT 1,
    notes           TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, plugin_id, user_id)
);

CREATE INDEX idx_workspace_sessions_user ON workspace_sessions (user_id);
CREATE INDEX idx_workspace_sessions_project ON workspace_sessions (project_id);
```

**v2 changes:**
- Added `schema_version INTEGER NOT NULL DEFAULT 1` (additive, default-backed — safe for existing rows).
- This row is now upserted on **every successful execution**, not only on explicit notes-save, per app-flow v2 Flow 8/10. The `ON CONFLICT` upsert (query 7.4) is updated accordingly in §7.

---

### 4.8 `activity_logs`

Audit trail for user and admin actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Log entry ID |
| `user_id` | `UUID` | NULL, FK → `users(id)` ON DELETE SET NULL | Acting user |
| `action` | `VARCHAR(100)` | NOT NULL | Action code |
| `metadata` | `JSONB` | NOT NULL, DEFAULT `'{}'` | Context payload |
| `ip_address` | `INET` | NULL | Client IP |
| `timestamp` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Event time |

**Common `action` values:**

| Action | Metadata example |
|--------|------------------|
| `user_signup` | `{}` |
| `user_login` | `{"role": "user"}` |
| `user_logout` | `{}` |
| `project_create` | `{"project_id": "..."}` |
| `project_rename` | `{"project_id": "...", "old_name": "...", "new_name": "..."}` |
| `project_delete` | `{"project_id": "..."}` |
| `plugin_launch` | `{"plugin_id": "..."}` |
| `plugin_execute` | `{"plugin_id": "...", "project_id": "...", "execution_id": "..."}` |
| `output_save` | `{"output_id": "...", "plugin_id": "...", "execution_id": "..."}` |
| `admin_user_create` | `{"target_user_id": "..."}` |
| `admin_plugin_update` | `{"plugin_id": "...", "changes": [...], "schema_version_changed": true}` |

```sql
CREATE TABLE activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    ip_address      INET NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs (action);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs (timestamp DESC);
```

**v2 change:** `plugin_execute` and `output_save` metadata now include `execution_id` for cross-referencing with the `executions` table; `admin_plugin_update` includes `schema_version_changed`. No structural change to the table itself.

---

### 4.9 `executions`

Tracks in-flight and completed plugin runs. Supports retry, debugging, the admin dashboard, and Phase 5 streaming.

> **v2 status change:** this table was marked **"Optional — Recommended"** in v1. It is now **mandatory for MVP**. Every plugin execution writes a row here at start and updates it on completion, per TRD v2 §6.3. The cost is one additional indexed write per execution; the benefit is a complete audit/retry foundation with zero future migration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Execution ID |
| `plugin_id` | `UUID` | NOT NULL, FK → `plugins(id)` | Plugin |
| `project_id` | `UUID` | NULL, FK → `projects(id)` ON DELETE SET NULL | Project context |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Runner |
| `inputs` | `JSONB` | NOT NULL | Submitted inputs |
| `schema_version` | `INTEGER` | NOT NULL | Plugin schema version at execution time |
| `status` | `execution_status` | NOT NULL, DEFAULT `'pending'` | State |
| `result` | `JSONB` | NULL | Raw result when complete |
| `error_message` | `TEXT` | NULL | Failure reason |
| `started_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `NOW()` | Start |
| `completed_at` | `TIMESTAMPTZ` | NULL | End |

```sql
CREATE TABLE executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id       UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    project_id      UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inputs          JSONB NOT NULL,
    schema_version  INTEGER NOT NULL,
    status          execution_status NOT NULL DEFAULT 'pending',
    result          JSONB NULL,
    error_message   TEXT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ NULL
);

CREATE INDEX idx_executions_user_id ON executions (user_id);
CREATE INDEX idx_executions_plugin_id ON executions (plugin_id);
CREATE INDEX idx_executions_status ON executions (status);
CREATE INDEX idx_executions_started_at ON executions (started_at DESC);
```

**v2 changes:**
- Added `schema_version NOT NULL` for consistency with `outputs` and `workspace_sessions`.
- Added `idx_executions_started_at` to support the admin dashboard's "executions in last 7 days" and "top plugins in last 30 days" queries (§7.6, §7.7).
- **Important ordering note:** because `outputs.execution_id` now references `executions(id)`, the `executions` table must be created **before** `outputs` in migration order (this reorders the v1 migration sequence — see §8).

---

### 4.10 `pipeline_runs`

Orchestrated multi-step pipeline runs with competitor pre-analysis, inter-skill review pauses, and 24-hour session expiry. Used by `POST /api/v1/pipelines/{id}/runs` (not the legacy per-step `execute-step` path).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Run ID |
| `pipeline_id` | `TEXT` | NOT NULL | Pipeline slug (e.g. `full-content-page-pipeline`) |
| `project_id` | `UUID` | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | Project context |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Owner |
| `status` | `TEXT` | NOT NULL | `analyzing_competitors`, `running`, `paused_for_review`, `completed`, `failed`, `expired` |
| `current_skill_index` | `INTEGER` | NOT NULL, DEFAULT `0` | Last completed or in-flight step (1-based when running) |
| `base_inputs` | `JSONB` | NOT NULL | Enriched form inputs at run start |
| `competitor_data` | `JSONB` | NOT NULL | Pre-run competitor intelligence payload |
| `competitor_failed` | `BOOLEAN` | NOT NULL | True if competitor pre-analysis failed (run continues) |
| `prior_markdown` | `JSONB` | NOT NULL | Cumulative step markdown for downstream skills |
| `step_results` | `JSONB` | NOT NULL | Serialized `PipelineStepResult` objects |
| `pending_inputs` | `JSONB` | NULL | Inter-skill review payload when `paused_for_review` |
| `edited_inputs_count` | `INTEGER` | NOT NULL | User edits across review pauses |
| `error_message` | `TEXT` | NULL | Failure reason when `status = failed` |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Default `NOW() + 24 hours` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Row creation |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Last state change |

```sql
-- See backend/migrations/010_pipeline_runs.sql and 012_pipeline_runs_error_message.sql
```

**Retention:** runs expire after 24 hours; expired rows raise a validation error on access and are marked `expired`.

---

### 4.11 `pipeline_page_generations`

Template-insertion page generation jobs for the Full Content Page Pipeline. One row per `pipeline_run_id`; triggered automatically when a run completes (fire-and-forget background task).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Generation job ID |
| `pipeline_run_id` | `UUID` | NOT NULL, UNIQUE, FK → `pipeline_runs(id)` | Parent run |
| `project_id` | `UUID` | NOT NULL, FK → `projects(id)` | Project |
| `user_id` | `UUID` | NOT NULL, FK → `users(id)` | Owner |
| `status` | `TEXT` | NOT NULL | `generating`, `ready`, `approved`, `deployed`, `failed` |
| `regeneration_count` | `INTEGER` | NOT NULL | User regeneration attempts (max 3) |
| `user_feedback` | `TEXT` | NULL | Regeneration feedback |
| `job_data` | `JSONB` | NOT NULL | Template capture + assembler metadata |
| `result_html` | `TEXT` | NULL | Generated page HTML |
| `page_title` | `TEXT` | NULL | SEO title |
| `meta_description` | `TEXT` | NULL | Meta description |
| `slug` | `TEXT` | NULL | URL slug |
| `full_url` | `TEXT` | NULL | Canonical URL |
| `approved_at` | `TIMESTAMPTZ` | NULL | User approval timestamp |
| `deployed_at` | `TIMESTAMPTZ` | NULL | WordPress deploy timestamp |
| `wordpress_draft_url` | `TEXT` | NULL | Draft link after deploy |
| `error_message` | `TEXT` | NULL | Failure reason |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Row creation |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Last state change |

```sql
-- See backend/migrations/011_pipeline_page_generations.sql
```

---

## 5. Triggers

### 5.1 Auto-update `updated_at`

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_plugins_updated_at
    BEFORE UPDATE ON plugins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_prompts_updated_at
    BEFORE UPDATE ON prompts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

*(Unchanged from v1.)*

### 5.2 Schema Version Bump *(new)*

`schema_version` increments are handled in the **application layer**, not via a database trigger — this keeps the "what changed" comparison logic (which fields were added/removed/retyped) in Python where it can be tested and where the diff can also be logged to `activity_logs.metadata.changes`.

Recommended service-layer pattern (illustrative, not a DB object):

```python
async def update_plugin(conn, plugin_id, updates: dict):
    current = await get_plugin(conn, plugin_id)
    new_schema_version = current.schema_version
    if "input_fields" in updates and updates["input_fields"] != current.input_fields:
        new_schema_version += 1

    await conn.execute(
        """
        UPDATE plugins
        SET plugin_name = COALESCE($2, plugin_name),
            description = COALESCE($3, description),
            input_fields = COALESCE($4, input_fields),
            schema_version = $5,
            output_template = COALESCE($6, output_template),
            status = COALESCE($7, status)
        WHERE id = $1
        """,
        plugin_id, updates.get("plugin_name"), updates.get("description"),
        updates.get("input_fields"), new_schema_version,
        updates.get("output_template"), updates.get("status"),
    )
    return new_schema_version
```

A database trigger was deliberately avoided here because comparing JSONB equality at the trigger level (`OLD.input_fields IS DISTINCT FROM NEW.input_fields`) is possible but would make the "did the schema meaningfully change" decision opaque to the application and harder to unit test. The application-layer approach also allows future refinement (e.g., only bump on breaking changes, not cosmetic label edits) without a migration.

---

## 6. Seed Data

### 6.1 Default Admin User

Created via migration script (password from env `ADMIN_INITIAL_PASSWORD`):

```sql
-- Password hash generated by application script, not stored in repo
INSERT INTO users (name, email, password_hash, role)
VALUES (
    'Platform Admin',
    'admin@skillsearchfit.local',
    '<bcrypt_hash>',
    'admin'
);
```

*(Unchanged from v1.)*

### 6.2 Sample Plugins (Development)

**Primary seed (production plugins):** JSON files in `backend/plugins/` loaded by `scripts/seed_plugins.py`:

```bash
cd backend
python scripts/seed_plugins.py
```

This upserts all 12 MVP plugins, syncs `prompts`, bumps `schema_version` when `input_fields` change, and disables legacy/replaced plugin names (`deprecated_names` in JSON + hardcoded legacy list for `002_seed_dev.sql` stubs).

**Legacy SQL seed** (`002_seed_dev.sql`) inserted three placeholder plugins for early development. These are superseded and disabled on re-seed:

| Legacy plugin | Status after re-seed |
|---------------|----------------------|
| Keyword Gap Analyzer | `disabled` |
| Meta Description Generator | `disabled` |
| Technical SEO Checklist | `disabled` |
| Schema Markup Generator | `disabled` (renamed → Generate Schema Markup) |

**Current enabled catalog (12):** see PRD §14 or `backend/plugins/README.md`.

---

## 7. Query Examples

### 7.1 List Enabled Plugins

```sql
SELECT id, plugin_name, description, category, icon, input_fields, schema_version
FROM plugins
WHERE status = 'enabled'
ORDER BY category, plugin_name;
```

**v2 change:** now selects `schema_version` so the frontend can store it alongside the loaded form (TRD §7.4).

### 7.2 User Projects with Output Count

```sql
SELECT
    p.id,
    p.project_name,
    p.created_at,
    COUNT(o.id) AS output_count
FROM projects p
LEFT JOIN outputs o ON o.project_id = p.id
WHERE p.user_id = $1 AND p.deleted_at IS NULL
GROUP BY p.id
ORDER BY p.updated_at DESC;
```

*(Unchanged from v1.)*

### 7.3 Load Plugin with Prompts

```sql
SELECT
    pl.id,
    pl.plugin_name,
    pl.description,
    pl.category,
    pl.icon,
    pl.input_fields,
    pl.schema_version,
    pl.output_template,
    pl.status,
    COALESCE(
        json_agg(
            json_build_object(
                'prompt_type', pr.prompt_type,
                'prompt_content', pr.prompt_content
            )
        ) FILTER (WHERE pr.id IS NOT NULL),
        '[]'
    ) AS prompts
FROM plugins pl
LEFT JOIN prompts pr ON pr.plugin_id = pl.id
WHERE pl.id = $1
GROUP BY pl.id;
```

**v2 change:** added `pl.schema_version` to the selected columns.

### 7.4 Upsert Workspace Session (on every successful execution)

```sql
INSERT INTO workspace_sessions (project_id, plugin_id, user_id, inputs, schema_version, notes)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (project_id, plugin_id, user_id)
DO UPDATE SET
    inputs = EXCLUDED.inputs,
    schema_version = EXCLUDED.schema_version,
    notes = COALESCE(EXCLUDED.notes, workspace_sessions.notes),
    updated_at = NOW();
```

**v2 changes:**
- Added `schema_version` to the insert/update.
- `notes` now uses `COALESCE(EXCLUDED.notes, workspace_sessions.notes)` — when this upsert is triggered by a **plugin execution** (not an explicit notes save), the application passes `NULL` for notes so existing notes are preserved rather than overwritten with an empty string. When triggered by the **notes auto-save**, the application passes the new notes text.

### 7.5 Activity Logs (Paginated)

```sql
SELECT
    al.id,
    al.action,
    al.metadata,
    al.timestamp,
    u.name AS user_name,
    u.email AS user_email
FROM activity_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE ($1::VARCHAR IS NULL OR al.action = $1)
  AND ($2::TIMESTAMPTZ IS NULL OR al.timestamp >= $2)
  AND ($3::TIMESTAMPTZ IS NULL OR al.timestamp <= $3)
ORDER BY al.timestamp DESC
LIMIT $4 OFFSET $5;
```

*(Unchanged from v1.)*

### 7.6 Execution Lifecycle Writes *(new)*

**Start of execution:**

```sql
INSERT INTO executions (plugin_id, project_id, user_id, inputs, schema_version, status)
VALUES ($1, $2, $3, $4, $5, 'running')
RETURNING id;
```

**On success:**

```sql
UPDATE executions
SET status = 'completed',
    result = $2,
    completed_at = NOW()
WHERE id = $1;
```

**On failure:**

```sql
UPDATE executions
SET status = 'failed',
    error_message = $2,
    completed_at = NOW()
WHERE id = $1;
```

### 7.7 Admin Dashboard Aggregates *(new)*

Backs the `/admin/dashboard` response defined in TRD §5.8.

```sql
-- Total active users
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;

-- Total projects
SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL;

-- New signups, last 7 days
SELECT COUNT(*) FROM users
WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days';

-- Executions, last 7 days
SELECT COUNT(*) FROM executions
WHERE started_at >= NOW() - INTERVAL '7 days';

-- Total saved outputs
SELECT COUNT(*) FROM outputs;

-- Top 5 plugins by execution count, last 30 days
SELECT
    pl.id AS plugin_id,
    pl.plugin_name,
    COUNT(e.id) AS execution_count
FROM executions e
JOIN plugins pl ON pl.id = e.plugin_id
WHERE e.started_at >= NOW() - INTERVAL '30 days'
GROUP BY pl.id, pl.plugin_name
ORDER BY execution_count DESC
LIMIT 5;
```

All six queries can run in parallel (e.g., via `asyncio.gather` with separate pool connections, or a single round trip using CTEs if preferred).

---

## 8. Migration Order

**Authoritative migration files** live in `backend/migrations/`. Run with `npm run migrate` or `python backend/scripts/migrate.py`. Production Docker entrypoint and local `start-api.ps1` run migrations before API start.

| File | Contents |
|------|----------|
| `001_initial_schema.sql` | Core tables (users, sessions, projects, plugins, executions, outputs, workspace_sessions, activity_logs) |
| `002_seed_dev.sql` | Dev seed data |
| `003_website_analysis.sql` | Website analysis cache |
| `004_report_review.sql` | Report review / change suggestions foundation |
| `005_rename_report_review_to_change_suggestions.sql` | Rename to change_suggestions |
| `006_integrations.sql` | CMS integrations tables |
| `007_change_suggestion_quality.sql` | Quality columns on suggestion changes |
| `008_plugin_slug_on_suggestions.sql` | `plugin_slug` on change_suggestions |
| `009_remove_mailchimp.sql` | Remove Mailchimp from destination enums |
| `010_pipeline_runs.sql` | `pipeline_runs` orchestration table |
| `011_pipeline_page_generations.sql` | Full-content page generation jobs |
| `012_pipeline_runs_error_message.sql` | `error_message` on pipeline runs |

> **Note:** Earlier doc versions listed a decomposed v2 file sequence (`001_extensions.sql`, etc.). The running application uses the consolidated files above.

**For projects with an existing v1 database** (pre-launch dev only), apply additive migrations incrementally; no production data exists yet per project status.

Run with `npm run migrate` or `python backend/scripts/migrate.py`. Production entrypoint (`backend/scripts/entrypoint.sh`) runs migrations before API start; local `npm run dev:api` does the same via `start-api.ps1`.

---

## 9. Data Retention (MVP Defaults)

| Entity | Policy |
|--------|--------|
| Sessions | Delete on expiry (fixed TTL, no renewal); cleanup daily |
| Soft-deleted users | Retain 90 days, then hard delete |
| Soft-deleted projects | Retain 30 days; cascade outputs |
| Activity logs | Retain indefinitely (MVP); archive later |
| **Executions** | Retain 30 days, then hard delete |
| **Pipeline runs** | Expire after 24 hours (`expires_at`); marked `expired` on access |
| **Pipeline page generations** | Cascade delete with parent `pipeline_runs` row |

**v2 clarification:** because `outputs.execution_id` is `ON DELETE SET NULL`, pruning `executions` after 30 days does **not** delete or break any saved `outputs` row — the output's own `input_snapshot`, `schema_version`, and `generated_output` remain fully self-contained. The `execution_id` link is a "for as long as it's useful" convenience reference, not a hard dependency.

---

## 10. Security Notes

- Never store plaintext passwords
- Session IDs must be UUID v4 (unguessable)
- **CSRF tokens** (`sessions.csrf_token`) must be generated with a cryptographically secure random source (≥32 bytes), distinct from the session ID itself
- Row-level ownership: all user queries filter by `user_id` from session
- Admin queries bypass ownership but require `role = admin`
- `generated_output` and `executions.result`/`inputs` may contain sensitive SEO data — no public endpoints
- **Rate limiting state** (login/signup attempt counters) is held in application memory or a lightweight store (e.g., in-process for single-instance MVP); not persisted to PostgreSQL — no schema impact

---

## 11. Summary of Changes from v1.0

| Area | Change | Why |
|------|--------|-----|
| `sessions` | Added `csrf_token` column | Implements required CSRF protection (TRD §4.6) |
| `plugins` | Added `schema_version INTEGER NOT NULL DEFAULT 1` | Enables versioned input forms (PRD §8.2) |
| `outputs` | Added `execution_id` (FK → executions, SET NULL) and `schema_version NOT NULL` | Links saved outputs to full execution records; preserves historical schema context |
| `workspace_sessions` | Added `schema_version INTEGER NOT NULL DEFAULT 1` | Enables "form updated" detection on session restore |
| `executions` | **Promoted from optional to mandatory**; added `schema_version`, `idx_executions_started_at` | Audit trail, retry foundation, admin dashboard data source |
| `users` | Added `idx_users_created_at` | Supports admin dashboard "new signups" metric |
| `projects` | Added `idx_projects_created_at` | Supports admin dashboard growth metrics |
| `activity_logs` | No structural change; metadata convention now includes `execution_id` / `schema_version_changed` | Cross-referencing with executions table |
| Triggers | Added application-layer schema-version-bump pattern (§5.2) | Documents how `schema_version` increments without a DB trigger |
| Migration order | `executions` moved before `outputs`; incremental migration path added for existing dev DBs | `outputs.execution_id` FK requires `executions` to exist first |
| Query examples | Added §7.6 (execution lifecycle writes) and §7.7 (admin dashboard aggregates); updated §7.1, §7.3, §7.4 | Implements TRD v2 execution pipeline and admin dashboard spec |
| Retention | Clarified that execution pruning doesn't affect saved outputs (`SET NULL` behavior) | Avoids confusion between 30-day execution retention and permanent output storage |

All changes are **additive** (new columns with defaults, new table promoted from already-fully-specified-but-optional, new indexes, new queries). No existing column, table, type, or constraint from v1 is removed or altered in a breaking way. Any pre-launch dev database can apply the incremental migration path in §8 without data loss.

---

## 12. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-11 | Initial schema document |
| 2.0 | 2026-06-11 | Added CSRF token storage, schema versioning across plugins/outputs/workspace_sessions, promoted executions to mandatory with execution_id linkage, added dashboard-supporting indexes and queries |
| 2.1 | 2026-06-11 | Documented JSON plugin seed (`seed_plugins.py`), 12-plugin catalog, legacy plugin disable on re-seed |
| 2.2 | 2026-06-23 | Added `pipeline_runs` and `pipeline_page_generations` tables; `error_message` on pipeline runs; application migration list |