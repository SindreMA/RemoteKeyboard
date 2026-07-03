// The main window shell: a draggable header with section tabs, the Profiles
// sidebar, and the active panel. On first run it shows Onboarding instead.

import { useState, type CSSProperties } from "react";
import type { Snapshot } from "../types";
import { Onboarding } from "./Onboarding";
import { ProfileSidebar } from "./panels/ProfileSidebar";
import { MappingsPanel } from "./panels/MappingsPanel";
import { ScopingPanel } from "./panels/ScopingPanel";
import { DebugPanel } from "./panels/DebugPanel";
import { PermissionsPanel, permissionsReady } from "./panels/PermissionsPanel";
import { AppBadge } from "../components/Icon";

type Tab = "mappings" | "connection" | "debug" | "permissions";
const TABS: { id: Tab; label: string }[] = [
  { id: "mappings", label: "Mappings" },
  { id: "connection", label: "Connection" },
  { id: "debug", label: "Debug" },
  { id: "permissions", label: "Permissions" },
];

export function MainWindow({ snap }: { snap: Snapshot }) {
  const [tab, setTab] = useState<Tab>("mappings");

  if (!snap.config.onboarded) return <Onboarding snap={snap} />;

  const active =
    snap.config.profiles.find((p) => p.id === snap.config.activeProfileId) ?? snap.config.profiles[0];
  const needsSetup = !permissionsReady(snap);

  return (
    <div style={{ height: "100%", background: "var(--win)", display: "flex", flexDirection: "column" }}>
      {/* draggable header */}
      <div
        data-tauri-drag-region
        style={{
          height: 46,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "0 16px 0 82px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <AppBadge size={22} />
        <div style={{ font: "700 13.5px/1 var(--ui)", color: "var(--text)", letterSpacing: "-.2px" }}>
          RemoteKeyboard
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--field)", borderRadius: 9 }}>
          {TABS.map((t) => (
            <button key={t.id} style={tab === t.id ? tabActive : tabIdle} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "permissions" && needsSetup && (
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--amber)",
                    marginLeft: 6,
                    verticalAlign: "middle",
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ProfileSidebar snap={snap} />
        {tab === "mappings" && <MappingsPanel snap={snap} profile={active} />}
        {tab === "connection" && <ScopingPanel snap={snap} profile={active} />}
        {tab === "debug" && <DebugPanel snap={snap} />}
        {tab === "permissions" && <PermissionsPanel snap={snap} />}
      </div>
    </div>
  );
}

const tabBase: CSSProperties = {
  padding: "5px 13px",
  borderRadius: 7,
  border: 0,
  font: "600 12px/1 var(--ui)",
  transition: ".15s",
};
const tabActive: CSSProperties = {
  ...tabBase,
  background: "var(--accent)",
  color: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,.2)",
};
const tabIdle: CSSProperties = { ...tabBase, background: "transparent", color: "var(--sub)" };
