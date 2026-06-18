# SkillSearchFit SEO AI Platform — Documentation

MVP planning documents for the SkillSearchFit SEO AI workspace.

## Documents

| Document | Description |
|----------|-------------|
| [PRD.md](./PRD.md) | Product Requirements Document — goals, features, roles, phases |
| [TRD.md](./TRD.md) | Technical Requirements Document — stack, API, auth, architecture |
| [app-flow.md](./app-flow.md) | User journeys, navigation, sequence diagrams |
| [ui-ux-brief.md](./ui-ux-brief.md) | Visual language, layouts, component specs |
| [backend-schema.md](./backend-schema.md) | PostgreSQL tables, indexes, queries, migrations |

## Development Phases

1. **Phase 1** — Platform foundation (auth, users, DB)
2. **Phase 2** — App framework (dashboard, projects, workspace shell)
3. **Phase 3** — Plugin architecture (library, builder, execution stub)
4. **Phase 4** — Admin portal
5. **Phase 5** — Prompt & AI integration (post-skeleton)

## Stack Summary

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind, ShadCN, Zustand
- **Backend:** Python FastAPI
- **Database:** PostgreSQL (raw SQL via asyncpg/psycopg)
- **Auth:** Server-side sessions (no JWT, no OAuth)

## Plugin Catalog (MVP)

**12 production plugins** ship as JSON definitions in `backend/plugins/` and are seeded via `python scripts/seed_plugins.py`. Categories:

| Category | Count | Plugins |
|----------|-------|---------|
| Visibility | 1 | AI Visibility & Tracking |
| Research | 2 | Create Topic, Keyword Clustering |
| Content | 4 | Content Brief Generator, Content Strategy, Create SEO-Optimized Content, On-Page SEO Optimization |
| Technical | 5 | Broken Link Checker, Generate Schema Markup, Internal Linking Strategy, SEO Audit, Technical SEO Audit |

Suggested content workflow: **Create Topic** → **Content Brief Generator** → **Create SEO-Optimized Content**. See [PRD §14](./PRD.md#14-appendix-mvp-plugin-catalog) for the full catalog and [backend/plugins/README.md](../backend/plugins/README.md) for JSON schema and input fields.
