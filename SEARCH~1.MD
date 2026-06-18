# SearchFit SEO Plugin — High-Value Feature Combination Analysis

**Date:** June 12, 2026
**Scope analyzed:** Every file in the installed `searchfit-seo` plugin — `README.md`, 3 agents (`agents/seo-auditor`, `agents/content-strategist`, `agents/competitor-analyzer`), 6 commands (`create-topic`, `create-content`, `keyword-cluster`, `seo-check`, `generate-schema`, `translate-content`), and 11 skills (`seo-audit`, `technical-seo`, `on-page-seo`, `broken-links`, `internal-linking`, `schema-markup`, `content-strategy`, `content-brief`, `keyword-clustering`, `ai-visibility`, `content-translation`). All capabilities cited below exist in those files.

---

## Summary Table

| # | Combination | Components (all real) | Outcome | Impact | Ease | Revenue |
|---|---|---|---|---|---|---|
| 1 | **Competitor-Informed Content Production Pipeline** | Competitor Analyzer agent → `/create-topic` → `keyword-clustering` → `content-brief` → `/create-content` → `internal-linking` | Gap-driven articles published with briefs, schema, and link wiring — end to end | 9 | 8 | 9 |
| 2 | **Audit → Prioritize → Fix → Verify Loop** | SEO Auditor agent → `technical-seo` + `broken-links` + `on-page-seo` + `schema-markup` → `/seo-check` | Self-healing site: scored audit becomes applied fixes, then re-verified | 9 | 9 | 7 |
| 3 | **AI Visibility (GEO) Flywheel** | `ai-visibility` → Competitor Analyzer agent → `/create-content` → `/generate-schema` → `/seo-check` | Brand earns mentions/recommendations in ChatGPT, Claude, Gemini, Perplexity | 8 | 7 | 9 |

---

## Combination 1: Competitor-Informed Content Production Pipeline

### Features involved

- **Competitor Analyzer agent** — Phase 4 "Gap & Opportunity Analysis" outputs "Topics They Cover That You Don't" with priorities (`agents/competitor-analyzer/AGENT.md`)
- **`/create-topic`** — turns a seed into 10 scored topic ideas with intent, funnel stage, difficulty, and a cluster map (`commands/create-topic.md`)
- **`keyword-clustering` skill** — one-cluster-one-page mapping, cannibalization rules (`skills/keyword-clustering/SKILL.md`)
- **`content-brief` skill** — SERP analysis, outline, keyword placement table, internal links, schema type (`skills/content-brief/SKILL.md`)
- **`/create-content`** — full article with metadata, `[INTERNAL LINK: ...]` markers, JSON-LD (`commands/create-content.md`)
- **`internal-linking` skill** — hub-and-spoke wiring, "Recommended Link Additions" table (`skills/internal-linking/SKILL.md`)

### Why they complement each other

Each component's output is the next one's required input. The Competitor Analyzer produces gap topics but no execution; `/create-content` executes but needs a validated topic and brief to avoid writing the wrong thing; `internal-linking` is what makes a new article actually rank by connecting it to the cluster. Individually each is a fragment; chained, they're a content factory.

### Workflow

1. Competitor Analyzer crawls competitors via WebFetch/WebSearch → gap table with priorities.
2. Each high-priority gap is fed as the `seed` to `/create-topic` → topic plan with funnel stage and publishing order.
3. `keyword-clustering` maps topics to pages, guaranteeing no two articles target the same cluster.
4. `content-brief` analyzes the live SERP for each cluster's primary keyword → outline, word count, differentiation angle.
5. `/create-content` writes the article from the brief, embedding schema and internal-link markers.
6. `internal-linking` resolves the markers against the actual site structure and adds reciprocal links from existing pages.

### Information passed between modules

Gap topics + priority → seed keyword + audience → keyword clusters with primary/secondary roles → brief (outline, keyword placement, schema type, link targets) → finished article with link markers → from/to/anchor-text link table.

### SEO/business outcome

Topical authority built precisely where competitors are weak; ranked content shipped in hours instead of weeks; zero keyword cannibalization by design.

### Why valuable for users

This replaces the agency workflow (strategist → SEO analyst → writer → editor) with one chained command. The brief step is the quality gate that makes AI content actually competitive with the SERP rather than generic.

### Ratings

| Dimension | Score |
|---|---|
| User impact | 9/10 |
| Ease of implementation | 8/10 (all pieces exist; only orchestration needed) |
| Revenue potential | 9/10 |

### Additional automation opportunities

- Scheduled weekly run of the Competitor Analyzer that diffs against the last report and auto-queues only *new* gaps into the pipeline.
- Auto-run `/translate-content` on each published article to multiply output across markets.

---

## Combination 2: Audit → Prioritize → Fix → Verify Loop

### Features involved

- **SEO Auditor agent** — autonomous 6-phase audit producing a 0–100 score with Critical/Warning/Opportunity tiers and exact file:line references (`agents/seo-auditor/AGENT.md`)
- **`technical-seo` skill** — Priority Fixes ranked Critical/High/Medium with "How to fix" (`skills/technical-seo/SKILL.md`)
- **`broken-links` skill** — "Quick Fixes" section emits copy-paste redirect configs and exact `href` edits (`skills/broken-links/SKILL.md`)
- **`on-page-seo` skill** — before/after rewrites of titles, metas, headings (`skills/on-page-seo/SKILL.md`)
- **`schema-markup` skill** — framework-specific integration code for Next.js/React/HTML (`skills/schema-markup/SKILL.md`)
- **`/seo-check`** — per-file 0–100 rescore for verification (`commands/seo-check.md`)

### Why they complement each other

The auditor finds and prioritizes; the four specialist skills are each fix-generators for a distinct issue class the auditor surfaces (technical, links, on-page, structured data); `/seo-check` closes the loop by measuring whether the fix worked. The auditor's rule "include file paths and line numbers" is exactly what the fix skills need as input.

### Workflow

1. SEO Auditor agent crawls the codebase/URL → scored report, issues tagged by category and severity.
2. Route each Critical/Warning issue to the matching skill:
   - Crawlability / Core Web Vitals / redirects → `technical-seo`
   - 404s and redirect chains → `broken-links`
   - Weak titles/metas/headings → `on-page-seo`
   - Missing JSON-LD → `schema-markup`
3. Each skill emits the exact code change (since this runs in a coding agent with Read/Edit, fixes can be applied directly to the files).
4. Re-run `/seo-check` on every touched file; compare score before/after; re-run the full auditor monthly.

### Information passed between modules

Issue list (category, severity, file:line, description) → per-issue fix payloads (redirect rules, rewritten meta tags, JSON-LD blocks, config edits) → modified file paths → new per-file scores → delta vs. baseline.

### SEO/business outcome

Site health score climbs measurably; crawl budget, link equity, and rich-result eligibility recovered; technical debt that silently suppresses every page's rankings is cleared in one session.

### Why valuable for users

Audits are commodity; *applied* fixes are not. Most SEO tools stop at the PDF report — this combination is the rare loop where the same system that diagnoses also edits the code and proves the improvement. Biggest manual-work reduction of the three.

### Ratings

| Dimension | Score |
|---|---|
| User impact | 9/10 |
| Ease of implementation | 9/10 (highest — agent already has Bash/Read/Grep; skills already output exact fixes) |
| Revenue potential | 7/10 |

### Additional automation opportunities

- Run `/seo-check` as a CI/pre-commit gate on changed page files (the `broken-links` skill itself suggests "a link checker in your CI/CD pipeline").
- Scheduled monthly auditor run with score-trend reporting.

---

## Combination 3: AI Visibility (GEO) Flywheel

### Features involved

- **`ai-visibility` skill** — prompt audit ("best [category] tool?", "[X] vs [Y]"), 6-dimension visibility score, "Content to Create" action list (`skills/ai-visibility/SKILL.md`)
- **Competitor Analyzer agent** — identifies who AI assistants recommend instead and why (`agents/competitor-analyzer/AGENT.md`)
- **`/create-content`** — produces the comparison and FAQ content the visibility skill prescribes (`commands/create-content.md`)
- **`/generate-schema`** — Organization/FAQ/Product JSON-LD, explicitly listed as a "Technical Signal" for AI visibility (`skills/ai-visibility/SKILL.md` Step 4; `commands/generate-schema.md`)
- **`/seo-check`** — validates the published assets (`commands/seo-check.md`)

### Why they complement each other

The `ai-visibility` skill diagnoses *which prompts you lose* and prescribes content + schema as the remedies — but it can't produce either. `/create-content` and `/generate-schema` are precisely those remedies. The Competitor Analyzer supplies the factual feature comparisons that make "[You] vs [Competitor]" pages credible rather than fluff (the visibility skill notes "structured, factual content is preferred by AI models over marketing fluff").

### Workflow

1. `ai-visibility` audits target prompts → visibility score, competitor comparison, prioritized "Content to Create" checklist.
2. Competitor Analyzer researches the brands currently winning those prompts → factual differentiation data.
3. `/create-content` writes the prescribed assets — comparison pages, "alternatives to [competitor]" pages, FAQ content structured with headers matching the target prompts and comparison tables AI can extract.
4. `/generate-schema` adds Organization, FAQ, and Product JSON-LD to each asset.
5. `/seo-check` verifies; re-run the `ai-visibility` audit quarterly to measure mention/position/sentiment movement.

### Information passed between modules

Losing prompts + competitor names + position/sentiment scores → competitor strengths/weaknesses table → article specs (target prompt as keyword, comparison data as body content) → page content → populated JSON-LD → re-audit deltas.

### SEO/business outcome

Brand gets recommended by ChatGPT/Claude/Gemini/Perplexity for buying-intent prompts — a channel the skill itself calls "a primary way people discover products," with near-zero competition from brands still doing only classic SEO. Comparison/alternative pages also convert at bottom-of-funnel rates in classic search.

### Why valuable for users

GEO is the most differentiated capability in the plugin — almost no competing toolkit closes the loop from AI-mention audit to remediation content to re-measurement. For users, AI recommendations are effectively warm referrals.

### Ratings

| Dimension | Score |
|---|---|
| User impact | 8/10 |
| Ease of implementation | 7/10 (measurement across external AI platforms is the soft spot) |
| Revenue potential | 9/10 (bottom-of-funnel prompts = direct pipeline) |

### Additional automation opportunities

- Scheduled quarterly visibility re-audits with score-trend deltas.
- Auto-trigger the content step whenever a competitor newly appears in a target prompt.
- Feed each comparison page through `/translate-content` to win the same prompts in non-English markets.

---

## Cross-Cutting Recommendation

The highest-leverage build is a single orchestrator command (e.g., `/seo-pipeline`) that runs Combination 1 end-to-end, since every interface contract already exists in the components' defined output formats — the topic table, cluster report, brief template, and link-marker syntax are designed as if they were meant to be piped together.

**Combination 4 worth noting for later:** `content-strategy` → `/translate-content` → `technical-seo` (hreflang validation) as an international expansion pipeline.

---

*Sources: all citations refer to files inside the installed `searchfit-seo` plugin — `README.md`, `agents/*/AGENT.md`, `commands/*.md`, `skills/*/SKILL.md`.*
