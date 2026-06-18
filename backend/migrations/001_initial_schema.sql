-- SkillSearchFit MVP 2.0 — initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE plugin_status AS ENUM ('enabled', 'disabled');
CREATE TYPE prompt_type AS ENUM ('primary', 'system', 'followup');
CREATE TYPE execution_status AS ENUM ('pending', 'running', 'completed', 'failed');

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
