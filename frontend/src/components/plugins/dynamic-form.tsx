"use client";

import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { InputField } from "@/lib/types";
import { FieldWithSuggestions } from "@/components/plugins/field-with-suggestions";

interface DynamicFormProps {
  fields: InputField[];
  defaultValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  disabled?: boolean;
  formId?: string;
  pluginName?: string;
  pluginId?: string;
  siteUrl?: string;
  formKey?: string;
  confidenceScores?: Record<string, number>;
  fieldSuggestions?: Record<string, string[]>;
  suggestionsEnabled?: boolean;
}

export function DynamicForm({
  fields,
  defaultValues = {},
  onSubmit,
  disabled,
  formId = "plugin-form",
  pluginName,
  pluginId,
  siteUrl,
  formKey = "default",
  confidenceScores = {},
  fieldSuggestions = {},
  suggestionsEnabled = false,
}: DynamicFormProps) {
  const methods = useForm({
    defaultValues: defaultValues as Record<string, string | number | boolean>,
  });

  useEffect(() => {
    methods.reset(defaultValues as Record<string, string | number | boolean>);
  }, [methods, defaultValues, formKey]);

  return (
    <FormProvider {...methods}>
      <form id={formId} onSubmit={methods.handleSubmit(onSubmit)} className="space-y-4">
        {fields.map((field) => (
          <FieldWithSuggestions
            key={field.name}
            field={field}
            pluginName={pluginName}
            pluginId={pluginId}
            siteUrl={siteUrl}
            disabled={disabled}
            confidence={confidenceScores[field.name]}
            cachedSuggestions={fieldSuggestions[field.name]}
            suggestionsEnabled={suggestionsEnabled}
          />
        ))}
      </form>
    </FormProvider>
  );
}
