"use client";

import { cn } from "@/lib/utils";
import { Select as UiSelect } from "@/components/ui/select";
import type { ChangeDestination, ChangePriority, ChangeType } from "@/lib/change-suggestions-api";

export type Filters = {
  search: string;
  priority: ChangePriority | "";
  changeType: ChangeType | "";
  destination: ChangeDestination | "";
};

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  layout?: "horizontal" | "vertical";
}

const inputBase =
  "rounded-xl border border-border-strong bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors";

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  placeholder: string;
  className?: string;
}) {
  return (
    <UiSelect
      value={value}
      onChange={(e) => onChange(e.target.value as T | "")}
      className={cn(inputBase, "h-9 px-3", !value && "text-muted", className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </UiSelect>
  );
}

export function FilterBar({ filters, onChange, layout = "horizontal" }: FilterBarProps) {
  const set = (partial: Partial<Filters>) => onChange({ ...filters, ...partial });

  const isVertical = layout === "vertical";

  return (
    <div className={cn(isVertical ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2")}>
      <input
        type="text"
        placeholder="Search field, page…"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        className={cn(inputBase, "h-9 px-3", isVertical ? "w-full" : "flex-1 min-w-36")}
      />
      <FilterSelect<ChangePriority>
        value={filters.priority}
        onChange={(v) => set({ priority: v })}
        placeholder="All priorities"
        className={isVertical ? "w-full" : ""}
        options={[
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
        ]}
      />
      <FilterSelect<ChangeType>
        value={filters.changeType}
        onChange={(v) => set({ changeType: v })}
        placeholder="All types"
        className={isVertical ? "w-full" : ""}
        options={[
          { value: "metadata", label: "Metadata" },
          { value: "schema", label: "Schema" },
          { value: "content", label: "Content" },
          { value: "technical", label: "Technical" },
          { value: "capture-form", label: "Capture form" },
        ]}
      />
      <FilterSelect<ChangeDestination>
        value={filters.destination}
        onChange={(v) => set({ destination: v })}
        placeholder="All platforms"
        className={isVertical ? "w-full" : ""}
        options={[
          { value: "WordPress", label: "WordPress" },
          { value: "Webflow", label: "Webflow" },
          { value: "Wix", label: "Wix" },
          { value: "Mailchimp", label: "Mailchimp" },
        ]}
      />
      {(filters.search || filters.priority || filters.changeType || filters.destination) && (
        <button
          onClick={() => onChange({ search: "", priority: "", changeType: "", destination: "" })}
          className={cn(
            "text-xs text-muted hover:text-foreground transition-colors",
            isVertical ? "text-left" : "",
          )}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
