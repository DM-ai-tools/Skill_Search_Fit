import { parseBlocksFromBody } from "@/lib/report-view-model";
import type { StructuredSection } from "@/lib/report-view-model";
import type { ReportPdfDocument } from "@/lib/report-pdf-document";
import type { PresentedReport } from "@/components/reports/report-presentation-view";
import type { UnifiedPipelineReport } from "@/lib/types";

export function presentedReportToPdfDocument(
  presented: PresentedReport,
  opts: {
    pipelineName: string;
    siteUrl?: string;
    executionId?: string;
    deliverable?: UnifiedPipelineReport["final_deliverable"];
  },
): ReportPdfDocument {
  const sections: StructuredSection[] = [];

  const execBlocks = parseBlocksFromBody(presented.executive_markdown);
  if (execBlocks.length > 0) {
    sections.push({
      id: "executive-overview",
      title: "Executive Overview",
      level: 2,
      blocks: execBlocks,
      isNumbered: false,
      sectionNumber: 1,
    });
  }

  presented.sections.forEach((sec, i) => {
    sections.push({
      id: sec.id,
      title: sec.display_title,
      level: 2,
      blocks: parseBlocksFromBody(sec.presentation_markdown),
      isNumbered: true,
      sectionNumber: sections.length + 1,
    });
    void i;
  });

  if (opts.deliverable?.article_body) {
    const deliverableBlocks = parseBlocksFromBody(opts.deliverable.article_body);
    const metaLines: string[] = [];
    if (opts.deliverable.title_tag) metaLines.push(`Title tag: ${opts.deliverable.title_tag}`);
    if (opts.deliverable.meta_description) {
      metaLines.push(`Meta description: ${opts.deliverable.meta_description}`);
    }
    if (opts.deliverable.h1) metaLines.push(`H1: ${opts.deliverable.h1}`);

    sections.push({
      id: "final-deliverable",
      title: presented.deliverable_headline || "Final Deliverable",
      level: 2,
      blocks: [
        ...metaLines.map((text) => ({ type: "paragraph" as const, text })),
        ...deliverableBlocks,
      ],
      isNumbered: true,
      sectionNumber: sections.length + 1,
    });
  }

  return {
    pluginName: opts.pipelineName,
    title: presented.cover_title || opts.pipelineName,
    executionId: opts.executionId,
    siteUrl: opts.siteUrl ?? null,
    generatedAt: new Date().toISOString(),
    executiveSummary: presented.cover_subtitle || undefined,
    keyTakeaways: presented.highlights.map((h) => `${h.label}: ${h.value}`),
    sections,
    pipelineSteps: undefined,
  };
}
