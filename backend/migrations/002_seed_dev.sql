-- Dev seed: sample plugins (admin user seeded via scripts/seed_admin.py)

INSERT INTO plugins (plugin_name, description, category, icon, input_fields, schema_version, status)
VALUES
(
    'Keyword Gap Analyzer',
    'Identify keyword opportunities compared to competitors.',
    'research',
    'search',
    '[{"name":"keyword","label":"Seed Keyword","type":"text","required":true,"placeholder":"e.g. best seo tools"},{"name":"competitor_url","label":"Competitor URL","type":"url","required":true}]'::jsonb,
    1,
    'enabled'
),
(
    'Meta Description Generator',
    'Generate optimized meta descriptions for target pages.',
    'content',
    'file-text',
    '[{"name":"page_title","label":"Page Title","type":"text","required":true},{"name":"target_keyword","label":"Target Keyword","type":"text","required":true}]'::jsonb,
    1,
    'enabled'
),
(
    'Technical SEO Checklist',
    'Run a structured technical SEO audit workflow.',
    'technical',
    'wrench',
    '[{"name":"site_url","label":"Site URL","type":"url","required":true}]'::jsonb,
    1,
    'enabled'
);
