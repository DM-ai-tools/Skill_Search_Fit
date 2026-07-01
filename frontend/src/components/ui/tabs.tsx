"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Context ────────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue>({
  activeTab: "",
  setActiveTab: () => {},
  baseId: "tabs",
});

// ── Tabs ───────────────────────────────────────────────────────────────────────

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const baseId = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const activeTab = value !== undefined ? value : internalValue;
  const setActiveTab = React.useCallback(
    (v: string) => {
      setInternalValue(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ── TabsList ───────────────────────────────────────────────────────────────────

export function TabsList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    if (!tabs.length) return;
    const activeIndex = tabs.findIndex((tab) => tab === document.activeElement);
    const current = activeIndex >= 0 ? activeIndex : tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    let next = current >= 0 ? current : 0;
    if (e.key === "ArrowRight") next = (current + 1 + tabs.length) % tabs.length;
    if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    e.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return (
    <div role="tablist" className={cn("flex", className)} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

// ── TabsTrigger ────────────────────────────────────────────────────────────────

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function TabsTrigger({ value, className, children }: TabsTriggerProps) {
  const { activeTab, setActiveTab, baseId } = React.useContext(TabsContext);
  const isActive = activeTab === value;
  const safeValue = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  const tabId = `${baseId}-tab-${safeValue}`;
  const panelId = `${baseId}-panel-${safeValue}`;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      id={tabId}
      tabIndex={isActive ? 0 : -1}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => setActiveTab(value)}
      className={cn(className)}
    >
      {children}
    </button>
  );
}

// ── TabsContent ────────────────────────────────────────────────────────────────

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function TabsContent({ value, className, children }: TabsContentProps) {
  const { activeTab, baseId } = React.useContext(TabsContext);
  if (activeTab !== value) return null;
  const safeValue = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  const tabId = `${baseId}-tab-${safeValue}`;
  const panelId = `${baseId}-panel-${safeValue}`;
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={0}
      data-state="active"
      className={cn(className)}
    >
      {children}
    </div>
  );
}
