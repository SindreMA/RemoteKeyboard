// Surface 04 — Connection & scoping. Mode-aware: client matches by host window
// title, host matches by client name. Matching is best-effort; the Universal
// fallback and manual Pin are always available.

import { useEffect, useState } from "react";
import type { Profile, RuleKind, Snapshot } from "../../types";
import { backend } from "../../lib/api";
import { SwitchSmall } from "../../components/Toggle";

const RULE_KINDS: RuleKind[] = ["contains", "regex", "exact"];

function ruleLabel(kind: RuleKind, isHost: boolean): string {
  if (kind === "exact") return isHost ? "client is" : "host is";
  return kind;
}

export function ScopingPanel({ snap, profile }: { snap: Snapshot; profile: Profile }) {
  const { config, runtime } = snap;
  const isHost = config.mode === "host";
  const pinned = config.pinnedProfileId != null;

  const [newKind, setNewKind] = useState<RuleKind>("contains");
  const [newValue, setNewValue] = useState("");

  // Keep the frontmost-app indicator live while the panel is open.
  useEffect(() => {
    backend.refreshScope();
    const t = setInterval(() => backend.refreshScope(), 2500);
    return () => clearInterval(t);
  }, []);

  const scopeTitle = isHost
    ? "Rebinds only apply during remote sessions"
    : "Rebinds only apply inside Remote Desktop";
  const scopeBody = isHost
    ? "When no client is connected, RemoteKeyboard stays out of the way — local input on the PC is never touched. Matching is best-effort; pin a profile if needed."
    : "While any other app is frontmost, RemoteKeyboard stays out of the way — every keystroke passes through untouched. Matching is best-effort; you can always pin a profile.";
  const frontLabel = isHost ? "ACTIVE SESSION" : "FRONTMOST APP";
  const frontName = isHost ? "Remote session" : runtime.frontmostName || "—";
  const frontMeta = isHost
    ? `client: ${runtime.frontmostName || "unknown"}`
    : runtime.frontmostBundle || "unknown";
  const rulesTitle = isHost ? "MATCH RULES · BY CLIENT NAME" : "MATCH RULES · BY HOST WINDOW";
  const uniLabel = isHost ? "Matches all clients" : "Matches all connections";
  const scopeNote = isHost
    ? "Best-effort: client names vary by device. Pin if a match misbehaves."
    : "Best-effort: window titles can change between sessions. Pin if a match misbehaves.";

  const addRule = () => {
    const v = newValue.trim();
    if (!v) return;
    backend.addMatchRule(profile.id, newKind, v);
    setNewValue("");
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 22px", minHeight: 0 }}>
      {config.ignoreScope && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "12px 14px",
            borderRadius: "var(--winR)",
            background: "var(--amberSoft)",
            border: "1px solid var(--amber)",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 17 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 13px/1.3 var(--ui)", color: "var(--amber)" }}>
              Test mode — rebinds apply EVERYWHERE
            </div>
            <div style={{ font: "400 11.5px/1.4 var(--ui)", color: "var(--sub)", marginTop: 2 }}>
              The Remote Desktop scope is off, so these rebinds affect your whole Mac. Use it to prove the engine
              works, then turn it back off.
            </div>
          </div>
          <button
            onClick={() => backend.setIgnoreScope(false)}
            style={{
              padding: "7px 13px",
              borderRadius: 8,
              border: 0,
              background: "var(--amber)",
              color: "#fff",
              font: "600 12px/1 var(--ui)",
              whiteSpace: "nowrap",
            }}
          >
            Turn off
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18 }}>
        <div style={{ maxWidth: 470 }}>
          <div style={{ font: "700 16px/1.3 var(--ui)", color: "var(--text)", letterSpacing: "-.2px" }}>
            {scopeTitle}
          </div>
          <div style={{ font: "400 12.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 5 }}>{scopeBody}</div>
        </div>
        <div
          style={{
            flex: "none",
            padding: "11px 13px",
            borderRadius: 11,
            background: "var(--field)",
            border: "1px solid var(--border)",
            minWidth: 196,
          }}
        >
          <div style={{ font: "600 9.5px/1 var(--mono)", letterSpacing: ".6px", color: "var(--faint)", marginBottom: 8 }}>
            {frontLabel}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: runtime.scopeActive ? "var(--green)" : "var(--faint)",
                boxShadow: runtime.scopeActive ? "0 0 0 4px var(--greenSoft)" : "none",
              }}
            />
            <span style={{ font: "600 13px/1 var(--ui)", color: "var(--text)" }}>{frontName}</span>
          </div>
          <div style={{ font: "400 10.5px/1.3 var(--mono)", color: "var(--faint)", marginTop: 6 }}>{frontMeta}</div>
          <div
            style={{
              font: "400 10.5px/1.3 var(--mono)",
              color: "var(--faint)",
              marginTop: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={runtime.windowTitle}
          >
            window: {runtime.windowTitle ? `“${runtime.windowTitle}”` : "—"}
          </div>
          <div
            style={{
              font: "600 10.5px/1 var(--ui)",
              color: runtime.scopeActive ? "var(--green)" : "var(--faint)",
              marginTop: 7,
            }}
          >
            {runtime.scopeActive ? "● Armed — session window" : "○ Out of scope"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "700 10px/1 var(--mono)", letterSpacing: ".6px", color: "var(--faint)", marginBottom: 9 }}>
            {rulesTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {profile.matchRules.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 11px",
                  borderRadius: 9,
                  background: "var(--rowbg)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    font: "600 10px/1 var(--mono)",
                    color: "var(--accent)",
                    background: "var(--accSoft)",
                    padding: "3px 6px",
                    borderRadius: 5,
                    flex: "none",
                  }}
                >
                  {ruleLabel(r.kind, isHost)}
                </span>
                <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--text)" }}>
                  {r.value}
                </span>
                <button
                  onClick={() => backend.deleteMatchRule(profile.id, r.id)}
                  style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 14 }}
                >
                  ×
                </button>
              </div>
            ))}

            {/* add rule composer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 9px",
                borderRadius: 9,
                border: "1px dashed var(--border2)",
              }}
            >
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as RuleKind)}
                style={{
                  appearance: "none",
                  background: "var(--field)",
                  border: 0,
                  borderRadius: 6,
                  padding: "5px 8px",
                  font: "600 11px/1 var(--ui)",
                  color: "var(--text)",
                }}
              >
                {RULE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ruleLabel(k, isHost)}
                  </option>
                ))}
              </select>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
                placeholder={isHost ? "client name…" : "window title…"}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 12.5,
                  color: "var(--text)",
                }}
              />
              <button
                onClick={addRule}
                style={{
                  border: 0,
                  background: "var(--accSoft)",
                  color: "var(--accent)",
                  borderRadius: 6,
                  padding: "5px 10px",
                  font: "600 11px/1 var(--ui)",
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div style={{ width: 248, flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <ToggleCard
            title={uniLabel}
            sub="Universal fallback profile"
            on={config.universalFallback}
            onClick={() => backend.setUniversalFallback(!config.universalFallback)}
          />
          <ToggleCard
            title="Pin this profile"
            sub="Override auto-matching"
            on={pinned}
            onClick={() => backend.setPinned(pinned ? null : config.activeProfileId)}
          />
          <ToggleCard
            title="Test everywhere"
            sub="Ignore the Remote Desktop scope"
            on={config.ignoreScope}
            onClick={() => backend.setIgnoreScope(!config.ignoreScope)}
          />
          <div style={{ font: "400 10.5px/1.4 var(--ui)", color: "var(--faint)", padding: "0 2px" }}>{scopeNote}</div>
        </div>
      </div>
    </div>
  );
}

function ToggleCard({ title, sub, on, onClick }: { title: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 13px",
        borderRadius: 10,
        background: "var(--field)",
      }}
    >
      <div>
        <div style={{ font: "600 12.5px/1.2 var(--ui)", color: "var(--text)" }}>{title}</div>
        <div style={{ font: "400 10.5px/1.3 var(--ui)", color: "var(--sub)", marginTop: 3 }}>{sub}</div>
      </div>
      <SwitchSmall on={on} onClick={onClick} />
    </div>
  );
}
