import type { InputField } from "@/lib/types";

/** Map select label or loose text to the exact option value the API expects. */
export function resolveSelectValue(field: InputField, raw: unknown): string {
  if (field.type !== "select" || !field.options?.length) {
    return raw == null ? "" : String(raw);
  }
  const text = String(raw).trim();
  if (!text) return "";
  const byValue = field.options.find((o) => o.value === text);
  if (byValue) return byValue.value;
  const lower = text.toLowerCase();
  const byLabel = field.options.find((o) => o.label.trim().toLowerCase() === lower);
  if (byLabel) return byLabel.value;
  const loose = field.options.find(
    (o) =>
      o.label.trim().toLowerCase().includes(lower) ||
      lower.includes(o.label.trim().toLowerCase()),
  );
  return loose?.value ?? text;
}

export function selectOptionLabel(field: InputField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

export function normalizePluginInputs(
  fields: InputField[],
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...inputs };
  for (const field of fields) {
    if (field.type === "select" && out[field.name] != null && out[field.name] !== "") {
      out[field.name] = resolveSelectValue(field, out[field.name]);
    }
  }
  return out;
}
