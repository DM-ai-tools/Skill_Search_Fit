"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { Label } from "@/components/ui/label";
import type { InputField } from "@/lib/types";
import { SuggestionDropdown, SuggestionTextarea } from "@/components/plugins/suggestion-dropdown";
import { SuggestionSelect } from "@/components/plugins/suggestion-select";
import { cn } from "@/lib/utils";

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence < 0.7) return null;
  const pct = Math.round(confidence * 100);
  return (
    <span className="ml-2 text-xs font-medium text-primary" title="AI confidence">
      AI {pct}%
    </span>
  );
}

function FieldWithSuggestions({
  field,
  disabled,
  confidence,
  cachedSuggestions,
  suggestionsEnabled = false,
}: {
  field: InputField;
  pluginName?: string;
  pluginId?: string;
  siteUrl?: string;
  disabled?: boolean;
  confidence?: number;
  cachedSuggestions?: string[];
  suggestionsEnabled?: boolean;
}) {
  const { register, setValue, control, formState: { errors } } = useFormContext();
  const watched = useWatch({ control, name: field.name });
  const aiFilled = suggestionsEnabled && confidence !== undefined && confidence >= 0.7;
  const suggestions = suggestionsEnabled && cachedSuggestions?.length ? cachedSuggestions : [];

  const fieldClass = cn(aiFilled && "border-primary/40 bg-primary-soft/20");

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
        <ConfidenceBadge confidence={confidence} />
      </Label>

      {field.type === "textarea" ? (
        <SuggestionTextarea
          value={typeof watched === "string" ? watched : ""}
          onChange={(v) => setValue(field.name, v, { shouldValidate: true })}
          suggestions={suggestions}
          placeholder={field.placeholder}
          disabled={disabled}
          aiFilled={aiFilled}
        />
      ) : field.type === "select" ? (
        <SuggestionSelect
          field={field}
          value={typeof watched === "string" ? watched : ""}
          onChange={(v) => setValue(field.name, v, { shouldValidate: true })}
          suggestions={suggestions}
          disabled={disabled}
          aiFilled={aiFilled}
        />
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          id={field.name}
          className="h-4 w-4 rounded border-border-strong"
          disabled={disabled}
          {...register(field.name)}
        />
      ) : (
        <SuggestionDropdown
          value={typeof watched === "string" || typeof watched === "number" ? String(watched ?? "") : ""}
          onChange={(v) =>
            setValue(
              field.name,
              field.type === "number" ? (v === "" ? "" : Number(v)) : v,
              { shouldValidate: true },
            )
          }
          suggestions={suggestions}
          placeholder={field.placeholder}
          disabled={disabled}
          type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
          className={fieldClass}
          aiFilled={aiFilled}
        />
      )}

      {field.help_text && <p className="text-xs text-muted">{field.help_text}</p>}
      {errors[field.name] && <p className="text-xs text-destructive">This field is required</p>}
    </div>
  );
}

export { FieldWithSuggestions };
