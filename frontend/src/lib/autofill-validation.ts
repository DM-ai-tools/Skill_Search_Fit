import type { InputField } from "@/lib/types";
import { resolveSelectValue } from "@/lib/plugin-field-utils";

const PLACEHOLDER_PATTERNS = [
  /^lorem ipsum/i,
  /^your (business|brand)/i,
  /^example\.com/i,
  /^competitor [a-z]$/i,
  /^tbd$/i,
  /^n\/a$/i,
];

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function validateAutofillValues(
  fields: InputField[],
  values: Record<string, unknown>,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  for (const field of fields) {
    const raw = values[field.name];
    const value = field.type === "select" ? resolveSelectValue(field, raw) : raw;

    if (field.required && isEmpty(value)) {
      errors.push({ field: field.name, message: `${field.label} is required` });
      continue;
    }

    if (isEmpty(value)) continue;

    if (typeof value === "string" && isPlaceholder(value)) {
      errors.push({ field: field.name, message: `${field.label} contains placeholder text` });
    }

    if (field.type === "url" && typeof value === "string") {
      try {
        const parsed = new URL(value);
        if (!parsed.protocol || !parsed.hostname) {
          errors.push({ field: field.name, message: `${field.label} must be a valid URL` });
        }
      } catch {
        errors.push({ field: field.name, message: `${field.label} must be a valid URL` });
      }
    }

    if (field.type === "select" && typeof value === "string") {
      const allowed = (field.options || []).map((o) => o.value);
      if (!allowed.includes(value)) {
        errors.push({ field: field.name, message: `${field.label} has an invalid selection` });
      }
    }

    if (field.type === "number" && value !== "" && Number.isNaN(Number(value))) {
      errors.push({ field: field.name, message: `${field.label} must be a number` });
    }
  }

  return errors;
}
