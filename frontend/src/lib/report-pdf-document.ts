import { displayPluginName } from "@/lib/plugin-catalog";
import type {
  PipelineStepReport,
  ReportBlock,
  ReportMetric,
  StructuredSection,
} from "@/lib/report-view-model";

export type ReportPdfDocument = {
  pluginName: string;
  title?: string;
  executionId?: string;
  siteUrl?: string | null;
  generatedAt?: string;
  status?: string;
  overallScore?: number | null;
  executiveSummary?: string;
  keyTakeaways?: string[];
  sections: StructuredSection[];
  metrics?: ReportMetric | null;
  pipelineSteps?: PipelineStepReport[];
  suggestions?: string[];
};

export function formatReportDate(value?: string): string {
  if (!value) return new Date().toLocaleDateString(undefined, { dateStyle: "long" });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { dateStyle: "long" });
}

export function reportPdfFilename(doc: ReportPdfDocument): string {
  const base = (doc.title || displayPluginName(doc.pluginName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "report"}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export function reportDisplayTitle(doc: ReportPdfDocument): string {
  return doc.title || displayPluginName(doc.pluginName);
}

export type { ReportBlock, StructuredSection, PipelineStepReport, ReportMetric };
