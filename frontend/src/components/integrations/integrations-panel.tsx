"use client";

import { useEffect, useState } from "react";
import { X, Plug2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIntegrationsStore } from "@/stores/integrations-store";
import {
  CmsPlatformCard,
  WebflowForm,
  WixForm,
  WordPressForm,
} from "@/components/integrations/cms-connect-forms";

interface IntegrationsPanelProps {
  open: boolean;
  onClose: () => void;
  mode?: "modal" | "page";
}

function ComingSoonContent() {
  return (
    <p className="text-sm text-muted/70">
      Coming soon — direct publishing to this platform is on the roadmap.
    </p>
  );
}

function PlatformCard({
  name,
  icon,
  children,
  expanded,
  onToggle,
}: {
  name: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="integration-card">
      <button
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-elevated/50"
        onClick={onToggle}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">{icon}</div>
        <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted/60">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <div className="integration-card-divider px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

export function IntegrationsPanel({ open, onClose, mode = "modal" }: IntegrationsPanelProps) {
  const fetch = useIntegrationsStore((s) => s.fetch);
  const integrations = useIntegrationsStore((s) => s.integrations);
  const loading = useIntegrationsStore((s) => s.loading);
  const error = useIntegrationsStore((s) => s.error);
  const disconnectWordPress = useIntegrationsStore((s) => s.disconnectWordPress);
  const disconnectWebflow = useIntegrationsStore((s) => s.disconnectWebflow);
  const disconnectWix = useIntegrationsStore((s) => s.disconnectWix);

  const [shopifyExpanded, setShopifyExpanded] = useState(false);
  const [squarespaceExpanded, setSquarespaceExpanded] = useState(false);

  useEffect(() => {
    if (open || mode === "page") fetch();
  }, [open, mode, fetch]);

  if (!open && mode === "modal") return null;

  const byPlatform = Object.fromEntries(integrations.map((i) => [i.platform, i]));

  return (
    <div
      className={cn(
        "cs-panel-overlay flex items-end justify-center p-4 sm:items-center",
        mode === "modal"
          ? "fixed inset-0 z-50"
          : "relative z-0 min-h-[calc(100vh-6.5rem)] items-start p-0 sm:p-0",
      )}
    >
      {mode === "modal" ? (
        <div className="modal-overlay" onClick={onClose} aria-hidden />
      ) : null}

      <div
        className={cn(
          "cs-panel-enter cs-panel-shell relative flex w-full flex-col overflow-hidden",
          mode === "modal" ? "max-h-[88vh] max-w-lg" : "max-w-5xl",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Plug2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Business Integrations
              </h2>
              <p className="text-xs text-muted/70">Connect your CMS for direct publishing</p>
            </div>
          </div>
          {mode === "modal" ? (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted">Loading…</span>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-3">
              <CmsPlatformCard
                name="WordPress"
                icon={
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.5c1.47 0 2.857.37 4.07 1.02L5.52 16.07A8.5 8.5 0 0 1 3.5 12 8.5 8.5 0 0 1 12 3.5zm0 17a8.5 8.5 0 0 1-4.07-1.02l10.55-11.55A8.5 8.5 0 0 1 20.5 12 8.5 8.5 0 0 1 12 20.5z" />
                  </svg>
                }
                integration={byPlatform["WordPress"]}
                connectForm={<WordPressForm onSuccess={() => {}} />}
                onDisconnect={disconnectWordPress}
              />

              <CmsPlatformCard
                name="Webflow"
                icon={
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.811 8.073a5.97 5.97 0 0 1-4.208 5.695l1.77 5.243-4.57-5.243a5.991 5.991 0 0 1-1.783.27A5.997 5.997 0 0 1 3.027 8.07c0-3.314 2.693-6.001 6.01-6.001a5.999 5.999 0 0 1 5.96 5.267L17.81 8.07zm-5.96-4.004a3.999 3.999 0 1 0 0 7.999 3.999 3.999 0 0 0 0-8z" />
                  </svg>
                }
                integration={byPlatform["Webflow"]}
                connectForm={<WebflowForm onSuccess={() => {}} />}
                onDisconnect={disconnectWebflow}
              />

              <CmsPlatformCard
                name="Wix"
                icon={
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 12l2-7h2l-2 7H6zm4 0l2-7h2l-2 7h-2zm4 0l2-7h2l-2 7h-2z" />
                  </svg>
                }
                integration={byPlatform["Wix"]}
                connectForm={<WixForm onSuccess={() => {}} />}
                onDisconnect={disconnectWix}
              />

              <PlatformCard
                name="Shopify"
                icon={
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.337 23.979l5.151-1.129S18.304 7.44 18.287 7.31a.196.196 0 0 0-.192-.168c-.082 0-1.528-.03-1.528-.03s-1.012-.978-1.124-1.093V23.98zM13.524.5a.19.19 0 0 0-.111.036c-.064.046-1.3.904-1.3.904s-.78-2.405-2.608-2.405h-.12C9.084-.56 8.5-.914 7.853-.914 4.9-.914 3.489 2.887 3.06 4.82c-1.114.345-1.904.59-1.986.615C.436 5.729.42 5.746.398 6.377L0 21.875 13.716 24z" />
                  </svg>
                }
                expanded={shopifyExpanded}
                onToggle={() => setShopifyExpanded((v) => !v)}
              >
                <ComingSoonContent />
              </PlatformCard>

              <PlatformCard
                name="Squarespace"
                icon={
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zm-9 9l9 4.5L21 11v6l-9 4.5L3 17v-6z" />
                  </svg>
                }
                expanded={squarespaceExpanded}
                onToggle={() => setSquarespaceExpanded((v) => !v)}
              >
                <ComingSoonContent />
              </PlatformCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
