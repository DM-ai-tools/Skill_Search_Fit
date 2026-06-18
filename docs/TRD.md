# Technical Requirements Document (TRD)

## SkillSearchFit SEO AI Platform — MVP

| Field | Value |
|-------|-------|
| **Product** | SkillSearchFit SEO AI Platform |
| **Version** | MVP 2.0 |
| **Status** | Draft |
| **Last Updated** | June 11, 2026 |
| **Supersedes** | TRD v1.0 |

---

## 1. Overview

This document defines the technical architecture, stack, API contracts, security model, and implementation standards for the SkillSearchFit MVP. It complements the PRD and Backend Schema documents.

**Architecture principle:** Framework first. Plugin and prompt logic plug in via well-defined interfaces without changing core routing, auth, or workspace structure.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│  Next.js 15 · React 19 · TypeScript · Tailwind · ShadCN · Zustand │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (cookies + CSRF token)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Application                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │   Auth   │ │  Users   │ │ Plugins  │ │ Execution Engine │   │
│  │ Sessions │ │ Projects │ │ Prompts  │ │    (stub)        │   │
│  │  + CSRF  │ │          │ │          │ │  + executions    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ asyncpg / psycopg
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL                                  │
│  users · sessions · projects · plugins · prompts · outputs ·     │
│  executions · workspace_sessions · activity_logs                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Deployment Topology (MVP)

| Component | Target | Notes |
|-----------|--------|-------|
| Frontend | Vercel or static + Node host | `NEXT_PUBLIC_API_URL` points to API |
| Backend | Docker container (Railway, Fly, ECS) | Single service instance OK for MVP |
| Database | Managed PostgreSQL | Neon, Supabase, RDS, or local dev |

### 2.2 Repository Structure (Recommended)

```
skillsearchfit/
├── frontend/                 # Next.js 15 app
│   ├── app/
│   │   ├── (marketing)/      # Public pages
│   │   ├── (app)/            # Authenticated app
│   │   └── admin/            # Admin portal
│   ├── components/
│   ├── lib/
│   └── stores/               # Zustand
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   ├── db/
│   │   └── middleware/        # incl. session + CSRF + rate limiting
│   ├── migrations/
│   └── tests/
└── docs/
```

---

## 3. Technology Stack

### 3.1 Frontend

| Layer | Technology | Version Target |
|-------|------------|----------------|
| Framework | Next.js (App Router) | 15.x |
| UI Library | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | ShadCN UI | Latest |
| State | Zustand | 5.x |
| Forms | React Hook Form + Zod | Latest |

### 3.2 Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | FastAPI | 0.115+ |
| Runtime | Python | 3.12+ |
| Validation | Pydantic v2 | Request/response models |
| DB Driver (async) | asyncpg | Primary for API handlers |
| DB Driver (sync) | psycopg | Migrations, scripts |
| Password | passlib + bcrypt | Or argon2-cffi |
| Sessions | starlette-session or custom | Backed by PostgreSQL |
| Rate limiting | slowapi or custom middleware | Login, signup, admin login |

**No ORM.** All queries are parameterized raw SQL.

### 3.3 Database

- PostgreSQL 15+
- Migrations via SQL files or lightweight tool (e.g., `dbmate`, plain numbered `.sql`)

---

## 4. Authentication & Session Design

### 4.1 Explicit Exclusions

- No JWT (access or refresh tokens)
- No OAuth 2.0 / OpenID Connect
- No social login providers

### 4.2 Session Flow

1. Client POSTs credentials to `/api/v1/auth/login` or `/api/v1/auth/admin/login`
2. Server validates credentials against `users` table
3. Server creates a new row in `sessions` table (regenerating session ID, even on re-login, to prevent session fixation); sets cookie `ssf_session=<session_id>` and a separate readable CSRF cookie `ssf_csrf=<token>`
4. Middleware loads session on each request; attaches `current_user` to request state; validates CSRF token on non-GET requests
5. Logout deletes the session row and clears both cookies

### 4.3 Cookie Attributes

```http
Set-Cookie: ssf_session=<uuid>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
Set-Cookie: ssf_csrf=<token>; Path=/; Secure; SameSite=Lax; Max-Age=604800
```

The CSRF cookie is **not** HttpOnly — the frontend reads it and echoes it back in an `X-CSRF-Token` header on state-changing requests (double-submit pattern).

### 4.4 Session Store Schema

See `backend-schema.md` — `sessions` table with `id`, `user_id`, `data` (JSONB), `expires_at`, `created_at`.

Session `data` JSON:

```json
{
  "login_status": true,
  "role": "user"
}
```

### 4.5 Session Expiry Policy

- **Fixed (hard) expiry only.** `expires_at` is set once at session creation (`NOW() + SESSION_MAX_AGE`) and never extended.
- No sliding-window renewal in MVP. Simpler to implement, test, and reason about.
- Expired sessions are rejected by middleware (`401`) and cleaned up by the existing daily cron (see `backend-schema.md` §9).

### 4.6 CSRF Protection *(new — resolves PRD/TRD v1 conflict)*

| Aspect | Implementation |
|--------|-----------------|
| Pattern | Double-submit cookie |
| Token issuance | Generated alongside session, stored in `ssf_csrf` cookie (readable, `SameSite=Lax`) |
| Validation | Required on all `POST`, `PATCH`, `PUT`, `DELETE` requests under `/api/v1/*` (except `/auth/login`, `/auth/signup`, `/auth/admin/login`, which are pre-session) |
| Failure response | `403 CSRF_TOKEN_INVALID` |
| Frontend | `lib/api.ts` reads `ssf_csrf` cookie and sets `X-CSRF-Token` header automatically on all mutating requests |

### 4.7 Rate Limiting *(expanded)*

| Endpoint | Limit | Tracked By |
|----------|-------|------------|
| `POST /auth/login` | 5 attempts / 15 min | IP address |
| `POST /auth/admin/login` | 5 attempts / 15 min | IP address — **separate counter from `/auth/login`** |
| `POST /auth/signup` | 5 attempts / 15 min | IP address |

Exceeding the limit returns `429 RATE_LIMITED` with a `Retry-After` header.

### 4.8 Authorization Middleware

| Route Prefix | Required Role |
|--------------|---------------|
| `/api/v1/auth/*` (public) | None |
| `/api/v1/users/me` | `user` or `admin` |
| `/api/v1/projects/*` | `user` or `admin` (own resources) |
| `/api/v1/plugins/*` (read) | `user` or `admin` |
| `/api/v1/execute/*` | `user` or `admin` |
| `/api/v1/admin/*` | `admin` only |

Frontend route guards mirror API rules via server components + middleware.

---

## 5. API Design

### 5.1 Conventions

- Base path: `/api/v1`
- JSON request/response bodies
- ISO 8601 timestamps (UTC)
- Pagination: `?page=1&limit=20`
- Errors: consistent envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": []
  }
}
```

### 5.2 Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Register user (rate-limited) |
| POST | `/auth/login` | User login (rate-limited, regenerates session) |
| POST | `/auth/admin/login` | Admin login (rate-limited separately, regenerates session) |
| POST | `/auth/logout` | Destroy session, clear cookies |
| GET | `/auth/me` | Current user profile |

### 5.3 User Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Profile |
| PATCH | `/users/me` | Update name, email |
| PATCH | `/users/me/password` | Change password |

### 5.4 Project Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List user's projects |
| POST | `/projects` | Create project |
| GET | `/projects/{id}` | Get project |
| PATCH | `/projects/{id}` | Rename |
| DELETE | `/projects/{id}` | Delete (soft, 30-day retention) |
| GET | `/projects/{id}/outputs` | List saved outputs |
| GET | `/projects/{id}/sessions` | List workspace sessions |

### 5.5 Plugin Endpoints (User)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/plugins` | List enabled plugins |
| GET | `/plugins/{id}` | Plugin detail + input schema (incl. `schema_version`) |

### 5.6 Execution Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/execute/{plugin_id}` | Run plugin (stub); creates `executions` record |
| POST | `/outputs` | Save output to project |
| GET | `/outputs/{id}` | Get saved output |
| GET | `/executions/{id}` | Get execution record (status, result, timing) *(new)* |

**Execute request body:**

```json
{
  "project_id": "uuid",
  "inputs": { "keyword": "seo tools", "locale": "en-US" },
  "schema_version": 1
}
```

`schema_version` is supplied by the frontend (loaded with the plugin schema). If it does not match the plugin's current `schema_version`, the API returns `409 SCHEMA_OUTDATED` so the frontend can prompt the user to refresh the form before executing.

**Execute response (MVP stub):**

```json
{
  "execution_id": "uuid",
  "status": "completed",
  "output": {
    "markdown": "## Mock Result\n\nPlaceholder output for plugin execution.",
    "structured": {}
  },
  "workflow_steps": [
    { "step": 1, "label": "Validate inputs", "status": "done" },
    { "step": 2, "label": "Load prompt", "status": "done" },
    { "step": 3, "label": "AI execution", "status": "done" }
  ]
}
```

### 5.7 Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List users |
| POST | `/admin/users` | Create user |
| PATCH | `/admin/users/{id}` | Update user |
| DELETE | `/admin/users/{id}` | Deactivate user |
| GET | `/admin/plugins` | List all plugins |
| POST | `/admin/plugins` | Create plugin |
| PATCH | `/admin/plugins/{id}` | Update plugin (auto-increments `schema_version` if `input_fields` changed) |
| PATCH | `/admin/plugins/{id}/status` | Enable/disable |
| GET | `/admin/plugins/{id}/prompts` | List prompts |
| PUT | `/admin/plugins/{id}/prompts` | Upsert prompts |
| GET | `/admin/logs` | Activity logs (paginated) |
| GET | `/admin/dashboard` | Aggregate platform stats *(see §5.8)* |

### 5.8 Admin Dashboard Response *(new — defines previously unspecified payload)*

```json
{
  "total_active_users": 142,
  "total_projects": 318,
  "executions_last_7_days": 540,
  "new_signups_last_7_days": 12,
  "total_saved_outputs": 875,
  "top_plugins_last_30_days": [
    { "plugin_id": "uuid", "plugin_name": "Create SEO-Optimized Content", "execution_count": 210 },
    { "plugin_id": "uuid", "plugin_name": "Keyword Clustering", "execution_count": 175 }
  ]
}
```

All values are derived from `users`, `projects`, `executions`, and `outputs` — no new tables required.

---

## 6. Plugin Execution Framework (Technical)

### 6.1 Interface (Python)

```python
# backend/app/services/execution/base.py

class PromptLoader(Protocol):
    async def load(self, plugin_id: UUID, prompt_type: str) -> str: ...

class AIExecutor(Protocol):
    async def execute(self, prompt: str, inputs: dict) -> dict: ...

class ResponseProcessor(Protocol):
    def process(self, raw: dict, output_template: dict | None) -> dict: ...
```

### 6.2 MVP Implementations

| Component | Class | Behavior |
|-----------|-------|----------|
| PromptLoader | `prompt_loader.py` | Loads prompts from DB; substitutes `{{field}}` placeholders; maps select values to human-readable labels |
| AIExecutor | `ai_executor.py` | Calls Anthropic Claude when `ANTHROPIC_API_KEY` is set; otherwise returns structured stub/preview output |
| ResponseProcessor | `PassThroughProcessor` | Wraps raw in `output` envelope |

### 6.3 Plugin Definitions (JSON Seed)

Production plugins live in `backend/plugins/*.json`. Each file defines:

| Key | Purpose |
|-----|---------|
| `plugin_name`, `description`, `category`, `icon` | Library card metadata |
| `input_fields` | Dynamic form schema (rendered by frontend `DynamicForm`) |
| `prompts.system`, `prompts.primary` | Claude instructions and user message template |
| `deprecated_names` *(optional)* | Prior plugin names to disable on re-seed (renames) |

Seed with:

```bash
cd backend
python scripts/seed_plugins.py   # DATABASE_URL required
```

**12 MVP plugins** (see PRD §14): AI Visibility & Tracking, Broken Link Checker, Content Brief Generator, Content Strategy, Create SEO-Optimized Content, Create Topic, Internal Linking Strategy, Keyword Clustering, On-Page SEO Optimization, Generate Schema Markup, SEO Audit, Technical SEO Audit.

Legacy plugins from migration `002_seed_dev.sql` (Keyword Gap Analyzer, Meta Description Generator, Technical SEO Checklist) are **disabled** when `seed_plugins.py` runs.

### 6.4 Execution Pipeline *(updated — includes execution record + schema check)*

```python
async def run_plugin(plugin_id, project_id, inputs, schema_version, user_id):
    plugin = await get_plugin(plugin_id)

    if schema_version != plugin.schema_version:
        raise SchemaOutdatedError(plugin_id, plugin.schema_version)

    validate_inputs(plugin.input_fields, inputs)

    # Create execution record (status=pending -> running)
    execution_id = await create_execution(
        plugin_id=plugin_id, project_id=project_id,
        user_id=user_id, inputs=inputs, status="running"
    )

    try:
        prompt = await prompt_loader.load(plugin_id, "primary")
        raw = await ai_executor.execute(prompt, inputs)
        output = response_processor.process(raw, plugin.output_template)

        await complete_execution(execution_id, status="completed", result=output)
        await upsert_workspace_session(project_id, plugin_id, user_id, inputs)
        await log_activity(user_id, "plugin_execute", {
            "plugin_id": plugin_id, "project_id": project_id,
            "execution_id": execution_id
        })
        return output

    except Exception as e:
        await complete_execution(execution_id, status="failed", error_message=str(e))
        raise
```

**Changes from v1:**
- `executions` row is created at the start of every run (was previously optional/undefined).
- `schema_version` is validated before processing inputs.
- `workspace_sessions` is upserted on every successful run (formalizes the "resume session" behavior described in the PRD/app-flow).
- Activity log entry now references `execution_id` for cross-referencing.

Phase 5 swaps stub classes for real implementations via dependency injection — no changes to this pipeline's structure are required.

---

## 7. Frontend Architecture

### 7.1 Route Groups

| Group | Path Pattern | Layout |
|-------|--------------|--------|
| Marketing | `/`, `/features`, `/about`, `/contact`, `/login`, `/signup` | Marketing layout |
| App | `/dashboard`, `/plugins`, `/workspace/[id]`, `/projects`, `/profile` | App shell with sidebar |
| Admin | `/admin/*` | Admin shell |

### 7.2 Data Fetching

- Server Components for initial page data where possible
- Client components for workspace interactivity
- API client wrapper: `lib/api.ts` with `credentials: 'include'` for cookies, and automatic `X-CSRF-Token` header injection on mutating requests

### 7.3 Zustand Stores

| Store | Responsibility |
|-------|----------------|
| `useAuthStore` | Current user, login/logout actions |
| `useWorkspaceStore` | Active plugin, inputs, messages, notes, current `schema_version` |
| `useProjectStore` | Active project, project list cache |

### 7.4 Dynamic Plugin Forms

Plugin `input_fields` JSON rendered via a single `DynamicForm` component (`frontend/src/components/plugins/dynamic-form.tsx`) mapping types to ShadCN inputs:

| Field type | Rendered as |
|------------|-------------|
| `text`, `url` | `<Input>` |
| `textarea` | `<Textarea>` |
| `number` | `<Input type="number">` |
| `select` | Native `<select>` from `options[]` |
| `checkbox` | `<input type="checkbox">` |

Plugin cards and the workspace load schema from `GET /plugins` and `GET /plugins/{id}` (includes `schema_version`). Icons use Lucide keys mapped in `plugin-card.tsx`:

`eye`, `link`, `file-text`, `map`, `network`, `layers`, `scan-search`, `code`, `clipboard-check`, `gauge`, `pen-line`, `lightbulb` (fallback: `puzzle`).

If a restored `workspace_session.schema_version` differs from the plugin's current version, the frontend shows a non-blocking notice ("This plugin's form has been updated — please review your inputs") and does not silently auto-fill mismatched fields.

---

## 8. Database Access Layer

### 8.1 Connection Pool

```python
# asyncpg pool on app startup
pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
```

### 8.2 Query Pattern

```python
async def get_user_by_email(conn, email: str) -> User | None:
    row = await conn.fetchrow(
        "SELECT id, name, email, password_hash, role, created_at "
        "FROM users WHERE email = $1 AND deleted_at IS NULL",
        email,
    )
    return User(**row) if row else None
```

- Always use parameterized queries (`$1`, `$2`)
- No string interpolation of user input
- Transactions for multi-statement operations (e.g., execution pipeline: insert execution row → update on completion → upsert workspace session must be wrapped appropriately or use idempotent upserts)

### 8.3 Migrations

Numbered SQL files in `backend/migrations/`. Updated order to reflect schema additions:

```
001_extensions.sql
002_types.sql
003_users.sql
004_sessions.sql
005_projects.sql
006_plugins.sql            -- includes schema_version column
007_prompts.sql
008_outputs.sql            -- includes schema_version in input_snapshot
009_workspace_sessions.sql -- includes schema_version
010_activity_logs.sql
011_executions.sql         -- now mandatory, not optional
012_triggers.sql
013_seed_dev.sql
```

---

## 9. Security Requirements

| Control | Implementation |
|---------|----------------|
| Password storage | bcrypt (cost 12) or argon2id |
| Session fixation | Regenerate session ID on every login (user and admin) |
| CSRF | **Required** — double-submit cookie token validated on all non-GET `/api/v1/*` requests |
| Rate limiting | Login, admin login (separate counter), and signup: 5 attempts / 15 min / IP |
| Input validation | Pydantic + Zod on all boundaries |
| SQL injection | Parameterized queries only |
| XSS | React escaping; sanitize markdown output when rendered |
| CORS | Allow only frontend origin; credentials: true |
| Secrets | Environment variables; never committed |
| Schema integrity *(new)* | `schema_version` check prevents executing against stale/mismatched input schemas |

---

## 10. Logging & Observability

### 10.1 Activity Logs (Business)

Persisted to `activity_logs` table — user actions for admin audit. Retained indefinitely in MVP (per PRD §10).

### 10.2 Execution Records (New Layer)

Persisted to `executions` table — full input/output payloads per run, status tracking, retained 30 days (per `backend-schema.md` §9). Used for: admin dashboard stats (§5.8), debugging, and Phase 5 retry/streaming foundation.

### 10.3 Application Logs (Technical)

- Structured JSON logs (stdlib `logging` + `python-json-logger`)
- Log level: INFO in production, DEBUG in dev
- Request ID middleware for correlation; include `execution_id` in logs during plugin runs

### 10.4 Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /health/ready` | DB connectivity |

---

## 11. Environment Variables

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=SkillSearchFit
```

### Backend (`.env`)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/skillsearchfit
SESSION_SECRET=<32+ byte random>
SESSION_MAX_AGE=604800
CSRF_SECRET=<32+ byte random>
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_LOGIN=5/15m
RATE_LIMIT_ADMIN_LOGIN=5/15m
RATE_LIMIT_SIGNUP=5/15m
ENVIRONMENT=development
ANTHROPIC_API_KEY=              # optional — leave empty for preview/stub mode
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=8192
```

`app/config.py` loads `backend/.env` by absolute path. The API key must be on the **same line** as `ANTHROPIC_API_KEY=` (no line break in the value). Restart the backend after changing `.env`.

Verify prompts (no API calls): `python scripts/verify_claude_plugins.py`  
Run live Claude for all plugins: `python scripts/verify_claude_plugins.py --execute`

---

## 12. Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Backend unit | pytest | Services, validation, execution stubs, schema-version checks |
| Backend integration | pytest + test DB | Auth (incl. CSRF + rate limiting), CRUD, execute flow, executions records |
| Frontend unit | Vitest | Utils, Zod schemas |
| E2E | Playwright (Phase 2+) | Login, launch plugin, save output, schema-version mismatch flow |

MVP minimum: auth integration tests (incl. CSRF and rate limiting) + plugin execute stub test (incl. `executions` record creation).

---

## 13. CI/CD (Recommended)

1. Lint: `ruff`, `eslint`, `tsc --noEmit`
2. Test: `pytest`, `vitest`
3. Build: Docker image for API; Next.js build for frontend
4. Deploy: staging on merge to `main`

---

## 14. Phase 5 Extension Points

| Extension | Integration Point |
|-----------|-------------------|
| OpenAI / Anthropic | Replace `StubAIExecutor` |
| Prompt templates | `PromptLoader` reads `prompts` table; supports variables |
| Workflow engine | Expand `workflow_steps` in execute response; state machine driven by `executions.status` |
| Streaming | SSE endpoint `/execute/{id}/stream`, updating `executions` row incrementally |
| File uploads | S3-compatible storage; new `attachments` table |
| Retry | Re-run using `executions.inputs` from a `failed` record |

No changes required to: session auth, plugin CRUD, workspace layout, project model. The `executions` table (now mandatory in MVP) directly enables streaming and retry without new schema work.

---

## 15. Performance Targets

| Metric | Target |
|--------|--------|
| API read p95 | < 200ms |
| API write p95 | < 400ms |
| Execute stub p95 | < 3s (includes artificial delay) |
| DB connection pool wait | < 50ms |
| Frontend FCP | < 1.5s |

---

## 16. Summary of Changes from v1.0

| Area | Change | Why |
|------|--------|-----|
| CSRF | Marked required (was "optional" in v1, conflicting with PRD) | Resolves PRD/TRD inconsistency; closes security gap |
| Rate limiting | Extended to `/auth/signup`; admin login tracked separately | Reduces brute-force/enumeration surface |
| `executions` table | Promoted from optional to mandatory; wired into execution pipeline | Enables audit trail, dashboard stats, Phase 5 retry/streaming with no migration later |
| Execution pipeline (§6.3) | Rewritten to include execution record creation, schema-version check, workspace session upsert | Implements behaviors described but not specified in v1 |
| `schema_version` | Added to `plugins`, `execute` request, `workspace_sessions`, `outputs.input_snapshot` | Implements PRD's "versioned schema" mitigation |
| Admin dashboard | Defined response payload (§5.8) | Was unspecified in v1, blocking Phase 4 |
| Session design | Explicit fixed-expiry policy (§4.5); session ID regeneration on every login | Removes ambiguity, hardens against fixation |
| Migration order | Updated to reflect new columns and mandatory `executions` | Keeps schema and migration plan in sync |
| New endpoint | `GET /executions/{id}` | Supports debugging and future retry/streaming UI |
| Plugin definitions | §6.3 JSON seed, Claude integration, 12 MVP plugins | Documents implemented plugin catalog and seed workflow |
| Frontend forms | §7.4 expanded with field types and icon keys | Aligns docs with `DynamicForm` and `plugin-card.tsx` |

---

## 17. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-11 | Initial TRD |
| 2.0 | 2026-06-11 | Required CSRF, expanded rate limiting, mandatory executions table, schema versioning, admin dashboard spec, fixed session expiry policy |
| 2.1 | 2026-06-11 | Plugin JSON seed, Claude/stub executor, 12-plugin catalog, frontend icon/form mapping |
