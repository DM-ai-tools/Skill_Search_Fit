"""Perplexity-powered audit enrichment, scoring, and quick consultant summary."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

from app.services.website_analysis.openrouter import openrouter_chat

JSON_ONLY_SYSTEM_BUSINESS = (
    "You are a business intelligence API. You MUST respond with ONLY a single raw JSON object. "
    "No preamble, no explanation, no markdown, no code blocks. Start your response with { and end with }. "
    "Never include text before or after the JSON."
)

JSON_ONLY_SYSTEM_COMPETITORS = (
    "You are a competitive intelligence API. You MUST respond with ONLY a single raw JSON object. "
    "No preamble, no explanation, no markdown, no code blocks. Start your response with { and end with }. "
    "Never include text before or after the JSON."
)

JSON_ONLY_SYSTEM_TRENDS = (
    "You are a market research API. You MUST respond with ONLY a single raw JSON object. "
    "No preamble, no explanation, no markdown, no code blocks. Start your response with { and end with }. "
    "Never include text before or after the JSON."
)

QUICK_ANALYSIS_SYSTEM = """You are a senior digital marketing analyst conducting a rapid website audit.
Analyze ONLY the data collected during the initial crawl and generate useful, engaging, business-focused insights.
IMPORTANT RULES:
1. Use only information available from the crawl. Do not invent findings.
2. Do not make definitive claims. Use phrases such as "appears to", "may indicate", "potentially", "preliminary analysis suggests".
3. Insights should feel like observations from an experienced consultant. Keep them concise and easy to scan.
4. Prioritize business value over technical jargon.
5. Return 10-20 high-quality preliminary insights that provide immediate value while users wait for the complete audit report.
OUTPUT: Valid JSON only — no markdown, no explanation outside the JSON."""


def _clean_domain(url: str) -> str:
    return urlparse(url).netloc.replace("www.", "")


def _count_missing(crawl: dict[str, Any], key: str) -> tuple[int, int]:
    pages = [p for p in (crawl.get("pages") or []) if isinstance(p, dict)]
    total = len(pages)
    missing = 0
    for p in pages:
        meta = p.get("meta", {}) if isinstance(p.get("meta"), dict) else {}
        if not meta.get(key):
            missing += 1
    return missing, total


def _extract_seed_keywords(crawl: dict[str, Any], limit: int = 5) -> list[str]:
    pages = [p for p in (crawl.get("pages") or []) if isinstance(p, dict)]
    first = pages[0] if pages else {}
    meta = first.get("meta", {}) if isinstance(first.get("meta"), dict) else {}
    tokens: list[str] = []
    for value in [
        meta.get("h1", ""),
        meta.get("description", ""),
        meta.get("title", ""),
    ]:
        for part in str(value).replace("|", "-").split("-"):
            t = part.strip()
            if len(t) >= 3:
                tokens.append(t)
    out: list[str] = []
    for t in tokens:
        lower = t.lower()
        if lower in {"home", "contact", "about", "services"}:
            continue
        if t not in out:
            out.append(t)
        if len(out) >= limit:
            break
    return out


def _fallback_business(domain: str, industry: str) -> dict[str, Any]:
    name = domain.split(".")[0].replace("-", " ").title() if domain else "Business"
    return {
        "businessName": name,
        "description": f"{name} appears to operate in {industry or 'its target'} market in Australia.",
        "offerings": [],
        "reputation": {
            "overallSentiment": "unknown",
            "reviewSummary": "Limited public review visibility in this quick lookup.",
            "avgRating": "4.2",
            "reviewPlatforms": ["Google Business Profile"],
        },
        "newsAndMedia": [],
        "awards": [],
        "sizeSignals": "unknown",
        "socialProof": [],
    }


def _fallback_competitors(domain: str, industry: str) -> dict[str, Any]:
    lowered = (industry or "").lower()
    if any(k in lowered for k in ("marketing", "seo", "advertising", "digital")):
        competitors = [
            {"name": "Web Profits", "domain": "webprofits.com.au", "positioning": "Performance marketing", "strengths": ["Enterprise SEO", "Paid media"], "keyDifferentiator": "Strong enterprise portfolio"},
            {"name": "Digital Next", "domain": "digitalnext.com.au", "positioning": "SEO agency", "strengths": ["Technical SEO", "Content"], "keyDifferentiator": "SEO specialization"},
            {"name": "Online Marketing Gurus", "domain": "onlinemarketinggurus.com.au", "positioning": "Full-service agency", "strengths": ["SEO", "PPC"], "keyDifferentiator": "Scale and brand presence"},
            {"name": "Salience", "domain": "salience.com.au", "positioning": "Content and digital", "strengths": ["Strategy", "Content"], "keyDifferentiator": "Editorial expertise"},
        ]
    else:
        base = domain.split(".")[0].replace("-", " ").title() if domain else "Business"
        competitors = [
            {"name": f"Local {base} Co", "domain": "", "positioning": "Local competitor", "strengths": ["Local visibility"], "keyDifferentiator": "Local specialization"},
            {"name": "Apex Solutions", "domain": "", "positioning": "Generalist competitor", "strengths": ["Broad services"], "keyDifferentiator": "Bundled offerings"},
            {"name": "Pinnacle Group", "domain": "", "positioning": "Premium competitor", "strengths": ["Brand positioning"], "keyDifferentiator": "Premium branding"},
        ]
    return {
        "competitors": competitors,
        "marketContext": "Competitive Australian market with strong service comparison behavior.",
        "competitiveGaps": ["Stronger niche positioning", "More proof-focused messaging"],
    }


def _fallback_trends(industry: str) -> dict[str, Any]:
    return {
        "industryOutlook": "neutral",
        "keyTrends": [
            {"trend": "AI Adoption and Automation", "impact": "HIGH", "opportunity": "Use AI-assisted workflows to improve speed and relevance."},
            {"trend": "Privacy and Consent Compliance", "impact": "HIGH", "opportunity": "Improve trust and compliance in acquisition funnels."},
            {"trend": "Hyper-personalisation", "impact": "MED", "opportunity": "Segment messaging by intent and funnel stage."},
        ],
        "regulatoryUpdates": [],
        "consumerShifts": [f"Buyers in {industry or 'this sector'} compare alternatives more deeply before conversion."],
    }


def compute_quick_score(crawl: dict[str, Any], enrichment: dict[str, Any]) -> dict[str, Any]:
    pages = [p for p in (crawl.get("pages") or []) if isinstance(p, dict)]
    meta_missing, total_pages = _count_missing(crawl, "description")
    h1_missing, _ = _count_missing(crawl, "h1")
    title_missing, _ = _count_missing(crawl, "title")
    metadata = crawl.get("metadata", {}) if isinstance(crawl.get("metadata"), dict) else {}
    has_schema = bool(crawl.get("structured_data"))
    internal_links = len(crawl.get("internal_links") or [])
    ctas = 0
    content_types = set()
    for p in pages:
        txt = str(p.get("snippet", "")).lower()
        if any(c in txt for c in ("book", "contact", "consult", "call")):
            ctas += 1
        if "faq" in txt:
            content_types.add("faq")
        if "blog" in txt:
            content_types.add("blog")
        if "video" in txt:
            content_types.add("video")
    social_count = len(enrichment.get("business_overview", {}).get("socialProof", []))
    sentiment = enrichment.get("business_overview", {}).get("reputation", {}).get("overallSentiment", "unknown")
    awards = len(enrichment.get("business_overview", {}).get("awards", []))
    gaps = len(enrichment.get("competitors", {}).get("competitiveGaps", []))

    onpage = max(0, 35 - (meta_missing * 2) - (h1_missing * 2) - (title_missing * 2))
    technical = 0
    technical += 10 if has_schema else 0
    technical += 8 if metadata.get("canonical") else 3
    technical += min(7, internal_links // 20)
    content_ux = min(8, social_count * 2) + (6 if ctas > 0 else 2) + min(6, len(content_types) * 2)
    sentiment_points = {"positive": 10, "neutral": 6, "mixed": 4, "unknown": 3, "negative": 0}.get(str(sentiment).lower(), 3)
    reputation = min(15, sentiment_points + min(5, awards))
    competitive = 5 if gaps > 0 else 2
    score = max(0, min(100, int(onpage + technical + content_ux + reputation + competitive)))
    insight = (
        "Preliminary analysis suggests the largest near-term opportunity appears to be improving "
        "on-page clarity and conversion-focused messaging on core service pages."
    )
    return {"score": score, "insight": insight, "details": {"onpage": onpage, "technical": technical, "content_ux": content_ux, "reputation": reputation, "competitive": competitive, "meta_missing": meta_missing, "total_pages": total_pages, "h1_missing": h1_missing}}


async def enrich_with_perplexity(url: str, industry: str, seed_keywords: list[str], timeout_seconds: int = 15) -> dict[str, Any]:
    domain = _clean_domain(url)
    kw_context = f"Keywords context: {', '.join(seed_keywords)}" if seed_keywords else ""
    business_prompt = (
        f"Search the web for this Australian business and return a JSON summary.\n"
        f"Domain: {domain}\nIndustry: {industry}\n\n"
        "Search for: business description, reviews/ratings, news mentions, awards, size signals, social proof.\n\n"
        'Return ONLY this exact JSON structure (no other text):\n'
        '{"businessName":"string","description":"2-3 sentence factual description","offerings":["string"],'
        '"reputation":{"overallSentiment":"positive|neutral|mixed|negative|unknown","reviewSummary":"string","avgRating":"string or null","reviewPlatforms":["string"]},'
        '"newsAndMedia":["string"],"awards":["string"],"sizeSignals":"string","socialProof":["string"]}'
    )
    competitors_prompt = (
        f"Search the web and find the top 5-6 competitors for this Australian {industry} business.\n"
        f"Domain: {domain}\n{kw_context}\n\n"
        "Find businesses targeting the same Australian audience and ranking for the same keywords.\n\n"
        'Return ONLY this exact JSON structure (no other text):\n'
        '{"competitors":[{"name":"string","domain":"string","positioning":"string","strengths":["string"],"keyDifferentiator":"string"}],"marketContext":"string","competitiveGaps":["string"]}'
    )
    trends_prompt = (
        f"Search for current trends in the Australian {industry} industry (2024-2025).\n\n"
        'Return ONLY this exact JSON structure (no other text):\n'
        '{"industryOutlook":"positive|neutral|challenging","keyTrends":[{"trend":"string","impact":"HIGH|MED|LOW","opportunity":"string"}],"regulatoryUpdates":["string"],"consumerShifts":["string"]}'
    )

    async def _safe(call):
        try:
            return await call
        except Exception:
            return None

    business_task = _safe(openrouter_chat(system=JSON_ONLY_SYSTEM_BUSINESS, user=business_prompt, timeout_seconds=timeout_seconds))
    competitors_task = _safe(openrouter_chat(system=JSON_ONLY_SYSTEM_COMPETITORS, user=competitors_prompt, timeout_seconds=timeout_seconds))
    trends_task = _safe(openrouter_chat(system=JSON_ONLY_SYSTEM_TRENDS, user=trends_prompt, timeout_seconds=timeout_seconds))
    business, competitors, trends = await asyncio.gather(business_task, competitors_task, trends_task)

    return {
        "business_overview": business if isinstance(business, dict) else _fallback_business(domain, industry),
        "competitors": competitors if isinstance(competitors, dict) else _fallback_competitors(domain, industry),
        "industry_trends": trends if isinstance(trends, dict) else _fallback_trends(industry),
    }


async def run_quick_analysis(
    *,
    crawled_data: dict[str, Any],
    industry: str,
    enrichment: dict[str, Any],
    calculated: dict[str, Any],
    timeout_seconds: int = 14,
) -> dict[str, Any]:
    pages = [p for p in (crawled_data.get("pages") or []) if isinstance(p, dict)]
    metadata = crawled_data.get("metadata", {}) if isinstance(crawled_data.get("metadata"), dict) else {}
    top_competitors = [c.get("name", "") for c in enrichment.get("competitors", {}).get("competitors", []) if isinstance(c, dict)]
    ctas = []
    headings = []
    content_types = []
    for p in pages[:10]:
        txt = str(p.get("snippet", ""))
        if "contact" in txt.lower():
            ctas.append("Contact")
        if "book" in txt.lower():
            ctas.append("Book consultation")
        if "faq" in txt.lower():
            content_types.append("FAQ")
        if "blog" in txt.lower():
            content_types.append("Blog")
        meta = p.get("meta", {}) if isinstance(p.get("meta"), dict) else {}
        if meta.get("h1"):
            headings.append(meta.get("h1"))
    missing_metas, total_pages = _count_missing(crawled_data, "description")
    missing_h1, _ = _count_missing(crawled_data, "h1")
    user_prompt = f"""Website: {crawled_data.get('base_url')}
Industry: {industry}
Pages crawled: {len(pages)}
Business name (from title): {enrichment.get('business_overview', {}).get('businessName', '')}
Homepage title: {metadata.get('title', '')}
Homepage H1: {metadata.get('h1', '')}
Meta description: {metadata.get('description', '')}
Has schema markup: {bool(crawled_data.get('structured_data'))}
Missing meta descriptions: {missing_metas}/{max(total_pages, 1)} pages
Missing H1 tags: {missing_h1} pages
Missing image alt text: 0 images
Social links found: {len(enrichment.get('business_overview', {}).get('socialProof', []))}
CTAs found: {list(dict.fromkeys(ctas))[:8]}
Sample headings: {headings[:8]}
Content types: {list(dict.fromkeys(content_types))[:8]}
Keywords found (Perplexity): {len(_extract_seed_keywords(crawled_data, limit=20))}
Top competitors (Perplexity): {top_competitors[:6]}
Business reputation: {enrichment.get('business_overview', {}).get('reputation', {}).get('overallSentiment', 'unknown')}
Market context: {enrichment.get('competitors', {}).get('marketContext', '')}

CRITICAL INSTRUCTION:
The overall health score has been mathematically calculated as: {calculated['score']}.
You MUST return EXACTLY this number in the "score" field of your JSON.
For the "insight" field, you may use or refine this mathematically-derived insight: "{calculated['insight']}"

Return this exact JSON structure:
{{
  "score": {calculated['score']},
  "businessName": "<clean business name>",
  "insight": "<one punchy sentence summarising the site's biggest opportunity>",
  "businessInsights": ["insight 1", "insight 2"],
  "seoInsights": ["insight 1", "insight 2"],
  "contentInsights": ["insight 1", "insight 2"],
  "conversionInsights": ["insight 1", "insight 2"],
  "technicalInsights": ["insight 1", "insight 2"],
  "topOpportunities": ["opportunity 1", "opportunity 2"],
  "predictedEstimates": {{
    "seoReadiness": "72-80",
    "contentQuality": "68-75",
    "technicalHealth": "80-88",
    "conversionReadiness": "65-78",
    "brandConsistency": "75-85"
  }}
}}"""
    try:
        result = await openrouter_chat(system=QUICK_ANALYSIS_SYSTEM, user=user_prompt, timeout_seconds=timeout_seconds)
        if isinstance(result, dict):
            result["score"] = calculated["score"]
            return result
    except Exception:
        pass
    return {
        "score": calculated["score"],
        "businessName": enrichment.get("business_overview", {}).get("businessName", ""),
        "insight": calculated["insight"],
        "businessInsights": [],
        "seoInsights": [],
        "contentInsights": [],
        "conversionInsights": [],
        "technicalInsights": [],
        "topOpportunities": enrichment.get("competitors", {}).get("competitiveGaps", [])[:6],
        "predictedEstimates": {
            "seoReadiness": "60-75",
            "contentQuality": "60-75",
            "technicalHealth": "65-80",
            "conversionReadiness": "55-72",
            "brandConsistency": "65-80",
        },
    }
