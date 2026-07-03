// Permissions & engine status. Live-polls the OS grant state, triggers the real
// system prompts, and is honest about what still blocks rebinds from firing.

import { useEffect } from "react";
import type { ReactNode } from "react";
import type { Snapshot } from "../../types";
import { backend } from "../../lib/api";

const KARABINER_URL = "https://karabiner-elements.pqrs.org/";

export function PermissionsPanel({ snap }: { snap: Snapshot }) {
  const { runtime, platform } = snap;
  const { permissions: perms, engine } = runtime;
  const isMac = platform === "macos";

  // Keep the grant state live while this panel is open.
  useEffect(() => {
    backend.checkPermissions();
    const t = setInterval(() => backend.checkPermissions(), 2000);
    return () => clearInterval(t);
  }, []);

  const ready = perms.accessibility && perms.inputMonitoring && engine.installed && engine.healthy;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 22px", minHeight: 0 }}>
      {/* readiness banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 15px",
          borderRadius: "var(--winR)",
          background: ready ? "var(--greenSoft)" : "var(--amberSoft)",
          border: `1px solid ${ready ? "var(--green)" : "var(--amber)"}`,
          marginBottom: 18,
        }}
      >
        <span style={{ fontSize: 18 }}>{ready ? "✅" : "⚠️"}</span>
        <div>
          <div style={{ font: "700 13.5px/1.3 var(--ui)", color: ready ? "var(--green)" : "var(--amber)" }}>
            {ready ? "Ready — rebinds can fire" : "Setup needed — rebinds won't fire yet"}
          </div>
          <div style={{ font: "400 12px/1.4 var(--ui)", color: "var(--sub)", marginTop: 2 }}>
            {ready
              ? "All permissions granted and the injection engine is live."
              : "Grant the permissions below and install the injection engine. Each item shows its live status."}
          </div>
        </div>
      </div>

      {isMac && (
        <>
          <StatusRow
            icon="♿"
            title="Accessibility"
            body="Lets RemoteKeyboard observe and control keyboard input. Required."
            granted={perms.accessibility}
            grantedLabel="Granted"
            missingLabel="Not granted"
            actions={
              <>
                {!perms.accessibility && (
                  <Btn primary onClick={() => backend.requestAccessibility()}>
                    Request…
                  </Btn>
                )}
                <Btn onClick={() => backend.openAccessibilitySettings()}>Open Settings</Btn>
              </>
            }
          />

          <StatusRow
            icon="⌨️"
            title="Input Monitoring"
            body="Lets RemoteKeyboard read keystrokes to remap them. Required."
            granted={perms.inputMonitoring}
            grantedLabel="Granted"
            missingLabel="Not granted"
            actions={
              <>
                {!perms.inputMonitoring && (
                  <Btn primary onClick={() => backend.requestInputMonitoring()}>
                    Request…
                  </Btn>
                )}
                <Btn onClick={() => backend.openInputMonitoringSettings()}>Open Settings</Btn>
              </>
            }
          />
        </>
      )}

      <StatusRow
        icon="🧩"
        title="Injection engine"
        body={
          isMac
            ? "The Karabiner DriverKit virtual-HID driver (publisher: pqrs.org) — the only engine that reaches Remote Desktop. macOS will ask to approve its system extension."
            : "The native in-session keyboard hook."
        }
        granted={engine.installed && engine.healthy}
        grantedLabel={engine.healthy ? "Live" : "Detected"}
        missingLabel={engine.installed ? "Not live" : "Not installed"}
        detail={engine.detail}
        actions={
          isMac ? (
            !engine.installed ? (
              <Btn primary onClick={() => backend.openUrl(KARABINER_URL)}>
                Install Karabiner…
              </Btn>
            ) : !engine.healthy ? (
              <Btn primary onClick={() => backend.startKarabiner()}>
                Start Karabiner
              </Btn>
            ) : null
          ) : null
        }
      />

      <div style={{ font: "400 11.5px/1.6 var(--ui)", color: "var(--faint)", marginTop: 16, maxWidth: 640 }}>
        {isMac && (
          <p style={{ margin: "0 0 8px" }}>
            Permissions are tied to the app's code identity. In development (<code>tauri dev</code>) you're granting the
            debug binary; for a durable grant, build the app (<code>npm run tauri build</code>) and grant the bundled
            RemoteKeyboard.app. Re-signing can require re-granting.
          </p>
        )}
        <p style={{ margin: 0 }}>
          When all three are green, key &amp; modifier rebinds are injected live into your active Karabiner profile and
          scoped to Remote Desktop — Karabiner-Elements must be running. Text ("Send text") output is best-effort.
        </p>
      </div>
    </div>
  );
}

export function permissionsReady(snap: Snapshot): boolean {
  const { permissions: p, engine } = snap.runtime;
  return p.accessibility && p.inputMonitoring && engine.installed && engine.healthy;
}

function StatusRow({
  icon,
  title,
  body,
  granted,
  grantedLabel,
  missingLabel,
  detail,
  actions,
}: {
  icon: string;
  title: string;
  body: string;
  granted: boolean;
  grantedLabel: string;
  missingLabel: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
        padding: "14px 16px",
        borderRadius: "var(--winR)",
        border: "1px solid var(--border)",
        background: "var(--rowbg)",
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ font: "600 14px/1.2 var(--ui)", color: "var(--text)" }}>{title}</span>
          <Pill granted={granted}>{granted ? grantedLabel : missingLabel}</Pill>
        </div>
        <div style={{ font: "400 12px/1.5 var(--ui)", color: "var(--sub)", marginTop: 4 }}>{body}</div>
        {detail && (
          <div style={{ font: "400 11px/1.5 var(--mono)", color: "var(--faint)", marginTop: 6 }}>{detail}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
        {actions}
      </div>
    </div>
  );
}

function Pill({ granted, children }: { granted: boolean; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        font: "600 10px/1 var(--mono)",
        color: granted ? "var(--green)" : "var(--amber)",
        background: granted ? "var(--greenSoft)" : "var(--amberSoft)",
        padding: "3px 7px",
        borderRadius: 5,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: granted ? "var(--green)" : "var(--amber)" }} />
      {children}
    </span>
  );
}

function Btn({ children, onClick, primary = false }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px",
        borderRadius: 8,
        border: primary ? 0 : "1px solid var(--border2)",
        background: primary ? "var(--accent)" : "var(--rowbg)",
        color: primary ? "#fff" : "var(--text)",
        font: "600 12px/1 var(--ui)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
