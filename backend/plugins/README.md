# Plugin Definitions

Each plugin is a JSON file in this folder. Seed into the database with:

```bash
cd backend
python scripts/seed_plugins.py
```

## JSON Schema

```json
{
  "plugin_name": "Plugin Name",
  "description": "Short description for library card",
  "category": "visibility | research | content | technical",
  "icon": "eye | link | file-text | map | network | layers | scan-search | code | clipboard-check | gauge | pen-line | lightbulb | search | wrench | bot | puzzle",
  "input_fields": [
    {
      "name": "field_key",
      "label": "Display Label",
      "type": "text | textarea | number | select | url | checkbox",
      "required": true,
      "placeholder": "optional",
      "help_text": "optional",
      "options": [{ "value": "x", "label": "X" }]
    }
  ],
  "prompts": {
    "system": "Full skill/instructions for Claude",
    "primary": "User message template with {{field_key}} placeholders"
  },
  "deprecated_names": ["Old Plugin Name"]
}
```

Optional `deprecated_names` disables prior plugin records when a plugin is renamed (handled by `seed_plugins.py`).

## Plugins (12)

| File | Plugin | Inputs |
|------|--------|--------|
| `ai_visibility_tracking.json` | AI Visibility & Tracking | brand_name, category, website_url, competitors, value_proposition, target_prompts, ai_platforms |
| `broken_link_checker.json` | Broken Link Checker | audit_type, site_url, sitemap_url, max_pages, check_external_links, codebase_content, defined_routes, existing_redirects |
| `content_brief_generator.json` | Content Brief Generator | target_keyword, secondary_keywords, target_audience, content_goal, desired_word_count, content_type, tone, competitor_urls, internal_link_targets, unique_angle |
| `create_seo_content.json` | Create SEO-Optimized Content | topic, primary_keyword, content_type, target_word_count, tone, secondary_keywords, target_audience, search_intent, internal_link_targets, content_brief, cta_goal |
| `content_strategy.json` | Content Strategy | business_name, business_description, target_audience, seed_keywords, competitors, existing_content, website_url, publishing_cadence, planning_horizon, business_priorities |
| `create_topic.json` | Create Topic | seed, topic_count, target_audience, funnel_stage, business_niche, exclude_topics |
| `internal_linking_strategy.json` | Internal Linking Strategy | site_url, analysis_source, sitemap_url, site_type, page_inventory, current_internal_links, priority_pages, topic_clusters, codebase_routes |
| `keyword_clustering.json` | Keyword Clustering | keywords, intent_filter, business_niche, website_url, exclude_keywords |
| `on_page_seo_optimization.json` | On-Page SEO Optimization | target_keyword, search_intent, target_audience, page_type, page_url, page_content, current_title, current_meta_description, current_headings, secondary_keywords, internal_link_targets |
| `schema_markup_generator.json` | Generate Schema Markup | source_file, page_url, primary_schema_type, additional_schemas, page_content, page_title, meta_description, author_name, date_published, date_modified, image_urls, organization_name, logo_url, faq_content, howto_steps, breadcrumbs, product_info, integration_framework |
| `seo_audit.json` | SEO Audit | audit_type, site_url, site_name, sitemap_url, robots_txt_content, pages_to_audit, codebase_content, max_pages, target_keywords, audit_focus |
| `technical_seo_audit.json` | Technical SEO Audit | audit_type, site_url, site_name, tech_stack, sitemap_url, robots_txt_content, pages_to_audit, codebase_content, core_web_vitals, http_headers_sample, multi_language, known_issues |
