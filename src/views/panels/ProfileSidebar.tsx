// The Profiles sidebar (surface 03, left). Each profile shows a badge, a
// mode-aware match hint, and its mapping count. The Universal fallback is
// pinned to the top concept; non-universal profiles can be deleted when active.

import type { Snapshot, Profile } from "../../types";
import { backend } from "../../lib/api";

function profileHint(p: Profile, isHost: boolean): string {
  if (p.universal) return isHost ? "matches all clients" : "matches all connections";
  const r = p.matchRules[0];
  if (!r) return "no match rule";
  return `${isHost ? "client" : "host"}: ${r.value}`;
}

export function ProfileSidebar({ snap }: { snap: Snapshot }) {
  const { config } = snap;
  const isHost = config.mode === "host";

  return (
    <div
      style={{
        width: 214,
        flex: "none",
        background: "var(--side)",
        borderRight: "1px solid var(--border)",
        padding: "12px 9px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          font: "700 10.5px/1 var(--mono)",
          letterSpacing: ".7px",
          color: "var(--faint)",
          padding: "4px 8px 9px",
        }}
      >
        PROFILES
      </div>

      <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {config.profiles.map((p) => {
          const selected = p.id === config.activeProfileId;
          return (
            <div
              key={p.id}
              onClick={() => backend.setActiveProfile(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 9px",
                borderRadius: 9,
                cursor: "pointer",
                background: selected ? "var(--accSoft)" : "transparent",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  flex: "none",
                  borderRadius: 6,
                  background: "var(--cap)",
                  border: "1px solid var(--capBorder)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 12px/1 var(--mono)",
                  color: "var(--capText)",
                }}
              >
                {p.universal ? "∞" : p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    font: "600 12.5px/1.2 var(--ui)",
                    color: selected ? "var(--accent)" : "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    font: "400 10px/1.2 var(--mono)",
                    color: "var(--faint)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {profileHint(p, isHost)}
                </div>
              </div>
              {selected && !p.universal ? (
                <button
                  title="Delete profile"
                  onClick={(e) => {
                    e.stopPropagation();
                    backend.deleteProfile(p.id);
                  }}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--faint)",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "2px 4px",
                  }}
                >
                  ×
                </button>
              ) : (
                <div
                  style={{
                    font: "600 10px/1 var(--mono)",
                    color: "var(--sub)",
                    background: "var(--field)",
                    padding: "2px 5px",
                    borderRadius: 5,
                  }}
                >
                  {p.mappings.length}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <button
        onClick={() => backend.addProfile("")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 9px",
          borderRadius: 9,
          border: 0,
          background: "transparent",
          font: "500 12.5px/1 var(--ui)",
          color: "var(--sub)",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add profile…
      </button>
    </div>
  );
}
