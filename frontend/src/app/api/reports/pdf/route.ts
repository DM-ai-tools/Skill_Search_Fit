import { NextRequest, NextResponse } from "next/server";

import { getApiProxyTarget } from "@/lib/backend-proxy";
import { buildReportPdfHtml } from "@/lib/report-pdf-html";
import { reportPdfFilename, type ReportPdfDocument } from "@/lib/report-pdf-document";
import { generatePdfFromHtml } from "@/lib/report-pdf-puppeteer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hasReportContent(doc: ReportPdfDocument): boolean {
  return (
    doc.sections.length > 0 ||
    (doc.pipelineSteps?.some((step) => step.structuredSections.length > 0) ?? false)
  );
}

async function enhanceReportForPdf(
  doc: ReportPdfDocument,
  cookieHeader: string | null,
): Promise<ReportPdfDocument> {
  const backend = getApiProxyTarget();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieHeader) headers.cookie = cookieHeader;

  try {
    const response = await fetch(`${backend}/api/v1/reports/pdf-enhance`, {
      method: "POST",
      headers,
      body: JSON.stringify(doc),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return doc;
    return (await response.json()) as ReportPdfDocument;
  } catch {
    return doc;
  }
}

export async function POST(request: NextRequest) {
  let doc: ReportPdfDocument;
  try {
    doc = (await request.json()) as ReportPdfDocument;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!doc?.pluginName || !hasReportContent(doc)) {
    return NextResponse.json({ error: "No report content available to export." }, { status: 400 });
  }

  try {
    const enhanced = await enhanceReportForPdf(doc, request.headers.get("cookie"));
    const html = buildReportPdfHtml(enhanced);
    const pdf = await generatePdfFromHtml(html);
    const filename = reportPdfFilename(enhanced);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
