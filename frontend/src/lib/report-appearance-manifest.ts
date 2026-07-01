import { parseBlocksFromBody } from "@/lib/report-view-model";
import type { StructuredSection, PipelineStepReport } from "@/lib/report-view-model";
import type { UnifiedPipelineReport } from "@/lib/types";

export type ReportBlockSummary = {
  paragraphs: number;
  bullets: number;
  numbered: number;
  tables: number;
};

export type ReportAppearanceSectionManifest = {
  id: string;
  title: string;
  expandable: boolean;
  initially_expanded: boolean;
  source_step_count: number;
  metrics_displayed: string[];
  block_summary: ReportBlockSummary;
  approx_char_count: number;
};

export type ReportAppearanceManifest = {
  report_type: "unified_pipeline" | "plugin" | "pipeline_legacy";
  title: string;
  layout: {
    has_header: boolean;
    has_metrics_strip: boolean;
    has_executive_narrative: boolean;
    has_sidebar_nav: boolean;
    has_final_deliverable_card: boolean;
    column_layout: "two_column" | "single_column";
  };
  sections: ReportAppearanceSectionManifest[];
  totals: {
    section_count: number;
    total_blocks: number;
    total_tables: number;
    longest_section_chars: number;
  };
};

function summarizeBlocks(blocks: ReturnType<typeof parseBlocksFromBody>): ReportBlockSummary {
  return {
    paragraphs: blocks.filter((b) => b.type === "paragraph").length,
    bullets: blocks.filter((b) => b.type === "bullet").length,
    numbered: blocks.filter((b) => b.type === "numbered").length,
    tables: blocks.filter((b) => b.type === "table").length,
  };
}

function sectionManifestFromMarkdown(
  id: string,
  title: string,
  markdown: string,
  opts: Partial<ReportAppearanceSectionManifest> = {},
): ReportAppearanceSectionManifest {
  const blocks = parseBlocksFromBody(markdown);
  const summary = summarizeBlocks(blocks);
  return {
    id,
    title,
    expandable: opts.expandable ?? false,
    initially_expanded: opts.initially_expanded ?? true,
    source_step_count: opts.source_step_count ?? 0,
    metrics_displayed: opts.metrics_displayed ?? [],
    block_summary: summary,
    approx_char_count: markdown.length,
  };
}

function sectionManifestFromStructured(
  section: StructuredSection,
  opts: Partial<ReportAppearanceSectionManifest> = {},
): ReportAppearanceSectionManifest {
  const summary = summarizeBlocks(section.blocks);
  const blockCount =
    summary.paragraphs + summary.bullets + summary.numbered + summary.tables;
  const approx = section.blocks.reduce((n, b) => n + (b.text?.length ?? 0), 0) + blockCount * 40;
  return {
    id: section.id,
    title: section.title,
    expandable: opts.expandable ?? false,
    initially_expanded: opts.initially_expanded ?? true,
    source_step_count: opts.source_step_count ?? 0,
    metrics_displayed: opts.metrics_displayed ?? [],
    block_summary: summary,
    approx_char_count: approx,
  };
}

function buildTotals(sections: ReportAppearanceSectionManifest[]): ReportAppearanceManifest["totals"] {
  let totalBlocks = 0;
  let totalTables = 0;
  let longest = 0;
  for (const s of sections) {
    const b = s.block_summary;
    totalBlocks += b.paragraphs + b.bullets + b.numbered + b.tables;
    totalTables += b.tables;
    longest = Math.max(longest, s.approx_char_count);
  }
  return {
    section_count: sections.length,
    total_blocks: totalBlocks,
    total_tables: totalTables,
    longest_section_chars: longest,
  };
}

export function manifestFromUnifiedReport(report: UnifiedPipelineReport): ReportAppearanceManifest {
  const sections: ReportAppearanceSectionManifest[] = report.sections.map((s) =>
    sectionManifestFromMarkdown(s.id, s.title, s.combined_markdown, {
      expandable: s.expandable,
      initially_expanded: !s.expandable,
      source_step_count: s.source_step_labels.length,
      metrics_displayed: Object.keys(s.metrics),
    }),
  );

  if (report.final_deliverable) {
    sections.push(
      sectionManifestFromMarkdown("final-deliverable", "Final Deliverable", report.final_deliverable.article_body, {
        expandable: false,
        initially_expanded: true,
        metrics_displayed: ["title_tag", "meta_description", "h1"],
      }),
    );
  }

  return {
    report_type: "unified_pipeline",
    title: report.pipeline_name,
    layout: {
      has_header: true,
      has_metrics_strip: true,
      has_executive_narrative: Boolean(report.narrative?.trim()),
      has_sidebar_nav: true,
      has_final_deliverable_card: Boolean(report.final_deliverable),
      column_layout: "two_column",
    },
    sections,
    totals: buildTotals(sections),
  };
}

export function manifestFromStructuredSections(
  title: string,
  sections: StructuredSection[],
  opts: {
    reportType?: ReportAppearanceManifest["report_type"];
    hasMetrics?: boolean;
    hasExecutiveSummary?: boolean;
    pipelineSteps?: number;
  } = {},
): ReportAppearanceManifest {
  const mapped = sections.map((s) => sectionManifestFromStructured(s));
  return {
    report_type: opts.reportType ?? "plugin",
    title,
    layout: {
      has_header: true,
      has_metrics_strip: opts.hasMetrics ?? false,
      has_executive_narrative: opts.hasExecutiveSummary ?? false,
      has_sidebar_nav: false,
      has_final_deliverable_card: false,
      column_layout: opts.pipelineSteps ? "single_column" : "single_column",
    },
    sections: mapped,
    totals: buildTotals(mapped),
  };
}

export function manifestFromPipelineSteps(
  title: string,
  steps: PipelineStepReport[],
): ReportAppearanceManifest {
  const sections = steps.flatMap((step) =>
    step.structuredSections.map((s) =>
      sectionManifestFromStructured(s, {
        source_step_count: 1,
        initially_expanded: true,
      }),
    ),
  );
  return {
    report_type: "pipeline_legacy",
    title,
    layout: {
      has_header: true,
      has_metrics_strip: true,
      has_executive_narrative: false,
      has_sidebar_nav: true,
      has_final_deliverable_card: false,
      column_layout: "single_column",
    },
    sections,
    totals: buildTotals(sections),
  };
}
