# SkillSearchFit SEO AI Platform

MVP 2.0 — framework-first SEO AI workspace with plugin architecture, session auth, CSRF protection, and admin portal.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand |
| Backend | Python FastAPI, asyncpg |
| Database | PostgreSQL 16 |

## Quick start

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
python scripts/migrate.py
python scripts/seed_admin.py
python scripts/seed_plugins.py
# Add ANTHROPIC_API_KEY to .env for live Claude (restart backend after saving)
uvicorn app.main:app --reload --port 8000
```

Default admin: `admin@skillsearchfit.local` / `Admin123!`

### 3. Frontend

```bash
cd frontend
copy .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Testing and shared API types

### Backend integration tests

```bash
cd backend
pytest tests/integration -m integration
```

### Frontend E2E (Playwright)

```bash
cd frontend
npx playwright install
npm run test:e2e
```

### OpenAPI-generated frontend types

```bash
cd backend
python scripts/export_openapi.py

cd ../frontend
npm run types:openapi
```

## Project structure

```
├── docs/           # PRD, TRD, schema, UI brief
├── backend/        # FastAPI API
├── frontend/       # Next.js app
└── docker-compose.yml
```

## Key routes

| Area | Routes |
|------|--------|
| Marketing | `/`, `/features`, `/about`, `/contact`, `/login`, `/signup` |
| App | `/dashboard`, `/plugins`, `/workspace/[id]`, `/projects`, `/profile` |
| Admin | `/admin/login`, `/admin/dashboard`, `/admin/users`, `/admin/plugins`, `/admin/prompts`, `/admin/logs` |

## API

Base URL: `http://localhost:8000/api/v1`

- Session cookie: `ssf_session` (HttpOnly)
- CSRF cookie: `ssf_csrf` (readable; sent as `X-CSRF-Token` header on mutating requests)
- OpenAPI docs: http://localhost:8000/docs

### Pipeline execution

| Endpoint | Inter-skill review | Use when |
|----------|-------------------|----------|
| `POST /pipelines/{id}/runs` | **Yes** — pauses between steps for input review | Dashboard Run Audit, pipeline view, any UI that should let users edit next-step inputs |
| `POST /pipelines/{id}/continue` | Continues a paused run with optional `edited_inputs` | After review UI |
| `POST /pipelines/{id}/execute-step` | **No** — legacy single-step loop | Avoid for new features |
| `POST /pipelines/{id}/execute` | **No** — runs all steps unattended | Avoid for new features |

Frontend: use `runPipelineWithReview()` from `frontend/src/lib/pipeline-run-orchestrator.ts` with `POST /pipelines/{id}/runs`.

## Railway deployment

Deploy as **two services** from this monorepo (Postgres plugin or external database required for the API).

| Service | Root directory | Builder |
|---------|----------------|---------|
| API | `backend` | `Dockerfile` (see `backend/railway.toml`) |
| Worker | `backend` | `Dockerfile.worker` (see `backend/railway.worker.toml`) |
| Web | `frontend` | `Dockerfile` (see `frontend/railway.toml`) |

1. Create a Postgres database and attach `DATABASE_URL` to the API service.
2. Copy variables from [`railway.env.example`](./railway.env.example) into each service.
3. Set `CORS_ORIGINS` on the API to your web service public URL.
4. Set `API_PROXY_TARGET` on the web service to your API public URL (no trailing slash).
5. Set `NEXT_PUBLIC_API_URL` on the web service **before build** to `https://<web>/api/v1`.
6. Deploy API first; the container runs migrations, seeds admin/plugins, then binds `0.0.0.0:$PORT`.
7. Deploy Worker service; it runs Arq jobs from Redis (`python scripts/run_worker.py`).

Health checks: API `/health`, web `/`.

## Documentation

See [docs/README.md](./docs/README.md) for PRD, TRD, app flow, UI brief, and backend schema.
