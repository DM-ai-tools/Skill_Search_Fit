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

## Documentation

See [docs/README.md](./docs/README.md) for PRD, TRD, app flow, UI brief, and backend schema.
