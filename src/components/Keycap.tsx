// The signature element: a keycap chip that renders one canonical token as the
// right glyph for the platform. KeyCombo renders a token list.

import type { CSSProperties } from "react";
import type { Platform } from "../types";
import { displayToken } from "../lib/keys";

export function Keycap({
  label,
  small = false,
  accent = false,
}: {
  label: string;
  small?: boolean;
  accent?: boolean;
}) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: small ? 20 : 24,
    height: small ? 22 : 25,
    padding: small ? "0 6px" : "0 8px",
    borderRadius: "var(--capR)",
    background: accent ? "var(--accSoft)" : "var(--cap)",
    border: `1px solid ${accent ? "var(--accent)" : "var(--capBorder)"}`,
    boxShadow: accent ? "none" : "var(--capShadow)",
    fontFamily: "var(--mono)",
    fontSize: small ? 11.5 : 12,
    fontWeight: 600,
    color: accent ? "var(--accent)" : "var(--capText)",
    whiteSpace: "nowrap",
  };
  return <span style={style}>{label}</span>;
}

export function KeyCombo({
  tokens,
  platform,
  small = false,
  gap = 5,
}: {
  tokens: string[];
  platform: Platform;
  small?: boolean;
  gap?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {tokens.map((t, i) => (
        <Keycap key={i} label={displayToken(t, platform)} small={small} />
      ))}
    </span>
  );
}
