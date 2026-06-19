/** Strip markdown formatting so report UI shows plain readable text. */

const NOISE_LINE = /^(?:[-*_]{3,}|#{1,6}\s*)$/;

export function stripMarkdown(text: string): string {
  let s = text.trim();
  if (!s) return "";

  // Links: [label](url) → label
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Images: ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Bold / italic (order matters — bold first)
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  // Inline code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Stray markdown chars
  s = s.replace(/\*\*/g, "").replace(/\*/g, "");
  // HTML tags
  s = s.replace(/<[^>]+>/g, "");
  // Checkbox markers
  s = s.replace(/^\[[ xX]\]\s*/, "");
  return s.replace(/\s+/g, " ").trim();
}

export function stripFrontmatter(markdown: string): string {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) return markdown;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return trimmed.slice(end + 4).trimStart();
}

export function cleanReportLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || NOISE_LINE.test(trimmed)) return "";
  if (trimmed === "---" || trimmed === "***") return "";
  return stripMarkdown(trimmed);
}

export function cleanTableCell(cell: string): string {
  return stripMarkdown(cell.replace(/\\\|/g, "|"));
}

export function isTableSeparator(line: string): boolean {
  return /^\|?[\s|:-]+\|?$/.test(line.trim()) && /[-:]/.test(line);
}

export function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanTableCell(cell));
}
