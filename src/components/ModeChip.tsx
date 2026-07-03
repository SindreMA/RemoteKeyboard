// The persistent mode indicator: `💻 Client mode · this Mac` / `🖥️ Host mode · this PC`.

import type { Mode } from "../types";

export function modeIcon(mode: Mode): string {
  return mode === "host" ? "🖥️" : "💻";
}
export function modeName(mode: Mode): string {
  return mode === "host" ? "Host mode" : "Client mode";
}
export function modeWhere(mode: Mode): string {
  return mode === "host" ? "this PC" : "this Mac";
}

export function ModeChip({
  mode,
  where = false,
  size = "md",
}: {
  mode: Mode;
  where?: boolean;
  size?: "sm" | "md";
}) {
  const fs = size === "sm" ? 11 : 11.5;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 9px",
          borderRadius: 7,
          background: "var(--accSoft)",
        }}
      >
        <span style={{ fontSize: size === "sm" ? 11 : 12 }}>{modeIcon(mode)}</span>
        <span style={{ font: `600 ${fs}px/1 var(--ui)`, color: "var(--accent)" }}>
          {modeName(mode)}
        </span>
      </span>
      {where && (
        <span style={{ font: "400 11px/1 var(--mono)", color: "var(--sub)" }}>
          · {modeWhere(mode)}
        </span>
      )}
    </span>
  );
}
