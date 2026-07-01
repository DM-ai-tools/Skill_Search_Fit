-- Organization/workspace tenancy foundation

CREATE TABLE IF NOT EXISTS organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user
    ON workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace
    ON projects(workspace_id);
