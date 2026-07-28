// Surface 02 — the menubar popover. The quick-control surface: arm toggle,
// mode + status, profile switcher, pin/debug, and footer actions.

import { useEffect, useRef, type CSSProperties } from "react";
import type { Snapshot } from "../types";
import { backend } from "../lib/api";
import { Switch, SwitchSmall } from "../components/Toggle";
import { ModeChip, modeWhere } from "../components/ModeChip";
import { StatusDot } from "../components/StatusDot";

const POPOVER_WIDTH = 332;

/** Shrink the popover window to fit its content, updating as content changes. */
function usePopoverAutosize(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !("__TAURI_INTERNALS__" in window)) return;
    let ro: ResizeObserver | undefined;
    import("@tauri-apps/api/window")
      .then((m) => {
        const win = m.getCurrentWindow();
        const apply = () => {
          const h = Math.ceil(el.getBoundingClientRect().height);
          if (h > 0) win.setSize(new m.LogicalSize(POPOVER_WIDTH, h)).catch(() => {});
        };
        apply();
        ro = new ResizeObserver(apply);
        ro.observe(el);
      })
      .catch(() => {});
    return () => ro?.disconnect();
  }, [ref]);
}

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 11px 6px 3px",
};

export function Popover({ snap }: { snap: Snapshot }) {
  const { config, runtime } = snap;
  const isHost = config.mode === "host";
  const armed = config.armed;
  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  const pinned = config.pinnedProfileId != null;

  // Most important blocker (if any) preventing rebinds from firing.
  const p = runtime.permissions;
  const blocker = !p.accessibility
    ? "Accessibility not granted"
    : !p.inputMonitoring
    ? "Input Monitoring not granted"
    : !runtime.engine.installed
    ? "Injection engine not installed"
    : !runtime.engine.healthy
    ? "Injection engine not live"
    : null;

  // Honest status: paused (disarmed) → blocked (setup) → idle (in scope?) → active.
  const inScope = runtime.scopeActive;
  const statusColor = !armed || blocker ? "var(--amber)" : inScope ? "var(--green)" : "var(--sub)";
  const statusGlow = !armed || blocker ? "var(--amberSoft)" : inScope ? "var(--greenSoft)" : "transparent";
  const statusTitle = !armed
    ? "Paused — globally suspended"
    : blocker
    ? "Setup needed"
    : inScope
    ? isHost
      ? "Active — remote session"
      : "Active — Remote Desktop in focus"
    : isHost
    ? "Idle — no remote session"
    : "Idle — Remote Desktop not in focus";
  const statusSub = !armed
    ? "Toggle on to re-arm rebinds"
    : blocker
    ? `${blocker} — rebinds won't fire yet`
    : isHost
    ? `Client: ${runtime.frontmostName} · all keystrokes routed`
    : `Profile: ${active?.name ?? "—"} · all keystrokes routed`;

  const cardRef = useRef<HTMLDivElement>(null);
  usePopoverAutosize(cardRef);

  return (
    <div
      ref={cardRef}
      style={{
        background: "var(--pop)",
        backdropFilter: "blur(40px) saturate(1.4)",
        WebkitBackdropFilter: "blur(40px) saturate(1.4)",
        borderRadius: "var(--popR)",
        border: "1px solid var(--popBorder)",
        padding: "14px 15px 11px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* mode */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "1px 2px 12px" }}>
        <ModeChip mode={config.mode} />
        <span style={{ font: "400 11px/1 var(--mono)", color: "var(--sub)" }}>
          · {modeWhere(config.mode)}
        </span>
      </div>

      {/* arm toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1px 3px 12px" }}>
        <div>
          <div style={{ font: "600 14px/1.2 var(--ui)", color: "var(--text)" }}>Rebinds active</div>
          <div style={{ font: "400 11.5px/1.2 var(--mono)", color: "var(--sub)", marginTop: 3 }}>
            {armed ? "Engine armed" : "Suspended"}
          </div>
        </div>
        <Switch on={armed} danger={!armed} onClick={() => backend.setArmed(!armed)} />
      </div>

      {config.ignoreScope && (
        <button
          onClick={() => backend.setIgnoreScope(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            textAlign: "left",
            padding: "8px 10px",
            marginBottom: 4,
            borderRadius: 9,
            border: "1px solid var(--amber)",
            background: "var(--amberSoft)",
          }}
        >
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ flex: 1, font: "600 11.5px/1.3 var(--ui)", color: "var(--amber)" }}>
            Test mode — applying everywhere
          </span>
          <span style={{ font: "600 11px/1 var(--ui)", color: "var(--amber)" }}>Turn off</span>
        </button>
      )}

      {blocker && (
        <button
          onClick={() => backend.openMain()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            textAlign: "left",
            padding: "8px 10px",
            marginBottom: 4,
            borderRadius: 9,
            border: "1px solid var(--amber)",
            background: "var(--amberSoft)",
          }}
        >
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ flex: 1, font: "600 11.5px/1.3 var(--ui)", color: "var(--amber)" }}>
            Setup needed — {blocker}
          </span>
          <span style={{ font: "600 11px/1 var(--ui)", color: "var(--amber)" }}>Open →</span>
        </button>
      )}

      <Divider />

      {/* status */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "0 3px 13px" }}>
        <span style={{ marginTop: 4 }}>
          <StatusDot color={statusColor} glow={statusGlow} />
        </span>
        <div>
          <div style={{ font: "600 13px/1.3 var(--ui)", color: "var(--text)" }}>{statusTitle}</div>
          <div style={{ font: "400 11.5px/1.4 var(--ui)", color: "var(--sub)", marginTop: 2 }}>
            {statusSub}
          </div>
        </div>
      </div>

      {/* profile switcher */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 11px",
          background: "var(--field)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            font: "400 11px/1 var(--mono)",
            color: "var(--sub)",
            textTransform: "uppercase",
            letterSpacing: ".5px",
          }}
        >
          Profile
        </span>
        <select
          value={config.activeProfileId}
          onChange={(e) => backend.setActiveProfile(e.target.value)}
          style={{
            flex: 1,
            appearance: "none",
            background: "transparent",
            border: 0,
            outline: "none",
            font: "600 13px/1 var(--ui)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          {config.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--sub)", fontSize: 11 }}>⌄</span>
      </div>

      {/* pin */}
      <div style={row}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, color: "var(--sub)" }}>📌</span>
          <span style={{ font: "500 12.5px/1 var(--ui)", color: "var(--text)" }}>Pin this profile</span>
        </span>
        <SwitchSmall
          on={pinned}
          onClick={() => backend.setPinned(pinned ? null : config.activeProfileId)}
        />
      </div>

      {/* debug */}
      <div style={row}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, color: "var(--sub)" }}>🐞</span>
          <span style={{ font: "500 12.5px/1 var(--ui)", color: "var(--text)" }}>Debug mode</span>
        </span>
        <SwitchSmall on={config.debug} onClick={() => backend.setDebug(!config.debug)} />
      </div>

      <Divider />

      {/* footer */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 7px 3px" }}>
        <button
          onClick={() => backend.openMain()}
          style={{ background: "none", border: 0, font: "500 12.5px/1 var(--ui)", color: "var(--accent)", padding: 4 }}
        >
          Open RemoteKeyboard
        </button>
        <button
          onClick={() => backend.quitApp()}
          style={{ background: "none", border: 0, font: "500 12.5px/1 var(--ui)", color: "var(--sub)", padding: 4 }}
        >
          Quit
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "9px -15px 8px" }} />;
}
