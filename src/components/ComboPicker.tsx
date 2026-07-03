// A dropdown that builds a full key combo: toggle modifiers, then pick a base
// key from the catalog. This is the reliable way to enter combos the webview
// can't record (system shortcuts) and keys a Mac keyboard doesn't have (the
// Windows Menu/Insert/PrintScreen/F13-F24 keys).

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Platform } from "../types";
import { isModifier } from "../types";
import {
  MODIFIER_ORDER,
  displayToken,
  modifierName,
  orderTokens,
  searchCatalog,
  searchModifiers,
} from "../lib/keys";

const panel: CSSProperties = {
  position: "absolute",
  zIndex: 30,
  top: "calc(100% + 4px)",
  left: 0,
  width: 236,
  background: "var(--pop)",
  backdropFilter: "blur(30px)",
  WebkitBackdropFilter: "blur(30px)",
  border: "1px solid var(--popBorder)",
  borderRadius: 11,
  boxShadow: "var(--shadow)",
  padding: 9,
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  textAlign: "left",
  border: 0,
  background: "transparent",
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "var(--mono)",
  fontSize: 12,
  color: "var(--text)",
};

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        font: "700 9px/1 var(--mono)",
        letterSpacing: ".6px",
        color: "var(--faint)",
        padding: "6px 8px 3px",
      }}
    >
      {children}
    </div>
  );
}

export function ComboPicker({
  value,
  platform,
  onApply,
  onRecord,
}: {
  value: string[];
  platform: Platform;
  onApply: (tokens: string[]) => void;
  onRecord?: () => void;
}) {
  const [mods, setMods] = useState<string[]>(value.filter(isModifier));
  const [query, setQuery] = useState("");

  const toggle = (m: string) =>
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const pick = (key: string) => onApply(orderTokens([...mods, key]));
  const modKeys = searchModifiers(query, platform);
  const keys = searchCatalog(query, platform);

  return (
    <div data-rk-dropdown style={panel}>
      {/* modifier toggles */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {MODIFIER_ORDER.map((m) => {
          const on = mods.includes(m);
          return (
            <button
              key={m}
              onClick={() => toggle(m)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: `1px solid ${on ? "var(--accent)" : "var(--border2)"}`,
                background: on ? "var(--accSoft)" : "transparent",
                color: on ? "var(--accent)" : "var(--sub)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {displayToken(m, platform)}
            </button>
          );
        })}
      </div>

      {/* Bind the modifiers on their own (no base key) — e.g. ⌘ alone. */}
      {mods.length > 0 && (
        <button
          onClick={() => onApply(orderTokens(mods))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            width: "100%",
            marginBottom: 8,
            padding: "6px 9px",
            borderRadius: 7,
            border: "1px solid var(--accent)",
            background: "var(--accSoft)",
            color: "var(--accent)",
            font: "600 12px/1 var(--ui)",
          }}
        >
          Use {mods.map((m) => displayToken(m, platform)).join(" ")}
          <span style={{ color: "var(--sub)", fontWeight: 400 }}>only (no key)</span>
        </button>
      )}

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search keys, then pick one…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "var(--field)",
          border: 0,
          outline: "none",
          borderRadius: 7,
          padding: "6px 9px",
          font: "400 12px/1 var(--ui)",
          color: "var(--text)",
          marginBottom: 6,
        }}
      />

      <div style={{ maxHeight: 168, overflow: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        {modKeys.length > 0 && <GroupLabel>MODIFIER KEYS</GroupLabel>}
        {modKeys.map((m) => (
          <button key={`mod-${m}`} onClick={() => pick(m)} style={itemStyle}>
            <span style={{ minWidth: 44, fontWeight: 600 }}>{displayToken(m, platform)}</span>
            <span style={{ color: "var(--faint)" }}>{modifierName(m, platform)}</span>
          </button>
        ))}
        {keys.length > 0 && <GroupLabel>KEYS</GroupLabel>}
        {keys.map((k) => (
          <button key={k} onClick={() => pick(k)} style={itemStyle}>
            <span style={{ minWidth: 44, fontWeight: 600 }}>{displayToken(k, platform)}</span>
            <span style={{ color: "var(--faint)" }}>{k}</span>
          </button>
        ))}
        {modKeys.length === 0 && keys.length === 0 && (
          <div style={{ padding: "8px", font: "400 12px/1 var(--ui)", color: "var(--faint)" }}>
            No keys match “{query}”.
          </div>
        )}
      </div>

      {onRecord && (
        <>
          <div style={{ height: 1, background: "var(--border)", margin: "8px -9px 0" }} />
          <button
            data-rk-caret
            onClick={onRecord}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              width: "100%",
              marginTop: 6,
              border: 0,
              background: "transparent",
              padding: "5px 6px",
              borderRadius: 6,
              font: "500 12px/1 var(--ui)",
              color: "var(--sub)",
            }}
          >
            ⌨︎ Record keys instead
          </button>
        </>
      )}
    </div>
  );
}
