/**
 * Demo / UI-test mock changes per SearchFit SEO plugin.
 * Each item uses publish-ready proposed_content and realistic current_state.
 */

import type { ChangeResponse } from "@/lib/change-suggestions-api";

const BASE = "https://trdemo.com.au";

function mockChange(
  partial: Partial<ChangeResponse> & Pick<ChangeResponse, "field_label" | "change_type" | "current_state" | "proposed_content">,
): ChangeResponse {
  return {
    id: crypto.randomUUID(),
    suggestion_id: "00000000-0000-0000-0000-000000000001",
    location: partial.location ?? "Homepage",
    page_url: partial.page_url ?? `${BASE}/`,
    change_type: partial.change_type,
    priority: partial.priority ?? "High",
    impact_score: partial.impact_score ?? 85,
    destination: partial.destination ?? "WordPress",
    field_label: partial.field_label,
    current_state: partial.current_state,
    proposed_content: partial.proposed_content,
    edited_content: null,
    source_excerpt: partial.source_excerpt ?? null,
    needs_review: false,
    review_reason: null,
    approval_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const LONG_ARTICLE = `<h1>Complete Guide to Local SEO for Australian Tradies</h1>
<p>Ranking in local search is how tradies win steady work without relying only on referrals. This guide covers Google Business Profile, on-page signals, reviews, and citations — everything a plumbing or electrical business needs to dominate map pack results in 2026.</p>
<h2>Why Local SEO Matters for Tradies</h2>
<p>When a homeowner searches "emergency plumber near me" or "electrician Melbourne", Google shows the map pack first. Businesses with complete profiles, strong reviews, and location-optimised pages capture those high-intent clicks. TR Demo has helped dozens of Australian trade businesses increase qualified enquiries by 40–120% within six months of implementing these tactics.</p>
<h2>Google Business Profile Optimisation</h2>
<p>Claim and verify your profile. Use your exact business name — no keyword stuffing. Select primary and secondary categories that match real services. Add service areas, hours, photos of completed jobs, and a 750-character description with your city and core services. Post weekly updates about seasonal offers or safety tips.</p>
<h2>On-Page Local Signals</h2>
<p>Every service page needs a unique title tag with suburb + service, an H1 that matches search intent, and copy that mentions landmarks and neighbourhoods you serve. Embed a Google Map, add LocalBusiness schema, and link between related service pages with descriptive anchor text.</p>
<h2>Reviews and Reputation</h2>
<p>Ask satisfied customers for Google reviews within 48 hours of job completion. Respond to every review — positive and negative — within 24 hours. Aim for 4.7+ stars with 50+ reviews to compete in competitive suburbs.</p>
<h2>Citations and NAP Consistency</h2>
<p>List your business on True Local, Yellow Pages, hipages, and industry directories. Name, address, and phone must match exactly across every listing and your website footer.</p>
<h2>FAQ</h2>
<h3>How long does local SEO take for tradies?</h3>
<p>Most businesses see map pack movement in 8–12 weeks with consistent optimisation. Competitive metro areas may take 4–6 months.</p>
<h3>Do I need a blog for local SEO?</h3>
<p>Service-area pages matter more than blogging for tradies, but seasonal guides (e.g. "prepare your pipes for winter") build topical authority.</p>
<h2>Conclusion</h2>
<p>Local SEO is the highest-ROI marketing channel for Australian tradies. Start with your Google Business Profile today, then optimise service pages one suburb at a time. <a href="/contact">Book a free local SEO audit with TR Demo</a> to get a customised roadmap.</p>
<p><strong>Meta title:</strong> Local SEO for Tradies Australia | TR Demo Guide</p>
<p><strong>Meta description:</strong> Learn how Australian tradies rank in Google Maps and local search. GBP tips, reviews, citations, and on-page tactics from TR Demo.</p>`;

const MOCKS: Record<string, ChangeResponse[]> = {
  "seo-audit": [
    mockChange({
      field_label: "Meta Title",
      change_type: "metadata",
      current_state: "TR Demo | Marketing Agency",
      proposed_content: "SEO Audit Services Melbourne | TR Demo",
      priority: "High",
      impact_score: 92,
    }),
    mockChange({
      field_label: "Meta Description",
      change_type: "metadata",
      current_state: "(none — meta description missing)",
      proposed_content:
        "Get a full SEO audit for your Australian business. TR Demo finds technical issues, content gaps, and quick wins. Book your audit today.",
      priority: "High",
    }),
    mockChange({
      field_label: "Open Graph Tags",
      change_type: "metadata",
      current_state: "(none — OG tags missing)",
      proposed_content: `<meta property="og:title" content="SEO Audit Services Melbourne | TR Demo" />
<meta property="og:description" content="Full-site SEO audit for Australian businesses. Technical, on-page, and content analysis." />
<meta property="og:image" content="${BASE}/wp-content/uploads/og-seo-audit.jpg" />
<meta property="og:url" content="${BASE}/seo-audit/" />`,
      priority: "Medium",
    }),
    mockChange({
      field_label: "H1 Heading",
      change_type: "content",
      current_state: "Welcome to TR Demo",
      proposed_content: "Professional SEO Audit Services for Australian Businesses",
      page_url: `${BASE}/seo-audit/`,
    }),
    mockChange({
      field_label: "Image Alt Text",
      change_type: "technical",
      current_state: '<img src="/images/team.jpg" alt="team">',
      proposed_content:
        '<img src="/images/team.jpg" alt="TR Demo SEO consultants reviewing a client website audit report in Melbourne office">',
    }),
  ],
  "technical-seo": [
    mockChange({
      field_label: "robots.txt",
      change_type: "technical",
      current_state: "User-agent: *\nDisallow: /",
      proposed_content: `User-agent: *\nAllow: /\nDisallow: /wp-admin/\nDisallow: /wp-login.php\n\nSitemap: ${BASE}/sitemap.xml`,
      priority: "High",
      impact_score: 98,
    }),
    mockChange({
      field_label: "Canonical Tag",
      change_type: "technical",
      current_state: "(none — missing)",
      proposed_content: `<link rel="canonical" href="${BASE}/services/" />`,
      page_url: `${BASE}/services/`,
    }),
  ],
  "schema-markup": [
    mockChange({
      field_label: "Organization Schema",
      change_type: "schema",
      current_state: "(none — no Organization schema found)",
      proposed_content: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "TR Demo",
  "url": "${BASE}",
  "logo": "${BASE}/wp-content/uploads/logo.png",
  "description": "TR Demo is a Melbourne-based digital marketing agency specialising in SEO, paid media, and conversion optimisation for Australian businesses.",
  "telephone": "+61-3-9000-0000",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "100 Collins Street",
    "addressLocality": "Melbourne",
    "addressRegion": "VIC",
    "postalCode": "3000",
    "addressCountry": "AU"
  },
  "sameAs": [
    "https://www.linkedin.com/company/trdemo",
    "https://www.facebook.com/trdemo"
  ]
}
</script>`,
      priority: "High",
    }),
  ],
  "content-brief": [
    mockChange({
      field_label: "Local SEO for Tradies — Full Article",
      change_type: "content",
      location: "Blog Article",
      page_url: `${BASE}/blog/local-seo-tradies-guide/`,
      current_state: "(page does not exist — new article to create)",
      proposed_content: LONG_ARTICLE,
      priority: "High",
      impact_score: 88,
    }),
  ],
  "content-strategy": [
    mockChange({
      field_label: "SEO Audit Checklist Page",
      change_type: "content",
      location: "SEO Audit Checklist",
      page_url: `${BASE}/resources/seo-audit-checklist/`,
      current_state: "(page does not exist — new page to create)",
      proposed_content: LONG_ARTICLE,
      priority: "High",
    }),
  ],
  "internal-linking": [
    mockChange({
      field_label: "Add internal link to SEO Audit",
      change_type: "content",
      current_state: "We offer a range of digital marketing services for growing businesses.",
      proposed_content: `We offer a range of digital marketing services for growing businesses, including our <a href="/seo-audit/">professional SEO audit services</a>.`,
      page_url: `${BASE}/services/`,
    }),
  ],
  "broken-links": [
    mockChange({
      field_label: "Fix broken link: /old-services-page",
      change_type: "technical",
      current_state: '<a href="/old-services-page">Our Services</a>',
      proposed_content: '<a href="/services/">Our Services</a>',
      page_url: `${BASE}/about/`,
      source_excerpt: "HTTP 404 Not Found",
    }),
  ],
  "ai-visibility": [
    mockChange({
      field_label: "Entity clarity — About section",
      change_type: "content",
      current_state: "We are a marketing company that helps businesses grow online.",
      proposed_content:
        "TR Demo is a Melbourne-based digital marketing agency founded in 2018, specialising in SEO, Google Ads, and conversion rate optimisation for Australian small and medium businesses. We serve clients across Victoria, New South Wales, and Queensland, with a team of 12 certified specialists who have delivered measurable traffic growth for over 200 local businesses.",
      page_url: `${BASE}/about/`,
    }),
  ],
};

/** Returns demo-quality mock changes for UI testing / Storybook. */
export function getMockChanges(pluginSlug: string): ChangeResponse[] {
  return MOCKS[pluginSlug] ?? MOCKS["seo-audit"];
}

export function getAllMockPluginSlugs(): string[] {
  return Object.keys(MOCKS);
}
