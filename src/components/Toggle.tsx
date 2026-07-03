// Two switch sizes, ported from the design's `sw` / `swSmall` helpers.

import type { CSSProperties } from "react";

const OFF = "rgba(128,128,128,.35)";

function track(on: boolean, color: string, w: number, h: number): CSSProperties {
  return {
    width: w,
    height: h,
    borderRadius: h / 2,
    cursor: "pointer",
    transition: "background .18s",
    position: "relative",
    flex: "none",
    background: on ? color : OFF,
  };
}

function knob(on: boolean, size: number, travel: number): CSSProperties {
  return {
    position: "absolute",
    top: 2,
    left: 2,
    width: size,
    height: size,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,.3)",
    transition: "transform .18s",
    transform: `translateX(${on ? travel : 0}px)`,
  };
}

/** Large switch — green when on, amber when off-but-should-be-on (danger). */
export function Switch({
  on,
  danger = false,
  onClick,
}: {
  on: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const color = danger ? "var(--amber)" : "var(--green)";
  return (
    <div onClick={onClick} style={track(on, color, 40, 24)}>
      <div style={knob(on, 20, 16)} />
    </div>
  );
}

/** Small accent switch — used for pin / debug / universal toggles. */
export function SwitchSmall({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={track(on, "var(--accent)", 34, 20)}>
      <div style={knob(on, 16, 14)} />
    </div>
  );
}
