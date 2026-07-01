import { reportPdfFilename, type ReportPdfDocument } from "@/lib/report-pdf-document";

export type { ReportPdfDocument } from "@/lib/report-pdf-document";

function hasReportContent(doc: ReportPdfDocument): boolean {
  return (
    doc.sections.length > 0 ||
    (doc.pipelineSteps?.some((step) => step.structuredSections.length > 0) ?? false)
  );
}

/**
 * Generates a PDF via OpenAI-enhanced narrative (backend) + Puppeteer HTML render.
 */
export async function downloadReportPdf(doc: ReportPdfDocument): Promise<void> {
  if (typeof window === "undefined") return;

  if (!hasReportContent(doc)) {
    throw new Error("No report content available to export.");
  }

  const response = await fetch("/api/reports/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });

  if (!response.ok) {
    let message = "Could not generate PDF.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportPdfFilename(doc);
  anchor.click();
  URL.revokeObjectURL(url);
}
