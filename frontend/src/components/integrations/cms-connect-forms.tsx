"use client";

import { useState } from "react";
import { Check, AlertTriangle, Loader2, Link2, Link2Off, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useIntegrationsStore } from "@/stores/integrations-store";
import { integrationsApi } from "@/lib/integrations-api";
import type { IntegrationStatusResponse } from "@/lib/integrations-api";

const INPUT_CLASS = "integration-input";

function ConnectedCard({
  integration,
  onDisconnect,
  reconnectForm,
}: {
  integration: IntegrationStatusResponse;
  onDisconnect: () => Promise<void>;
  reconnectForm?: React.ReactNode;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");
  const isReauth = integration.status === "reauth";

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectError("");
    try {
      await onDisconnect();
    } catch {
      setDisconnectError("Failed to disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          isReauth ? "border-warning/25 bg-warning-soft/15" : "border-success/20 bg-success-soft/15",
        )}
      >
        {isReauth ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {isReauth ? "Re-authentication required" : "Connected"}
          </p>
          {integration.site_url && (
            <a
              href={integration.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted/70 hover:text-primary"
            >
              {integration.site_url}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      {disconnectError && (
        <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">
          {disconnectError}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="text-destructive hover:bg-destructive-soft/30 hover:text-destructive"
      >
        {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
      {isReauth && reconnectForm && (
        <div className="integration-card-divider pt-3">
          <p className="mb-3 text-xs font-medium text-muted">Reconnect</p>
          {reconnectForm}
        </div>
      )}
    </div>
  );
}

function TestConnectActions({
  testing,
  saving,
  canSubmit,
  onTest,
  onConnect,
}: {
  testing: boolean;
  saving: boolean;
  canSubmit: boolean;
  onTest: () => void;
  onConnect: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onTest} disabled={testing || saving || !canSubmit}>
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {testing ? "Testing…" : "Test Connection"}
      </Button>
      <Button size="sm" onClick={onConnect} disabled={saving || !canSubmit}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {saving ? "Connecting…" : "Connect"}
      </Button>
    </div>
  );
}

function TestResultBanner({
  result,
}: {
  result: { success: boolean; site_name?: string | null; error?: string | null } | null;
}) {
  if (!result) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        result.success
          ? "border-success/20 bg-success-soft/15 text-foreground"
          : "border-destructive/25 bg-destructive-soft/20 text-destructive",
      )}
    >
      {result.success ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>
        {result.success
          ? `Connection successful${result.site_name ? ` — ${result.site_name}` : ""}.`
          : result.error}
      </span>
    </div>
  );
}

export function WordPressForm({ onSuccess }: { onSuccess: () => void }) {
  const connectWordPress = useIntegrationsStore((s) => s.connectWordPress);
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; site_name?: string | null; error?: string | null } | null>(null);
  const [saveError, setSaveError] = useState("");
  const canSubmit = Boolean(siteUrl && username && appPassword);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Site URL</label>
        <input className={INPUT_CLASS} type="url" placeholder="https://yoursite.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">WordPress Username</label>
        <input className={INPUT_CLASS} type="text" placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Application Password</label>
        <input className={INPUT_CLASS} type="password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} autoComplete="new-password" />
        <p className="mt-1.5 text-[11px] text-muted/60">WordPress → Users → Profile → Application Passwords</p>
      </div>
      <TestResultBanner result={testResult} />
      {saveError && <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">{saveError}</div>}
      <TestConnectActions
        testing={testing}
        saving={saving}
        canSubmit={canSubmit}
        onTest={async () => {
          setTesting(true);
          setTestResult(null);
          try {
            setTestResult(await integrationsApi.testWordPress(siteUrl, username, appPassword));
          } catch {
            setTestResult({ success: false, error: "Connection test failed." });
          } finally {
            setTesting(false);
          }
        }}
        onConnect={async () => {
          setSaving(true);
          setSaveError("");
          try {
            await connectWordPress(siteUrl, username, appPassword);
            onSuccess();
          } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "Failed to connect WordPress.");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

export function WebflowForm({ onSuccess }: { onSuccess: () => void }) {
  const connectWebflow = useIntegrationsStore((s) => s.connectWebflow);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteId, setSiteId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; site_name?: string | null; error?: string | null } | null>(null);
  const [saveError, setSaveError] = useState("");
  const canSubmit = Boolean(siteUrl && siteId && apiToken);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Site URL</label>
        <input className={INPUT_CLASS} type="url" placeholder="https://yoursite.webflow.io" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Site ID</label>
        <input className={INPUT_CLASS} type="text" placeholder="64a1b2c3d4e5f6789012345" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        <p className="mt-1.5 text-[11px] text-muted/60">Webflow → Site settings → General → Site ID</p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">API Token</label>
        <input className={INPUT_CLASS} type="password" placeholder="Your Webflow API token" value={apiToken} onChange={(e) => setApiToken(e.target.value)} autoComplete="new-password" />
        <p className="mt-1.5 text-[11px] text-muted/60">Webflow → Account settings → Integrations → API access</p>
      </div>
      <TestResultBanner result={testResult} />
      {saveError && <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">{saveError}</div>}
      <TestConnectActions
        testing={testing}
        saving={saving}
        canSubmit={canSubmit}
        onTest={async () => {
          setTesting(true);
          setTestResult(null);
          try {
            setTestResult(await integrationsApi.testWebflow(siteId, apiToken));
          } catch {
            setTestResult({ success: false, error: "Connection test failed." });
          } finally {
            setTesting(false);
          }
        }}
        onConnect={async () => {
          setSaving(true);
          setSaveError("");
          try {
            await connectWebflow(siteUrl, siteId, apiToken);
            onSuccess();
          } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "Failed to connect Webflow.");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

export function WixForm({ onSuccess }: { onSuccess: () => void }) {
  const connectWix = useIntegrationsStore((s) => s.connectWix);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteId, setSiteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; site_name?: string | null; error?: string | null } | null>(null);
  const [saveError, setSaveError] = useState("");
  const canSubmit = Boolean(siteUrl && siteId && apiKey);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Site URL</label>
        <input className={INPUT_CLASS} type="url" placeholder="https://yoursite.wixsite.com/mysite" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Site ID</label>
        <input className={INPUT_CLASS} type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        <p className="mt-1.5 text-[11px] text-muted/60">Wix dashboard → Settings → Developer tools → Site ID</p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">API Key</label>
        <input className={INPUT_CLASS} type="password" placeholder="Your Wix API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
        <p className="mt-1.5 text-[11px] text-muted/60">Wix → API Keys Manager — needs Sites & Pages permissions</p>
      </div>
      <TestResultBanner result={testResult} />
      {saveError && <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">{saveError}</div>}
      <TestConnectActions
        testing={testing}
        saving={saving}
        canSubmit={canSubmit}
        onTest={async () => {
          setTesting(true);
          setTestResult(null);
          try {
            setTestResult(await integrationsApi.testWix(siteId, apiKey));
          } catch {
            setTestResult({ success: false, error: "Connection test failed." });
          } finally {
            setTesting(false);
          }
        }}
        onConnect={async () => {
          setSaving(true);
          setSaveError("");
          try {
            await connectWix(siteUrl, siteId, apiKey);
            onSuccess();
          } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : "Failed to connect Wix.");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

export function CmsPlatformCard({
  name,
  icon,
  integration,
  connectForm,
  onDisconnect,
}: {
  name: string;
  icon: React.ReactNode;
  integration: IntegrationStatusResponse | undefined;
  connectForm: React.ReactNode;
  onDisconnect: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnected = integration?.status === "connected" || integration?.status === "reauth";

  return (
    <div className="integration-card">
      <button
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-elevated/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">{icon}</div>
        <div className="flex-1">
          <span className="text-sm font-medium text-foreground">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                integration?.status === "reauth" ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
              )}
            >
              {integration?.status === "reauth" ? "Reconnect" : "Connected"}
            </span>
          ) : (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-muted">Not connected</span>
          )}
          <span className="text-xs text-muted/60">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="integration-card-divider px-5 pb-5 pt-4">
          {isConnected && integration ? (
            <ConnectedCard integration={integration} onDisconnect={onDisconnect} reconnectForm={connectForm} />
          ) : (
            connectForm
          )}
        </div>
      )}
    </div>
  );
}
