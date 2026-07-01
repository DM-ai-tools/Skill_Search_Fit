# SearchFit SEO — Full Content Page Pipeline
## Complete Workflow for Claude Code

This file defines a **7-step chained pipeline** using SearchFit SEO skills where the output of each skill is the exact input for the next. Run steps in strict order. Do not skip steps — each one refines the data the next depends on.

---

## Pipeline Overview

```
## Comp Analysis
[Seed Idea / Niche]
        ↓
  1. create-topic          → topic angle, audience, seed keywords
        ↓
  2. keyword-clustering    → keyword groups, primary/secondary/LSI per page
        ↓
  3. content-strategy      → content pillars, priority page, editorial plan
        ↓
  4. content-brief         → H1/H2 outline, word count, intent, CTAs, sources
        ↓
  5. content-creation      → full draft article (title, meta, headings, body, schema)
        ↓
  6. on-page-seo           → optimized title tag, meta description, keyword fixes
        ↓
  7. internal-linking      → anchor text, link placements, authority flow map
        ↓
[Publish-Ready Optimized Content Page]
```

---

## Global Inputs (Collected Once, Used Throughout)

Before running Step 1, collect and store these variables. Pass them to every skill that references them.

| Variable | Description | Example |
|---|---|---|
| `TOPIC_SEED` | The user's niche or topic idea | "AI tools for small business" |
| `SITE_URL` | The target website URL | "https://example.com" |
| `TARGET_AUDIENCE` | Who the content is for (optional, refined in Step 1) | "small business owners" |
| `CONTENT_GOAL` | What the page should achieve | "rank on page 1, drive signups" |

---

## Step 1 — `create-topic`

**Skill:** `searchfit-seo:create-topic`

### What it does
Researches the seed idea and produces a fully defined topic: the best angle to take, who the audience is, what competitors are doing, and an initial set of seed keywords.

### Input
```
- TOPIC_SEED         → pass directly as the topic/keyword to research
- SITE_URL           → for competitive context (what angle is unoccupied)
- TARGET_AUDIENCE    → optional, helps refine angle
```

### Prompt to send the skill
```
Topic seed: {TOPIC_SEED}
Website: {SITE_URL}
Research this topic and produce:
1. The best content angle (what unique positioning is available)
2. Primary audience definition
3. 10–20 seed keywords
4. Top 3 competitor pages and their positioning gaps
5. Recommended content type (pillar, cluster, landing page, etc.)
```

### Output — Extract and store these fields
```yaml
TOPIC_ANGLE:         # e.g. "Best AI tools for small businesses in 2026"
AUDIENCE_DEFINED:    # e.g. "Small business owners with no tech background"
SEED_KEYWORDS:       # list of 10–20 keywords
COMPETITOR_PAGES:    # list of URLs + their weak spots
CONTENT_TYPE:        # e.g. "pillar page" / "listicle" / "comparison"
POSITIONING_GAP:     # what competitors miss that we can own
```

### Passes to Step 2
`SEED_KEYWORDS` → full list fed into keyword-clustering

---

## Step 2 — `keyword-clustering`

**Skill:** `searchfit-seo:keyword-clustering`

### What it does
Takes the seed keywords from Step 1, expands them, and groups them into logical clusters — each cluster maps to one content page. Identifies primary keyword, secondary keywords, and LSI (latent semantic indexing) terms per cluster.

### Input
```
- SEED_KEYWORDS      → from Step 1 output
- TOPIC_ANGLE        → from Step 1, to keep clusters on-theme
- SITE_URL           → to understand what pages already exist
```

### Prompt to send the skill
```
Seed keywords: {SEED_KEYWORDS}
Topic angle: {TOPIC_ANGLE}
Website: {SITE_URL}

Expand these keywords and cluster them into topical groups.
For each cluster provide:
1. Cluster name / theme
2. Primary keyword (highest volume, clearest intent)
3. Secondary keywords (3–5 supporting terms)
4. LSI / semantic terms (5–8 related phrases)
5. Search intent (informational / commercial / transactional)
6. Suggested page type for the cluster
```

### Output — Extract and store these fields
```yaml
KEYWORD_CLUSTERS:
  - cluster_name:     # e.g. "AI tools comparison"
    primary_kw:       # e.g. "best AI tools for small business"
    secondary_kws:    # list
    lsi_terms:        # list
    intent:           # informational | commercial | transactional
    page_type:        # pillar | blog | landing

PRIMARY_CLUSTER:      # the single highest-priority cluster (used in Steps 4–6)
ALL_CLUSTERS:         # full list (used in Step 3 and Step 7)
```

### Passes to Step 3
`ALL_CLUSTERS` + `PRIMARY_CLUSTER` → content strategy uses these to build the editorial plan

---

## Step 3 — `content-strategy`

**Skill:** `searchfit-seo:content-strategy`

### What it does
Takes all keyword clusters and the topic research to produce a full content strategy: which pages to build, in what order, what the pillar/cluster site architecture looks like, and which page to prioritize first.

### Input
```
- ALL_CLUSTERS       → from Step 2
- TOPIC_ANGLE        → from Step 1
- AUDIENCE_DEFINED   → from Step 1
- POSITIONING_GAP    → from Step 1
- COMPETITOR_PAGES   → from Step 1
- SITE_URL           → for existing content audit
```

### Prompt to send the skill
```
Topic angle: {TOPIC_ANGLE}
Audience: {AUDIENCE_DEFINED}
Keyword clusters: {ALL_CLUSTERS}
Competitor gaps: {POSITIONING_GAP}
Competitor pages: {COMPETITOR_PAGES}
Website: {SITE_URL}

Build a content strategy that includes:
1. Content pillars (2–3 main themes)
2. Page map — which pages to create, linked to which clusters
3. Priority order — which page to publish first and why
4. Editorial calendar (suggested cadence)
5. Content goals per page (rank, convert, inform)
```

### Output — Extract and store these fields
```yaml
CONTENT_PILLARS:     # list of 2–3 themes
PAGE_MAP:            # list of pages with their cluster, intent, and priority rank
PRIORITY_PAGE:       # the single page to build right now
  title:             # working title
  cluster:           # which keyword cluster it targets
  goal:              # what it should achieve
EDITORIAL_CALENDAR:  # suggested publish schedule
SITE_ARCHITECTURE:   # how pages link to each other (pillar ↔ cluster map)
```

### Passes to Step 4
`PRIORITY_PAGE` + its associated `keyword cluster` from Step 2 → content brief uses these as the brief target

---

## Step 4 — `content-brief`

**Skill:** `searchfit-seo:content-brief`

### What it does
Produces a detailed writing brief for the priority page identified in Step 3. The brief covers structure (H1, H2s, H3s), word count, search intent, CTAs, sources to cite, and content depth requirements.

### Input
```
- PRIORITY_PAGE      → from Step 3 (title + goal)
- PRIMARY_CLUSTER    → from Step 2 (primary_kw, secondary_kws, lsi_terms, intent)
- AUDIENCE_DEFINED   → from Step 1
- COMPETITOR_PAGES   → from Step 1 (to beat their structure)
- CONTENT_TYPE       → from Step 1
```

### Prompt to send the skill
```
Page to brief: {PRIORITY_PAGE.title}
Primary keyword: {PRIMARY_CLUSTER.primary_kw}
Secondary keywords: {PRIMARY_CLUSTER.secondary_kws}
LSI terms: {PRIMARY_CLUSTER.lsi_terms}
Search intent: {PRIMARY_CLUSTER.intent}
Audience: {AUDIENCE_DEFINED}
Content type: {CONTENT_TYPE}
Competitor pages to outperform: {COMPETITOR_PAGES}

Produce a detailed content brief including:
1. Recommended H1 (exact)
2. H2 sections with H3 sub-points under each
3. Target word count
4. Primary CTA
5. Key points each section must cover
6. 3–5 authoritative sources to cite
7. Content differentiation note (what makes this better than competitors)
8. Keyword placement guide (where each keyword should appear)
```

### Output — Extract and store these fields
```yaml
BRIEF:
  h1:                # exact recommended H1
  word_count:        # e.g. 2400
  sections:
    - h2:            # section heading
      h3s:           # list of sub-points
      must_cover:    # key points for this section
  primary_cta:       # e.g. "Start free trial"
  keyword_placement: # title, intro, H2s, conclusion, alt text, etc.
  sources:           # list of URLs / citations
  differentiation:   # what this piece does better
```

### Passes to Step 5
Full `BRIEF` object → content-creation uses this as its writing blueprint

---

## Step 5 — `content-creation`

**Skill:** `searchfit-seo:content-creation`

### What it does
Writes the full article using the brief as the exact blueprint. Produces a complete draft: title tag, meta description, intro, all body sections with H2/H3 structure, conclusion, CTA, and JSON-LD schema markup.

### Input
```
- BRIEF              → full object from Step 4
- PRIMARY_CLUSTER    → from Step 2 (keyword data for natural placement)
- AUDIENCE_DEFINED   → from Step 1
- TOPIC_ANGLE        → from Step 1
- SITE_URL           → for any self-referential links in content
```

### Prompt to send the skill
```
Write a complete, publish-ready article using the following brief:

H1: {BRIEF.h1}
Target word count: {BRIEF.word_count}
Primary keyword: {PRIMARY_CLUSTER.primary_kw}
Secondary keywords: {PRIMARY_CLUSTER.secondary_kws}
LSI terms: {PRIMARY_CLUSTER.lsi_terms}
Audience: {AUDIENCE_DEFINED}
Primary CTA: {BRIEF.primary_cta}
Keyword placement guide: {BRIEF.keyword_placement}
Sources to cite: {BRIEF.sources}
Differentiation note: {BRIEF.differentiation}

Sections to write:
{BRIEF.sections}  ← expand each H2 and its H3s into full paragraphs

Also produce:
- SEO title tag (≤60 chars, includes primary keyword)
- Meta description (≤155 chars, includes primary keyword + CTA hook)
- JSON-LD Article schema markup
- Image alt text suggestions for 3–5 images
```

### Output — Extract and store these fields
```yaml
ARTICLE:
  title_tag:         # ≤60 chars
  meta_description:  # ≤155 chars
  h1:                # matches brief
  body:              # full HTML or markdown article body
  schema_jsonld:     # JSON-LD block
  image_alts:        # list of suggested alt texts
  word_count:        # actual count
  cta_placement:     # where CTA appears in the article
```

### Passes to Step 6
`ARTICLE` (full draft) + `PRIMARY_CLUSTER.primary_kw` → on-page-seo audits and optimizes it

---

## Step 6 — `on-page-seo`

**Skill:** `searchfit-seo:on-page-seo`

### What it does
Audits the draft article against on-page SEO best practices and returns an optimized version plus a list of changes made. Checks title tag length, meta description, keyword density, heading hierarchy, image alt text, internal/external link balance, readability, and schema validity.

### Input
```
- ARTICLE            → full object from Step 5
- PRIMARY_CLUSTER    → from Step 2 (primary_kw, secondary_kws, lsi_terms)
- SITE_URL           → for canonical URL and link audit
```

### Prompt to send the skill
```
Optimize the following article for on-page SEO:

Title tag: {ARTICLE.title_tag}
Meta description: {ARTICLE.meta_description}
H1: {ARTICLE.h1}
Article body: {ARTICLE.body}
Schema: {ARTICLE.schema_jsonld}
Image alts: {ARTICLE.image_alts}

Primary keyword: {PRIMARY_CLUSTER.primary_kw}
Secondary keywords: {PRIMARY_CLUSTER.secondary_kws}
LSI terms: {PRIMARY_CLUSTER.lsi_terms}
Site URL: {SITE_URL}

Audit and fix:
1. Title tag — keyword position, length, click appeal
2. Meta description — keyword inclusion, length, CTA
3. H1/H2/H3 hierarchy — correct nesting, keyword in H1
4. Keyword density — primary kw 1–2%, no stuffing
5. LSI terms — naturally distributed throughout
6. Image alt text — descriptive, keyword where natural
7. Schema markup — validate and fix errors
8. Readability — sentence length, paragraph breaks, scanability
9. External links — 2–3 authoritative sources linked
Return: optimized full article + change log
```

### Output — Extract and store these fields
```yaml
OPTIMIZED_ARTICLE:
  title_tag:         # final optimized version
  meta_description:  # final optimized version
  h1:                # confirmed / updated
  body:              # optimized article body
  schema_jsonld:     # validated schema
  image_alts:        # finalized alt texts
  change_log:        # list of what was changed and why
  seo_score:         # optional score if skill provides one
```

### Passes to Step 7
`OPTIMIZED_ARTICLE` + `SITE_ARCHITECTURE` from Step 3 → internal-linking maps this page into the site

---

## Step 7 — `internal-linking`

**Skill:** `searchfit-seo:internal-linking`

### What it does
Analyzes the finished page in the context of the full site and content strategy, then produces a complete internal linking plan: which existing pages should link to this page (inbound links), which pages this page should link out to, exact anchor text for each link, and placement recommendations within the body.

### Input
```
- OPTIMIZED_ARTICLE  → full object from Step 6
- SITE_ARCHITECTURE  → from Step 3 (pillar/cluster map)
- ALL_CLUSTERS       → from Step 2 (topics of other pages)
- PAGE_MAP           → from Step 3 (all planned/existing pages)
- SITE_URL           → to reference real pages
- PRIMARY_CLUSTER    → from Step 2 (this page's topic)
```

### Prompt to send the skill
```
Article title: {OPTIMIZED_ARTICLE.title_tag}
Article primary keyword: {PRIMARY_CLUSTER.primary_kw}
Article body: {OPTIMIZED_ARTICLE.body}
Site URL: {SITE_URL}
Site architecture / page map: {SITE_ARCHITECTURE}
All keyword clusters (other pages): {ALL_CLUSTERS}

Produce a full internal linking plan:
1. INBOUND LINKS — list of existing site pages that should link TO this page
   - For each: page URL, suggested anchor text, where in that page to insert the link
2. OUTBOUND LINKS — list of pages this article should link OUT to
   - For each: target page URL, anchor text, paragraph in this article where it fits
3. PILLAR LINK — confirm or add the link to the site's pillar page
4. ORPHAN CHECK — flag if this page has no logical inbound links yet
5. ANCHOR TEXT DIVERSITY — ensure no anchor text is repeated more than twice
```

### Output — Extract and store these fields
```yaml
INTERNAL_LINKING_PLAN:
  inbound_links:
    - source_page:   # URL of existing page that should link here
      anchor_text:   # exact anchor text
      placement:     # where in that page (intro / body / conclusion)
  outbound_links:
    - target_page:   # URL this article links to
      anchor_text:   # exact anchor text
      placement:     # paragraph / section in this article
  pillar_link:       # confirmed link to/from pillar page
  orphan_status:     # true/false — is this page linked from anywhere?
  anchor_diversity:  # confirmation no anchor is overused

FINAL_ARTICLE_WITH_LINKS:  # article body updated with outbound links inserted
```

---

## Final Deliverable

After Step 7, assemble the final publish-ready page from:

| Element | Source |
|---|---|
| Title tag | `OPTIMIZED_ARTICLE.title_tag` |
| Meta description | `OPTIMIZED_ARTICLE.meta_description` |
| H1 | `OPTIMIZED_ARTICLE.h1` |
| Article body (with links) | `FINAL_ARTICLE_WITH_LINKS` |
| JSON-LD schema | `OPTIMIZED_ARTICLE.schema_jsonld` |
| Image alt texts | `OPTIMIZED_ARTICLE.image_alts` |
| Internal linking instructions | `INTERNAL_LINKING_PLAN.inbound_links` |

---

## Data Flow Summary (for Claude Code)

```
STEP 1  create-topic
  IN:   TOPIC_SEED, SITE_URL
  OUT:  TOPIC_ANGLE, AUDIENCE_DEFINED, SEED_KEYWORDS, COMPETITOR_PAGES,
        CONTENT_TYPE, POSITIONING_GAP

STEP 2  keyword-clustering
  IN:   SEED_KEYWORDS, TOPIC_ANGLE, SITE_URL
  OUT:  ALL_CLUSTERS, PRIMARY_CLUSTER

STEP 3  content-strategy
  IN:   ALL_CLUSTERS, TOPIC_ANGLE, AUDIENCE_DEFINED, POSITIONING_GAP,
        COMPETITOR_PAGES, SITE_URL
  OUT:  CONTENT_PILLARS, PAGE_MAP, PRIORITY_PAGE, EDITORIAL_CALENDAR,
        SITE_ARCHITECTURE

STEP 4  content-brief
  IN:   PRIORITY_PAGE, PRIMARY_CLUSTER, AUDIENCE_DEFINED,
        COMPETITOR_PAGES, CONTENT_TYPE
  OUT:  BRIEF (h1, word_count, sections, primary_cta,
               keyword_placement, sources, differentiation)

STEP 5  content-creation
  IN:   BRIEF, PRIMARY_CLUSTER, AUDIENCE_DEFINED, TOPIC_ANGLE, SITE_URL
  OUT:  ARTICLE (title_tag, meta_description, h1, body,
                 schema_jsonld, image_alts, word_count, cta_placement)

STEP 6  on-page-seo
  IN:   ARTICLE, PRIMARY_CLUSTER, SITE_URL
  OUT:  OPTIMIZED_ARTICLE (title_tag, meta_description, h1, body,
                            schema_jsonld, image_alts, change_log)

STEP 7  internal-linking
  IN:   OPTIMIZED_ARTICLE, SITE_ARCHITECTURE, ALL_CLUSTERS,
        PAGE_MAP, SITE_URL, PRIMARY_CLUSTER
  OUT:  INTERNAL_LINKING_PLAN, FINAL_ARTICLE_WITH_LINKS
```

---

## Implementation Notes for Claude Code

1. **Run steps sequentially.** Each step must complete before the next begins. Never parallelize — later steps depend on exact wording from earlier outputs.

2. **Store outputs as structured variables.** Parse each skill's response and extract the fields listed in each step's "Output" section. Do not pass raw text blobs — extract named fields.

3. **Pass exact values, not summaries.** When feeding output into the next skill's prompt, use the extracted field values verbatim. Do not paraphrase or compress.

4. **PRIMARY_CLUSTER is the thread.** This variable, set in Step 2, is the single keyword cluster representing the page being built. It must be passed to Steps 4, 5, 6, and 7 unchanged.

5. **SITE_ARCHITECTURE from Step 3 is critical for Step 7.** Do not discard it. It is the map that makes internal linking meaningful.

6. **If a skill returns ambiguous output**, re-prompt with: "Extract and return only the fields: [field names]" before proceeding.

7. **The pipeline produces one optimized page per run.** To build the next page (from the PAGE_MAP), restart at Step 4 with the next PRIORITY_PAGE and its associated cluster. Steps 1–3 do not need to re-run.

8. **Skill invocation pattern (Claude Code):**
   ```
   Skill("searchfit-seo:create-topic", prompt)
   → parse response → extract fields → store as variables
   → Skill("searchfit-seo:keyword-clustering", prompt using those variables)
   → ... and so on
   ```

9. **Output file:** After Step 7, write a single markdown or HTML file containing the full article, meta tags, schema block, and a separate section with the internal linking instructions for the site editor.
