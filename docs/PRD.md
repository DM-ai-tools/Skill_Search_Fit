# Product Requirements Document (PRD)

## SkillSearchFit SEO AI Platform — MVP

| Field | Value |
|-------|-------|
| **Product** | SkillSearchFit SEO AI Platform |
| **Version** | MVP 2.0 |
| **Status** | Draft |
| **Last Updated** | June 11, 2026 |
| **Sister Brand** | ClickTrends (linked, not shared UI/architecture) |
| **Supersedes** | PRD v1.0 |

---

## 1. Executive Summary

SkillSearchFit is a standalone AI-powered SEO workspace inspired by Claude CoWork's Skill SearchFit SEO functionality. The MVP delivers a **framework-first platform** where plugins, prompts, and AI workflows can be added incrementally without architectural rework.

The product is not a monetization platform at launch. It is a functional SEO AI workspace skeleton with user management, plugin architecture, an interactive workspace, and an admin portal.

---

## 2. Problem Statement

SEO professionals need a structured, repeatable environment to run AI-assisted SEO workflows — keyword research, content optimization, technical audits, and similar tasks — without rebuilding tooling for each use case.

Existing general-purpose AI chat tools lack:

- SEO-specific workflow structure
- Persistent projects and saved outputs
- Admin-controlled plugin catalog
- A dedicated workspace layout for multi-step SEO tasks

---

## 3. Product Vision

A professional, enterprise-grade SEO AI workspace where:

1. Users discover and launch SEO plugins from a library
2. Each plugin opens a dedicated three-panel workspace
3. Inputs are validated, prompts are executed (placeholder in MVP), and outputs are saved to projects
4. Admins manage users, plugins, prompts, and activity without code deployments

---

## 4. Goals & Success Criteria

### 4.1 MVP Goals

| Goal | Success Metric |
|------|----------------|
| Framework complete | All core routes and layouts functional |
| Auth working | Users and admins can sign up, log in, and maintain sessions |
| Plugin system ready | Plugins can be created, listed, launched, and executed (stubbed AI) |
| Workspace functional | Three-panel workspace renders with inputs, conversation area, and side tools |
| Admin portal live | CRUD for users, plugins, prompts; activity log viewable |
| Prompt-ready | Execution pipeline has placeholder hooks for future prompt/AI integration |
| **Audit-ready** *(new)* | Every plugin execution is recorded with inputs, status, and result for traceability |

### 4.2 Non-Goals (Explicitly Out of Scope)

- Subscription or billing systems
- Payment gateways
- Usage metering or quotas
- Advanced RBAC beyond User and Admin
- Multi-tenant architecture
- OAuth / social login (Google, Microsoft, etc.)
- JWT-based authentication
- Actual AI provider integration (Phase 5)
- Production prompt content (supplied later)

---

## 5. Target Users

### 5.1 Primary: SEO Practitioner (User Role)

- Runs SEO workflows via plugins
- Creates and manages projects
- Saves and revisits outputs
- Uses workspace for iterative AI-assisted work

### 5.2 Secondary: Platform Administrator (Admin Role)

- Manages user accounts
- Creates and configures plugins
- Enables/disables plugins
- Manages prompt templates (structure only in MVP)
- Reviews activity logs and platform-level usage stats

### 5.3 Tertiary: Public Visitor

- Views marketing pages
- Signs up or logs in

---

## 6. User Roles & Permissions

| Capability | User | Admin |
|------------|:----:|:-----:|
| Sign up / Log in | ✓ | ✓ (separate route) |
| Access dashboard & workspace | ✓ | ✓ |
| Browse plugin library | ✓ | ✓ |
| Run plugins / workflows | ✓ | ✓ |
| Create / rename / delete projects | ✓ | ✓ |
| Save outputs | ✓ | ✓ |
| Create / edit plugins | — | ✓ |
| Enable / disable plugins | — | ✓ |
| Manage users | — | ✓ |
| Manage prompts | — | ✓ |
| View activity logs | — | ✓ |
| **View platform stats dashboard** *(new)* | — | ✓ |

---

## 7. Product Areas

### 7.1 Public Website (Unauthenticated)

| Page | Purpose |
|------|---------|
| Home | Value proposition, "How it works" overview, CTA to sign up |
| Features | Platform capabilities overview |
| About | Product and brand story |
| Contact | Contact form or contact details |
| Login | User authentication |
| Signup | User registration (name, email, password) |

### 7.2 Application (Authenticated — User)

| Page | Purpose |
|------|---------|
| Dashboard | Overview, recent projects, quick plugin access |
| Plugin Library | Browse and launch enabled plugins |
| Workspace | Per-plugin interactive environment |
| Projects | List, create, rename, delete projects |
| Profile | Account settings (name, email; password change) |

### 7.3 Admin Portal (Authenticated — Admin)

| Page | Purpose |
|------|---------|
| Dashboard | Platform stats summary (see §8.9) |
| User Management | List, create, edit, deactivate users |
| Plugin Management | CRUD, enable/disable, input field builder |
| Prompt Management | Associate prompts with plugins (content optional in MVP) |
| Activity Logs | Searchable/filterable audit trail |

---

## 8. Core Features

### 8.1 Authentication & Sessions

**User Signup**

- Fields: Name, Email, Password
- Email uniqueness enforced
- Password hashed server-side (bcrypt or argon2)
- Default role: `user`

**User Login**

- Fields: Email, Password
- Server-side session created on success; session ID regenerated to prevent fixation
- Session cookie: HttpOnly, Secure (production), SameSite=Lax

**Admin Login**

- Separate route: `/admin/login`
- Same credential model; role must be `admin`
- Distinct session scope or role flag in session
- Failed admin login attempts are rate-limited and logged separately from user login attempts (see §10 Security)

**Session Payload**

- `user_id`
- `login_status` (authenticated boolean)
- `role` (`user` | `admin`)

**Session Lifetime**

- Fixed (hard) expiry, default **7 days (TTL configurable)**. No sliding-window renewal in MVP — simpler to reason about and test. Re-authentication required after expiry regardless of activity.

No JWT. No OAuth. No social providers.

---

### 8.2 Plugin System

Every plugin is a first-class entity with:

| Attribute | Description |
|-----------|-------------|
| Plugin Name | Display name |
| Description | Short summary for library cards |
| Icon | Visual identifier (URL or icon key) |
| Category | Grouping (e.g., Research, Content, Technical) |
| Input Form | JSON-defined dynamic form fields |
| Schema Version *(new)* | Integer, increments when `input_fields` changes meaningfully |
| Prompt Configuration | Linked prompts (empty/stub in MVP) |
| Output Template | Structure for rendering results |
| Status | `enabled` \| `disabled` |

**Schema versioning rationale:** if an admin edits a plugin's input fields after users have saved sessions/outputs against the old schema, the version number lets the frontend detect a mismatch and prompt the user to re-fill rather than silently rendering a broken form. This does not change the plugin CRUD flow — it is an additional field carried alongside existing data.

**MVP behavior:** Plugins render input forms, pass validation, invoke placeholder execution, and display stub output.

---

### 8.3 Plugin Library

- Card layout: Icon, Name, Description, Category badge, Launch button
- Only `enabled` plugins visible to users
- Launch navigates to `/workspace/[pluginId]` (optionally scoped to a project)
- **MVP ships 12 plugins** across four categories (Visibility, Research, Content, Technical) — see [§14 Appendix: MVP Plugin Catalog](#14-appendix-mvp-plugin-catalog)
- Plugins are defined as JSON in `backend/plugins/` and seeded with `scripts/seed_plugins.py`; legacy dev seed plugins from migration `002_seed_dev.sql` are disabled on re-seed

---

### 8.4 Workspace

Three-panel layout when a plugin is launched:

| Panel | Contents |
|-------|----------|
| **Left** | Plugin input form, project history, saved sessions, Run button |
| **Center** | AI conversation thread, workflow steps, generated outputs |
| **Right** | Notes, export options, saved results |

**MVP:** Center panel shows placeholder conversation and mock workflow steps, with a persistent "Preview mode" indicator. Right panel supports notes (persisted per session). Export can be copy-to-clipboard or JSON download stub.

**Saved Sessions behavior** *(clarified)*: every successful plugin execution upserts the user's `workspace_sessions` record for that project+plugin pair (last inputs + notes), independent of whether the user explicitly clicks "Save Output." This means "resume where I left off" always reflects the most recent run, while "Saved Results" (outputs) only reflects runs the user explicitly chose to keep.

---

### 8.5 Plugin Execution Pipeline

```
Input Form → Validation → Prompt Loading → AI Execution → Response Processing → Output Display → Execution Record
```

| Stage | MVP Implementation |
|-------|-------------------|
| Input Form | Dynamic render from plugin `input_fields` JSON (versioned) |
| Validation | Zod (frontend) + Pydantic (backend) |
| Prompt Loading | Placeholder: returns empty or sample prompt |
| AI Execution | Placeholder: returns mock response after delay |
| Response Processing | Pass-through formatter |
| Output Display | Render in center + option to save to project |
| **Execution Record** *(new — see §8.8)* | Every run is recorded (start, status, result/error, completion) |

---

### 8.6 Project Management

Users can:

- Create a project (name required, unique per user)
- Rename a project
- Delete a project — **soft delete**, retained 30 days, then hard-deleted along with cascaded outputs (this resolves PRD v1 Open Question #3 — see §13)
- Associate plugin runs with a project
- Save generated outputs to a project
- Resume previous sessions (load last inputs/outputs for a project+plugin pair)

---

### 8.7 Admin Plugin Builder

Admin creates/edits plugins with:

- Name, Description, Category, Icon
- Input field builder (field name, type, label, required, options for select)
- Prompt section (editable textarea per prompt type, optional in MVP)
- Enable/disable toggle
- **Schema version is auto-incremented** by the system whenever `input_fields` is changed and saved — no manual admin action required

---

### 8.8 Activity Logging & Execution Records

**Activity Logs** (existing, business-level audit trail):

- User login / logout
- Project create / rename / delete
- Plugin launch
- Plugin execution (stub)
- Admin: user CRUD, plugin CRUD, prompt edits

**Execution Records** *(promoted from optional to required in MVP)*:

Every plugin run creates a row in `executions` capturing inputs, status (`pending` → `running` → `completed`/`failed`), result payload, and timing. This is distinct from `activity_logs`:

| | `activity_logs` | `executions` |
|---|---|---|
| Purpose | Human-readable audit trail | Machine-readable run history |
| Granularity | One entry per significant action | One row per plugin run, with full input/output payload |
| Used for | Admin audit view | Future retry, debugging, Phase 5 streaming state |

Including `executions` in MVP (rather than deferring) costs one additional table write per run and removes the need for a Phase 5 data migration.

---

### 8.9 Admin Dashboard Stats *(new — resolves PRD v1 Open Question, undefined metrics)*

The `/admin/dashboard` endpoint and page display the following at-a-glance metrics:

| Metric | Source |
|--------|--------|
| Total active users | `COUNT(users) WHERE deleted_at IS NULL` |
| Total projects | `COUNT(projects) WHERE deleted_at IS NULL` |
| Plugin executions (last 7 days) | `COUNT(executions) WHERE started_at >= NOW() - INTERVAL '7 days'` |
| Most-used plugins (top 5) | `executions` grouped by `plugin_id`, last 30 days |
| Total saved outputs | `COUNT(outputs)` |
| New signups (last 7 days) | `COUNT(users) WHERE created_at >= NOW() - INTERVAL '7 days'` |

This list is intentionally small for MVP — all metrics are derivable from existing tables with no new schema.

---

## 9. Functional Requirements

### FR-001: User Registration

- System shall accept name, email, password on signup
- System shall reject duplicate emails with a clear error message
- System shall hash passwords before storage
- System shall create session and redirect to dashboard on success
- System shall rate-limit signup attempts (see §10)

### FR-002: User Login

- System shall authenticate email + password
- System shall issue server-side session cookie, regenerating the session ID on successful login
- System shall redirect unauthenticated users from app routes to login

### FR-003: Admin Login

- System shall expose `/admin/login` as a separate entry point
- System shall reject non-admin credentials with a generic error (no role enumeration)
- System shall scope admin routes to `role = admin`
- System shall rate-limit admin login attempts independently from user login attempts

### FR-004: Session Management

- System shall store `user_id`, login status, and `role` in session
- System shall invalidate session on logout
- System shall expire sessions after a fixed TTL (default 7 days, no sliding renewal)

### FR-005: Plugin Library

- System shall list all enabled plugins for authenticated users
- System shall display plugin cards with icon, name, description, category, launch CTA

### FR-006: Workspace

- System shall render three-panel layout per launched plugin
- System shall load plugin input schema dynamically, including its `schema_version`
- System shall persist notes and outputs when user saves
- System shall upsert `workspace_sessions` on every successful execution

### FR-007: Plugin Execution (Stub)

- System shall validate inputs before execution
- System shall call placeholder prompt loader and AI executor
- System shall return mock output within 1–3 seconds
- System shall create an `executions` record for every run (pending → completed/failed)
- System shall allow saving output to the active project

### FR-008: Projects

- System shall support CRUD on projects scoped to owning user
- System shall enforce unique project names per user
- System shall associate outputs with `project_id` and `plugin_id`
- System shall soft-delete projects, retaining cascaded outputs for 30 days before hard delete

### FR-009: Admin User Management

- Admin shall list, create, edit, and deactivate users
- Admin shall assign role (`user` | `admin`)

### FR-010: Admin Plugin Management

- Admin shall create, edit, enable, and disable plugins
- Admin shall define input fields via structured JSON or builder UI
- System shall auto-increment `schema_version` when `input_fields` changes

### FR-011: Admin Prompt Management

- Admin shall attach prompt records to plugins by `prompt_type`
- Prompt content may be empty in MVP; structure must be persisted

### FR-012: Activity Logs

- System shall write log entries for defined actions
- Admin shall view paginated, filterable log list

### FR-013: Admin Dashboard *(new)*

- System shall expose aggregate platform statistics as defined in §8.9
- Admin shall view these statistics on `/admin/dashboard`

---

## 10. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Page load < 2s on broadband; API p95 < 500ms (excl. future AI calls) |
| **Security** | Password hashing, HttpOnly cookies, **CSRF protection (required — double-submit token on all state-changing requests)**, input sanitization |
| **Security — Rate Limiting** *(expanded)* | Login (`/auth/login`): 5 attempts / 15 min / IP. Admin login (`/auth/admin/login`): 5 attempts / 15 min / IP, tracked separately. Signup (`/auth/signup`): 5 attempts / 15 min / IP |
| **Accessibility** | WCAG 2.1 AA target for core flows |
| **Browser Support** | Latest Chrome, Firefox, Safari, Edge (last 2 versions) |
| **Responsiveness** | Desktop-first; tablet usable; mobile degraded but functional for library/dashboard |
| **Maintainability** | Clear separation: marketing site, app, admin, API |
| **Deployability** | Frontend (Vercel/similar), Backend (container), PostgreSQL managed |
| **Auditability** *(new)* | Every plugin execution recorded in `executions`; activity logs retained indefinitely in MVP |

**Note on CSRF:** PRD v1 listed CSRF as a security requirement while the TRD marked it optional. v2 resolves this conflict — CSRF protection (double-submit cookie pattern, token issued at session creation, validated on all non-GET requests) is **required** for MVP.

---

## 11. Development Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| **1** | Foundation | Next.js app, FastAPI API, PostgreSQL, session auth (incl. CSRF), user CRUD |
| **2** | App Framework | Dashboard, nav, projects, workspace shell |
| **3** | Plugin Architecture | Plugin DB (incl. schema_version), library, builder, execution stub + execution records |
| **4** | Admin Portal | Users, plugins, prompts, logs, dashboard stats |
| **5** | Prompt Integration | Real prompts, AI provider, workflow engine |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep into billing/auth | Delays MVP | Enforce non-goals list; defer OAuth/JWT |
| Plugin schema too rigid | Hard to add plugins later | JSON-driven input forms; **versioned schema (now implemented via `schema_version`)** |
| Workspace UX complexity | Slow Phase 2 | Ship shell first; iterate panels incrementally |
| Prompt content dependency | Blocks perceived value | Stub execution; clear Phase 5 boundary |
| **Stale workspace sessions after schema change** *(new)* | User restores a session with an outdated form shape | `schema_version` mismatch detected on load; frontend prompts re-entry |
| **CSRF/session gaps deferred to "later"** *(new)* | Security debt baked into MVP | CSRF required from Phase 1, not optional |

---

## 13. Decisions (Resolved from v1 Open Questions)

| # | Question | Resolution |
|---|----------|------------|
| 1 | Brand domain and logo assets? | Placeholder branding in MVP (unchanged) |
| 2 | ClickTrends cross-link placement? | Footer "Sister product" link only (unchanged) |
| 3 | Project delete: hard vs soft? | **Resolved: soft-delete projects, retain outputs 30 days, then hard delete** (already reflected in schema; now formally adopted) |
| 4 | Session store: DB vs Redis? | PostgreSQL session table for MVP simplicity (unchanged) |
| 5 | Icon storage: URL vs upload? | Icon key/URL string; upload in v1.1 (unchanged) |

No open questions remain blocking for MVP.

---

## 14. Appendix: MVP Plugin Catalog

Twelve SearchFit.ai workflow plugins are implemented for MVP. Each plugin has a JSON definition (`backend/plugins/*.json`), `system` + `primary` prompts, and a dynamic input form rendered by the workspace.

| Plugin | Category | Icon key | Primary purpose |
|--------|----------|----------|-----------------|
| AI Visibility & Tracking | visibility | `eye` | Track brand visibility across AI platforms |
| Create Topic | research | `lightbulb` | Generate topic ideas, clusters, publishing order |
| Keyword Clustering | research | `layers` | Cluster keywords by intent; map to content pieces |
| Content Brief Generator | content | `file-text` | Detailed writer-ready content briefs |
| Content Strategy | content | `map` | Topical authority map, gap analysis, calendar |
| Create SEO-Optimized Content | content | `pen-line` | Full SEO articles with metadata, FAQ, schema |
| On-Page SEO Optimization | content | `scan-search` | Page-level on-page audit and rewrite recommendations |
| Broken Link Checker | technical | `link` | Find and fix broken internal/external links |
| Generate Schema Markup | technical | `code` | JSON-LD structured data + framework integration |
| Internal Linking Strategy | technical | `network` | Site-wide internal linking plan |
| SEO Audit | technical | `clipboard-check` | Comprehensive SEO audit workflow |
| Technical SEO Audit | technical | `gauge` | Deep technical SEO audit (CWV, headers, stack) |

**Recommended workflows**

| Workflow | Plugin sequence |
|----------|-----------------|
| Content creation | Create Topic → Content Brief Generator → Create SEO-Optimized Content |
| Keyword → content plan | Keyword Clustering → Content Strategy |
| Page optimization | On-Page SEO Optimization → Generate Schema Markup |
| Site health | SEO Audit → Technical SEO Audit → Broken Link Checker → Internal Linking Strategy |

**Seeding:** run `cd backend && python scripts/seed_plugins.py` (requires `DATABASE_URL`). Re-seeding upserts prompts and bumps `schema_version` when `input_fields` change. Renamed plugins use `deprecated_names` in JSON to disable old records.

**AI execution:** when `ANTHROPIC_API_KEY` is set, plugins call Claude; otherwise the execution engine returns structured preview/stub output.

---

## 15. Appendix: Plugin Input Field Types (MVP)

| Type | Use Case |
|------|----------|
| `text` | Short strings (keyword, URL) |
| `textarea` | Long text (content brief, meta description draft) |
| `number` | Counts, scores |
| `select` | Predefined options (locale, intent) |
| `url` | Validated URL input |
| `checkbox` | Boolean flags |

---

## 16. Summary of Changes from v1.0

| Area | Change | Why |
|------|--------|-----|
| Plugin schema | Added `schema_version` field and behavior | Resolves v1's stated-but-unimplemented "versioned schema" mitigation |
| Execution tracking | `executions` table promoted from optional to required | Enables audit trail and Phase 5 retry/streaming with no later migration |
| CSRF | Resolved PRD/TRD conflict — now required | Closes a real security gap |
| Rate limiting | Extended to signup; admin login tracked separately | Reduces enumeration/brute-force surface |
| Session expiry | Explicitly fixed (hard expiry, 7-day default) | Removes ambiguity for implementation |
| Admin dashboard | Defined concrete stat set (§8.9) | Was previously undefined, blocking Phase 4 |
| Project delete | Open Question #3 formally resolved (soft-delete, 30-day retention) | Already implied by schema; now explicit |
| Workspace sessions | Clarified upsert-on-every-execute behavior | Prevents ambiguity between "resume session" and "saved outputs" |
| Goals | Added "Audit-ready" MVP goal | Reflects the new execution-record requirement |
| Plugin catalog | Added §14 — 12 MVP plugins with workflows and seeding | Documents implemented SearchFit.ai skill set |

---

## 17. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-11 | — | Initial MVP PRD |
| 2.0 | 2026-06-11 | — | Resolved open questions, closed PRD/TRD conflicts, added schema versioning, execution records, admin dashboard spec |
| 2.1 | 2026-06-11 | — | Added MVP plugin catalog (12 plugins), seeding workflow, recommended plugin sequences |
