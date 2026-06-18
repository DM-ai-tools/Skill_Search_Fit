# UI/UX Brief

## SkillSearchFit SEO AI Platform — MVP 4.0

| Field | Value |
|-------|-------|
| **Version** | MVP 5.0 |
| **Last Updated** | June 17, 2026 |
| **Design Status** | Ink & Signal palette + bento grid fully implemented |
| **Supersedes** | UI/UX Brief v4.0 (fire/ember — deprecated) |

---

## 1. Design Mission

Build a **modern, professional, enterprise-grade SEO AI workspace** that feels purpose-built for search professionals — precise, structured, and credible. Not a generic chatbot wrapper, and not a visual copy of the sister product ClickTrends.

The interface should communicate three things at a glance: this tool understands SEO workflows, the data here is trustworthy, and the AI is an assistant inside a structured process — not the whole product.

---

## 2. Brand Positioning

| Attribute | Direction |
|-----------|-----------|
| **Tone** | Confident, precise, quietly expert — never gimmicky |
| **Industry** | SEO / digital marketing / search intelligence |
| **Relationship to ClickTrends** | Sister product; cross-link only; fully distinct visual identity |
| **Anti-patterns** | Playful consumer apps, cluttered dashboards, chat-only UIs, gradient overload, rainbow status coloring |

### Working Name

**SkillSearchFit** — "skill" (expertise) + "search" (SEO domain) + "fit" (right tool for the job).

### Brand Personality

| Trait | What it looks like in UI |
|-------|---------------------------|
| Precise | Tight grids, consistent number formatting, aligned data |
| Calm | Generous whitespace, restrained color use, no flashing/pulsing UI |
| Expert | Dense information rendered with clear hierarchy, not dumbed down |
| Trustworthy | Predictable patterns, visible system state, no dark patterns |

### Visual Identity (v5 — Ink & Signal)

v5 introduces the **Ink & Signal** palette — a dark, calm instrument-panel feel. Deep ink-navy canvas (`#0B0E14`), graphite surfaces, warm copper primary (`#E08A3C`) used like a calibration needle, and cool slate-teal secondary (`#4FA89F`) as the quiet structural counterpart. A signature **spotlight inversion** (`--spotlight-bg: #F2EAE0`, `--spotlight-text: #0B0E14`) marks the single most important item per view (at most once). Bento grid layouts encode importance via tile size on: dashboard, plugin library, report view executive summary, and plan page sidebar stats.

---

## 3. Design Principles

1. **Workflow over chat** — conversation supports the workflow; the workspace structure leads.
2. **Clarity first** — dense information presented with strong hierarchy and whitespace.
3. **Progressive disclosure** — show essentials; advanced options on demand.
4. **Non-blocking intelligence** — website analysis and field prefills run in the background; the user keeps working.
5. **Structured outputs** — plugin results and audit reports render as designed documents, not raw markdown dumps.
6. **Consistent shells, distinct contexts** — marketing, app, and admin share a token system but read as visually distinct zones.
7. **Desktop-first** — optimized for 1280px+; responsive degradation for tablet.
8. **Accessible by default** — keyboard nav, visible focus states, WCAG 2.1 AA contrast minimums.
9. **Quiet motion** — animation communicates state change (loading, success, transition); it never decorates for its own sake.
10. **One accent, used deliberately** — copper primary marks the most important action or status on a screen; teal secondary supports without competing.

---

## 4. Visual Language

### 4.1 Color Palette — Ink & Signal (v5)

| Token | Hex / value | Usage |
|-------|-------------|-------|
| `--background` | `#0B0E14` | App canvas |
| `--surface` | `#141A24` | Cards, panels |
| `--surface-elevated` | `#1B2230` | Hover/active surface, raised elements |
| `--foreground` | `#F4F1EC` | Primary text |
| `--muted` | `#8B93A3` | Secondary text, metadata |
| `--muted-foreground` | `#56606F` | Placeholder, disabled |
| `--border` | `rgba(244,241,236,0.08)` | Default dividers/card borders |
| `--border-strong` | `rgba(244,241,236,0.16)` | Input borders, table borders |
| `--primary` | `#E08A3C` | Primary actions, key numbers, active nav |
| `--primary-hover` | `#C9772E` | Hover/pressed primary |
| `--primary-soft` | `rgba(224,138,60,0.14)` | Badge fills, soft highlights |
| `--primary-foreground` | `#0B0E14` | Text on primary button surfaces |
| `--secondary` | `#4FA89F` | Secondary accent — links, secondary data series |
| `--secondary-soft` | `rgba(79,168,159,0.14)` | Soft fills for secondary accent |
| `--success` | `#7CB88A` | Completed, approved |
| `--success-soft` | `rgba(124,184,138,0.14)` | Success banners |
| `--warning` | `#C9982E` | Caution, dry-run mode (gold, not copper) |
| `--warning-soft` | `rgba(201,152,46,0.14)` | Warning banners |
| `--destructive` | `#C2533F` | Delete, errors, live publish |
| `--destructive-soft` | `rgba(194,83,63,0.14)` | Error banners |
| `--spotlight-bg` | `#F2EAE0` | Signature inversion surface (max 1 tile/view) |
| `--spotlight-text` | `#0B0E14` | Text on spotlight surface |

**Glass tokens:**

| Token | Value |
|-------|-------|
| `--glass-bg` | `rgba(20,26,36,0.72)` |
| `--glass-bg-strong` | `rgba(20,26,36,0.88)` |
| `--glass-border` | `rgba(244,241,236,0.06)` |

**Canvas gradient:** subtle teal glow top-left, copper glow top-right over `#0B0E14`.

**Accessibility:** Copper (`#E08A3C`) and teal (`#4FA89F`) both exceed WCAG AA against `#0B0E14` for large text/icons (7.2:1 and 6.8:1). Use copper for headings, KPIs, and accents — not small body text. Spotlight inversion passes at 16.2:1.

### 4.2 Typography

| Role | Font | Weight | Size | Line Height |
|------|------|--------|------|-------------|
| Display (marketing hero) | Geist Sans | 700 | 40–56px | 1.1 |
| H1 | Geist Sans | 600 | 28–32px | 1.2 |
| H2 | Geist Sans | 600 | 22–24px | 1.3 |
| H3 | Geist Sans | 600 | 18–20px | 1.4 |
| Body | Geist Sans | 400 | 14–16px | 1.5 |
| Body emphasis | Geist Sans | 500 | 14–16px | 1.5 |
| Small / Meta | Geist Sans | 400 | 12–13px | 1.4 |
| Labels / KPIs / Audit metadata | Geist Mono | 600 | 10–11px | 1.4 |
| Code / Data / IDs | Geist Mono | 400–500 | 13–14px | 1.4 |

**Numeric tabular figures:** metrics, stats, and table numbers use `font-variant-numeric: tabular-nums`.

**Audit/report labels:** uppercase monospace micro-labels (`font-mono text-[10px] uppercase tracking-wider`) for section headers, table columns, and status chips in Report Review / Plan flows.

### 4.3 Spacing & Layout

- Base grid: **4px**
- Content max-width (marketing): **1200px**
- App content area: fluid, **12px** outer margin (`m-3` on shell panels)
- Card padding: **16–20px** standard, **12–16px** for dense cards
- Section gaps: **32–48px** (marketing), **20–24px** (app)
- Component gap (buttons, form rows): **8–12px**
- Shell corner radius: **16px** (`rounded-2xl`) on sidebar, header, and major report panels

### 4.4 Elevation & Surfaces

| Surface type | Treatment |
|--------------|-----------|
| App shell (sidebar, header) | `.glass-panel-strong` + `rounded-2xl` + neutral slate shadow |
| Content cards | `border border-border bg-surface/60–80` or `.glass-panel` for report flows |
| Interactive cards | Subtle hover lift (`-translate-y-0.5`) + shadow deepen — report view only |
| Modals | `glass-panel-strong` + `backdrop-blur-sm` on overlay |
| Sticky chrome | `sticky top-0 z-20` on Plan page header |

**Avoid:** neumorphism, orange-tinted shadows, emoji in UI chrome, rainbow severity coloring.

### 4.5 Iconography

- Library: **Lucide**, stroke width 1.5–2px
- Plugin icons: colored icon in a rounded square (40×40, `rounded-lg`), category soft tint background
- Status icons: always paired with text label

**Category color coding (v5 — distinct from semantic status tokens):**

| Category | Hex |
|----------|-----|
| Research | `#4FA89F` |
| Content | `#B6705A` |
| Technical | `#E08A3C` |
| Local SEO | `#8C6E96` |
| Reporting | `#8B93A3` |

---

## 5. Component System

Built on **ShadCN-style primitives** + Tailwind CSS 4.

| Component | Usage | v3 Note |
|-----------|-------|---------|
| Button | Primary, secondary, ghost, destructive, outline | Primary once per view max |
| Card | Dashboard widgets, report sections | Often combined with glass utilities |
| Input / Textarea | Forms, workspace inputs, header URL field | Focus ring `ring-primary/40` |
| Select / Checkbox | Dynamic plugin fields | Select values normalized client-side |
| Dialog | Confirm delete, publish confirm | Publish modal uses glass + destructive CTA |
| Badge | Category, status, dry-run | Soft background variants |
| Progress | Execution stepper, plan approval bar | Animated width on approval % |
| Skeleton | Report view loading | Pulse placeholders |
| **ChangeCard** | Report Review plan items | Priority rail + diff panels |
| **FilterBar** | Plan sidebar + mobile strip | `horizontal` \| `vertical` layout |
| **ResultsTable** | Publish results | Monospace headers, success/destructive rows |
| **FieldWithSuggestions** | Workspace plugin inputs | Chips + confidence badge + cached suggestions |
| **ExecutionProgress** | Workspace run state | 4-step horizontal stepper |
| **AnalysisStatusBanner** | Background scan status | Non-blocking scan feedback |

### Glass utility classes

```css
.glass-panel        /* ink-navy glass bg, subtle border, blur(16px) */
.glass-panel-strong /* stronger version (0.88 opacity), blur(20px) */
.bento-grid         /* base grid with 0.875rem gap */
.bento-grid-4       /* 4-column bento */
.bento-hero         /* 2×2 span — largest metric */
.bento-wide         /* full-width or 4-col span — trends/time-series */
.bento-strip        /* full-width category/navigation chips row */
.bento-tile         /* standard dark surface tile */
.bento-spotlight    /* signature light inversion (max 1 per view) */
```

**Bento grammar:** Hero (largest) · Spotlight (inversion, max 1) · Standard · Wide · Strip. Applied to dashboard, plugin library, `/reports/view` executive summary, and `/reports/plan` sidebar stats. **Not** applied to ChangeCard list, ResultsTable, forms, or workspace stepper.

**Hover rule:** copper glow (`rgba(224,138,60,0.12–0.18)`) on hover-lift only. Static shadows use near-black.

Used on: all shell panels, every surface card, bento tiles across marketing/app/admin.

---

## 6. Layout Specifications

### 6.1 Marketing Site

```
┌────────────────────────────────────────────────────────┐
│  Logo          Features  About  Contact    Login  CTA  │
├────────────────────────────────────────────────────────┤
│           Hero: Headline + Subhead + Dual CTA           │
│              (left-aligned, max-width 640px)            │
├────────────────────────────────────────────────────────┤
│         Feature grid (3-col) — icon, title, copy        │
├────────────────────────────────────────────────────────┤
│         Workflow strip — "How it works" (3–4 steps)     │
├────────────────────────────────────────────────────────┤
│                       Footer                            │
└────────────────────────────────────────────────────────┘
```

Sticky nav: `glass-panel-strong` on scroll.

### 6.2 Application Shell (Implemented)

```
┌──────────┬─────────────────────────────────────────────┐
│          │  glass-panel-strong header (sticky feel)      │
│  Sidebar │  Title · Site URL input · Scan status · User  │
│  240px   ├─────────────────────────────────────────────┤
│  glass   │                                             │
│  panel   │              Main Content                   │
│          │                                             │
│  Nav:    │                                             │
│  Dash    │                                             │
│  Plugins │                                             │
│  Projects│                                             │
│  Reports │                                             │
│  Profile │                                             │
└──────────┴─────────────────────────────────────────────┘
```

**Sidebar nav:**
- Dashboard, Plugin Library, Projects, **Report Review**, Profile
- Active state: `bg-accent-soft/80 text-primary shadow-sm rounded-xl`
- Logo: `SkillSearchFit` in primary

**App header (global):**
- Page title (contextual)
- **Site URL input** — triggers background website analysis (non-blocking)
- Scan status label (pending / scanning / analyzing / generating / completed)
- Project selector
- User menu + logout

**Key UX rule:** entering a URL never blocks the app. Users land on the plugin library immediately and continue working while scan + prefill run.

### 6.3 Workspace (Three-Panel)

```
┌────────────┬──────────────────────────────┬──────────────┐
│ LEFT 280px │      CENTER (flex)            │ RIGHT 300px  │
├────────────┼──────────────────────────────┼──────────────┤
│ Plugin name│  Execution stepper            │ Notes        │
│ + icon     │  (Validate → Load → Execute)  │ Export       │
│            │                                │ Saved        │
│ Dynamic    │  Form + Generate by AI         │              │
│ input form │  Field suggestion chips      │              │
│            │  Confidence badges           │              │
│ [Run] btn  │                                │              │
│ (sticky)   │  → redirects to /reports/view │              │
└────────────┴──────────────────────────────┴──────────────┘
```

| Panel | Width | Notes |
|-------|-------|-------|
| Left | 280px | Sticky Run button; Generate by AI uses cached prefill |
| Center | flex-1 | Stepper during execution; no inline markdown after run |
| Right | 300px | Notes (auto-save), Export, Saved outputs |

**Post-run flow:** successful execution redirects to `/reports/view?executionId=…&pluginId=…` — structured report page, not raw markdown in workspace.

**AI autofill UX:**
- Background scan pre-generates up to **3 suggestions per field**
- "Generate by AI" fills form in ~1s from cache when prefill is ready
- Select fields show label chips; values normalized to schema `value` keys
- Confidence badge shown when ≥ 70%

### 6.4 Plugin Library (Implemented)

- No blocking "analyze your website" gate page
- Target site banner when URL is set (primary icon tile + URL)
- Dashed empty state when no URL — prompts user to enter URL in header
- Responsive plugin card grid (canonical plugin catalog)
- Launch opens workspace

### 6.5 Reporting Flow (New — Implemented)

Three-route reporting architecture:

```
Plugin Run → /reports/view          (read structured report)
Audit Upload → /reports/review      (upload + extract)
             → /reports/plan        (review changes + publish)
```

#### 6.5.1 Plugin Report View (`/reports/view`)

Converts markdown output to JSON, then renders styled UI.

```
┌─────────────────────────────────────────────────────────────┐
│  Glass header: Plugin name · Execution · Status · JSON toggle│
├──────────────────────────────────────┬──────────────────────┤
│  Executive Summary                   │  Document Metadata   │
│  KPI strip (sections/highlights/     │  Plugin Suggestions  │
│   actions/narrative)                 │  Next Actions        │
│  Table of Contents (anchor links)    │  → Report Review     │
│  Numbered section cards              │                      │
│  (paragraph / bullet / numbered)     │                      │
└──────────────────────────────────────┴──────────────────────┘
```

**JSON model (frontend):**

```json
{
  "plugin_name": "…",
  "execution_id": "…",
  "status": "completed",
  "generated_at": "…",
  "sections": [
    {
      "title": "…",
      "level": 2,
      "blocks": [
        { "type": "paragraph|bullet|numbered", "text": "…", "index": 1 }
      ]
    }
  ]
}
```

**Styling rules:**
- Section cards: glass panel, accent rail, hover lift
- Bullets: dot marker rows on `accent-soft` background
- Numbered items: circular index badges
- Sidebar sticky on xl; stacks first on mobile
- Skeleton loading state while fetching execution

#### 6.5.2 Report Upload (`/reports/review`)

Upload-only page ("New Report").

- Drag-drop zone: `glass-panel rounded-2xl`, keyboard accessible
- Paste area: glass panel with monospace label
- Submit: Sparkles icon → Loader2 with contextual label
- On extract success: redirect to `/reports/plan?reportId=…`
- Error: `border-destructive/20 bg-destructive-soft` banner

#### 6.5.3 Implementation Plan (`/reports/plan`)

Full review + publish workflow.

```
┌─ Sticky glass header ─────────────────────────────────────┐
│ ← Back · Filename · Review|Publish tabs · Stats · CTA     │
├────────────┬──────────────────────────────────────────────┤
│  Sidebar   │  Main content                                │
│  (lg+)     │                                              │
│  Progress  │  Review: grouped by destination → page_url   │
│  Done/Skip │          ChangeCard per item                 │
│  /Open     │                                              │
│  Bulk      │  Publish: dry-run toggle (warning bar)       │
│  actions   │          per-destination payload panels      │
│  Vertical  │          ResultsTable + confirm modal        │
│  FilterBar │                                              │
└────────────┴──────────────────────────────────────────────┘
```

**ChangeCard anatomy:**
- 3px left **priority rail** (green=approved, slate=rejected, red/amber/blue by priority)
- Monospace label badges (priority, type, destination, impact)
- **DiffView:** current `bg-slate-50/80` | proposed `bg-blue-50/60 border-primary/15`
- Approve / Reject / Edit actions
- Collapsible source excerpt

**Publish flow:**
- Dry-run default (amber warning bar)
- Live toggle requires `PublishConfirmModal` (`bg-foreground/30 backdrop-blur-sm`)
- Per-destination: preview payload, download, copy, publish
- Results table with success/destructive tokens + dry-run badge

### 6.6 Admin Shell

- Same structural pattern as app shell
- Nav: Dashboard, Users, Plugins, Prompts, Logs
- Denser tables, filter bars above data

### 6.7 Pipelines

- `/pipeline/[id]` — multi-step plugin execution view
- Pipeline cards on plugins/dashboard surfaces
- Combined markdown output for pipeline runs

---

## 7. Key Screen Specifications

### 7.1 Login / Signup

- Centered card, max-width 400px, surface + border
- Password strength indicator (3-segment bar)
- Admin login at `/admin/login` — no signup link

### 7.2 Dashboard

- Welcome header + quick stats
- Recent project/plugin resume cards
- Background analysis re-run via header URL
- Plugin highlights grid

### 7.3 Projects

- Card grid default; table toggle optional
- New Project CTA top-right
- Project detail shows saved outputs

### 7.4 Profile

- Account settings, session info

---

## 8. Interaction Patterns

### 8.1 Loading

- Skeleton loaders match loaded content dimensions
- Workspace execute: 4-step stepper with progress animation
- Report view: 3-block skeleton (header, meta, body)
- Plan page: centered Loader2 when fetching report by URL

### 8.2 Feedback

- Toast on save success (where implemented)
- Inline validation on blur/submit — `text-destructive`, destructive border
- Destructive actions require confirmation dialog
- API errors: formatted via `formatApiError`, shown in styled banners

### 8.3 Empty States

Every list/table/panel has an empty state: relevant Lucide icon, one-line explanation, primary CTA where applicable. Use `--muted` text, never `--destructive` for empty states.

### 8.4 Keyboard

- `Esc` closes modals
- Drag-drop zone: `role="button"` + `tabIndex={0}` + Enter to open file picker
- Tab order follows visual layout

### 8.5 Motion

| Context | Timing |
|---------|--------|
| Hover/focus | `150–200ms ease-out` |
| Card hover lift | `duration-300` |
| Progress bar width | `duration-500` |
| Toast enter/exit | `200ms` slide + fade |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses all transitions/animations to `0.01ms`.

**No** auto-playing decorative animation, parallax, or looping motion in app shell.

---

## 9. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥1280px | Full three-panel workspace; plan sidebar visible |
| 1024–1279px | Right panel collapses; sidebar remains |
| 768–1023px | Plan: horizontal FilterBar; report sidebar stacks above content |
| <768px | Single column; header URL wraps; plugin grid 1-col |

MVP priority: **1280px desktop**. Mobile is usable but not primary optimization target.

---

## 10. Accessibility Checklist

- [ ] Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text/icons
- [ ] Focus rings visible on all interactive elements (`ring-primary/40`, 2px)
- [ ] Form labels associated with inputs via `htmlFor`/`id`
- [ ] Error messages linked via `aria-describedby`
- [ ] Loading/status changes announced via `aria-live` where critical
- [ ] Skip-to-main-content link on app shell
- [ ] Status communicated via icon **and** text/color
- [ ] Dry-run toggle uses `role="switch"` + `aria-checked`
- [ ] Drag-drop zone keyboard accessible

---

## 11. Content & Microcopy

| Context | Copy Direction |
|---------|----------------|
| Product tagline | "AI-powered SEO workflows, built for professionals" |
| CTA primary | "Get Started Free" |
| Run button | "Run Analysis" or plugin-specific verb |
| Generate by AI | "Generate by AI" with Sparkles icon |
| Scan status | "Scanning…" / "Analyzing…" / "Generating suggestions…" |
| Report upload | "Upload & extract changes" |
| Plan proceed | "Proceed to publish →" |
| Dry-run | "Dry-run mode. Simulating publish — nothing will change." |
| Live publish confirm | "Publish to live site?" |
| Empty workspace | "Fill in the inputs on the left to get started" |
| Error generic | "Something went wrong. Please try again." |

---

## 12. Reference Report Documents

Design reference files in `/reports/` (Click Trends audit docx set) inform plugin report structure:

- Cover block with overall score (e.g. `12 / 100`)
- Numbered sections (1. Brand Overview, 2. Methodology, …)
- Key Takeaways callout
- Comparison tables (competitors, prompt analysis)
- Professional audit tone — dense, evidence-based, action-oriented

Plugin report view (`/reports/view`) maps markdown into this structure on the frontend without backend schema changes.

---

## 13. globals.css Theme (v5 — Ink & Signal)

```css
:root {
  --background: #0B0E14;
  --surface: #141A24;
  --surface-elevated: #1B2230;
  --foreground: #F4F1EC;
  --muted: #8B93A3;
  --muted-foreground: #56606F;
  --border: rgba(244, 241, 236, 0.08);
  --border-strong: rgba(244, 241, 236, 0.16);
  --primary: #E08A3C;
  --primary-hover: #C9772E;
  --primary-soft: rgba(224, 138, 60, 0.14);
  --primary-foreground: #0B0E14;
  --secondary: #4FA89F;
  --secondary-soft: rgba(79, 168, 159, 0.14);
  --success: #7CB88A;
  --success-soft: rgba(124, 184, 138, 0.14);
  --warning: #C9982E;
  --warning-soft: rgba(201, 152, 46, 0.14);
  --destructive: #C2533F;
  --destructive-soft: rgba(194, 83, 63, 0.14);
  --glass-bg: rgba(20, 26, 36, 0.72);
  --glass-bg-strong: rgba(20, 26, 36, 0.88);
  --glass-border: rgba(244, 241, 236, 0.06);
  --spotlight-bg: #F2EAE0;
  --spotlight-text: #0B0E14;
  --radius: 0.625rem;
}
```

MVP ships **dark mode only** (Ink & Signal palette).

---

## 14. Route Map (Implemented)

| Area | Routes |
|------|--------|
| Marketing | `/`, `/features`, `/about`, `/contact`, `/login`, `/signup` |
| App | `/dashboard`, `/plugins`, `/workspace/[id]`, `/pipeline/[id]`, `/projects`, `/projects/[id]`, `/profile` |
| Reports | `/reports/view`, `/reports/review`, `/reports/plan` |
| Admin | `/admin/login`, `/admin/dashboard`, `/admin/users`, `/admin/plugins`, `/admin/plugins/[id]`, `/admin/prompts`, `/admin/logs` |

---

## 15. What We Are Not Designing (Yet)

- Payment/checkout flows
- OAuth provider buttons
- Usage meters or billing dashboards
- Multi-organization tenant switchers
- Unified cross-plugin executive dashboard (designed in canvas; not shipped)
- Backend standardized JSON report schema (frontend markdown→JSON adapter only)
- Native mobile patterns as primary nav

---

## 16. Summary of Changes from v4.0 → v5.0

| Area | Change | Why |
|------|--------|-----|
| Color palette | Fire/ember orange → Ink & Signal (ink-navy canvas, copper primary, teal secondary) | Calm instrument-panel feel; two related accents instead of single neon hot color |
| Spotlight inversion | New `--spotlight-bg` / `--spotlight-text` tokens | Marks the single most important item per view |
| Semantic colors | Success/warning/destructive desaturated to match palette | Distinct from copper; warning is gold, destructive is red |
| Bento grammar | Formalized hero/spotlight/standard/wide/strip tile types | Tile size encodes importance |
| Category colors | Remapped to v5 categorical hues | Research teal, content clay, technical copper, local SEO purple, reporting gray |
| Glass surfaces | Ink-navy glass (`rgba(20,26,36,…)`) with neutral borders | Replaces warm chocolate/amber glass |
| Marketing pages | Accent chips updated to v5 categorical palette | Consistency with plugin library |

---

## 17. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-11 | Initial UI/UX brief |
| 2.0 | 2026-06-11 | Modernized visual language, refined layouts, motion/accessibility |
| 3.0 | 2026-06-17 | Indigo palette, glass shell, background analysis, reporting architecture, plan/review flows |
| 4.0 | 2026-06-17 | Fire/ember dark palette, bento grid pattern (deprecated by v5) |
| 5.0 | 2026-06-17 | Ink & Signal palette, spotlight inversion, bento grammar, category remap |
