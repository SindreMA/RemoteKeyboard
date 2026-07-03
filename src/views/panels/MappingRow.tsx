// One mapping row: [ Input ] → [ Output (keys|text) ] [delete].
//
// Input is recorded by default (click the cell and press the combo); the caret
// opens the combo picker as a fallback. Output is picker-first (click opens the
// picker) because you often need Windows keys a Mac keyboard can't type — the
// picker can still "Record keys instead".

import type { CSSProperties } from "react";
import type { Mapping, OutputMode, Platform } from "../../types";
import { Keycap, KeyCombo } from "../../components/Keycap";
import { ComboPicker } from "../../components/ComboPicker";
import { displayToken } from "../../lib/keys";

export interface MappingRowProps {
  m: Mapping;
  platform: Platform;
  recInput: boolean;
  recOutput: boolean;
  recPreview: string[];
  inputDropOpen: boolean;
  outputDropOpen: boolean;
  onRecInput: () => void;
  onRecOutput: () => void;
  onOpenInputDrop: () => void;
  onOpenOutputDrop: () => void;
  onApplyInput: (tokens: string[]) => void;
  onApplyOutput: (tokens: string[]) => void;
  onSetMode: (mode: OutputMode) => void;
  onText: (text: string) => void;
  onDelete: () => void;
}

const cellBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
  cursor: "pointer",
  padding: "6px 9px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--rowbg)",
  minHeight: 39,
};

const recBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 11px",
  borderRadius: 9,
  border: "1.5px solid var(--accent)",
  background: "var(--accSoft)",
  animation: "rkPulse 1.4s ease-in-out infinite",
  minHeight: 39,
};

const emptyBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  padding: "8px 11px",
  borderRadius: 9,
  border: "1px dashed var(--border2)",
  background: "transparent",
  minHeight: 39,
};

/** The pulsing recorder — shows held modifiers live as you press them. */
function Recording({
  preview,
  platform,
  esc = false,
}: {
  preview: string[];
  platform: Platform;
  esc?: boolean;
}) {
  const holdingMods = preview.length > 0;
  return (
    <div style={recBox}>
      {holdingMods ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {preview.map((t, i) => (
            <Keycap key={i} label={displayToken(t, platform)} accent />
          ))}
        </span>
      ) : (
        <span style={{ font: "600 12.5px/1 var(--ui)", color: "var(--accent)" }}>Press a key or combo</span>
      )}
      <span
        style={{
          width: 2,
          height: 14,
          background: "var(--accent)",
          borderRadius: 1,
          animation: "rkBlink 1s step-end infinite",
        }}
      />
      <div style={{ flex: 1 }} />
      <span style={{ font: "500 10px/1 var(--mono)", color: "var(--sub)" }}>
        {holdingMods ? "release to bind" : esc ? "Esc to cancel" : ""}
      </span>
    </div>
  );
}

function Caret({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-rk-caret
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 13, padding: "2px 3px" }}
    >
      ⌄
    </button>
  );
}

const segBase: CSSProperties = {
  flex: 1,
  textAlign: "center",
  padding: "4px 0",
  font: "600 10.5px/1 var(--ui)",
  borderRadius: 6,
  cursor: "pointer",
  border: 0,
};
const segActive: CSSProperties = {
  ...segBase,
  background: "var(--accent)",
  color: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,.22)",
};
const segIdle: CSSProperties = { ...segBase, background: "transparent", color: "var(--sub)" };

export function MappingRow(p: MappingRowProps) {
  const { m, platform } = p;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 26px 1.18fr 30px",
        gap: 10,
        alignItems: "center",
        padding: "6px 8px",
        borderRadius: 11,
      }}
    >
      {/* INPUT — record-first, picker fallback via caret */}
      <div style={{ position: "relative" }}>
        {p.recInput ? (
          <Recording preview={p.recPreview} platform={platform} esc />
        ) : m.input.length > 0 ? (
          <div onClick={p.onRecInput} style={cellBox}>
            <KeyCombo tokens={m.input} platform={platform} />
            <div style={{ flex: 1 }} />
            <Caret onClick={p.onOpenInputDrop} />
          </div>
        ) : (
          <div onClick={p.onRecInput} style={emptyBox}>
            <span style={{ font: "500 12.5px/1 var(--ui)", color: "var(--faint)" }}>Click to record…</span>
            <div style={{ flex: 1 }} />
            <Caret onClick={p.onOpenInputDrop} />
          </div>
        )}
        {p.inputDropOpen && (
          <ComboPicker value={m.input} platform={platform} onApply={p.onApplyInput} onRecord={p.onRecInput} />
        )}
      </div>

      <div style={{ textAlign: "center", fontSize: 16, color: "var(--faint)" }}>→</div>

      {/* OUTPUT — picker-first (keys), or literal text */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--field)", borderRadius: 8, width: 148 }}>
          <button style={m.outputMode === "keys" ? segActive : segIdle} onClick={() => p.onSetMode("keys")}>
            Send keys
          </button>
          <button style={m.outputMode === "text" ? segActive : segIdle} onClick={() => p.onSetMode("text")}>
            Send text
          </button>
        </div>

        <div style={{ position: "relative" }}>
          {p.recOutput ? (
            <Recording preview={p.recPreview} platform={platform} />
          ) : m.outputMode === "text" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "5px 6px 5px 11px",
                borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--rowbg)",
                minHeight: 39,
              }}
            >
              <input
                value={m.text}
                onChange={(e) => p.onText(e.target.value)}
                placeholder="type a literal character…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  color: "var(--text)",
                }}
              />
              <span style={{ font: "500 10px/1 var(--mono)", color: "var(--faint)" }}>sends</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 30,
                  height: 27,
                  padding: "0 8px",
                  borderRadius: 7,
                  background: "var(--accSoft)",
                  border: "1px solid var(--accent)",
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--accent)",
                  whiteSpace: "nowrap",
                }}
              >
                {m.text || "—"}
              </span>
            </div>
          ) : m.output.length > 0 ? (
            <div data-rk-caret onClick={p.onOpenOutputDrop} style={cellBox}>
              <KeyCombo tokens={m.output} platform={platform} />
              <div style={{ flex: 1 }} />
              <Caret onClick={p.onOpenOutputDrop} />
            </div>
          ) : (
            <div data-rk-caret onClick={p.onOpenOutputDrop} style={emptyBox}>
              <span style={{ font: "500 12.5px/1 var(--ui)", color: "var(--faint)" }}>Click to choose keys…</span>
              <div style={{ flex: 1 }} />
              <Caret onClick={p.onOpenOutputDrop} />
            </div>
          )}
          {p.outputDropOpen && (
            <ComboPicker value={m.output} platform={platform} onApply={p.onApplyOutput} onRecord={p.onRecOutput} />
          )}
        </div>
      </div>

      {/* DELETE */}
      <button
        onClick={p.onDelete}
        title="Delete mapping"
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          border: 0,
          background: "transparent",
          color: "var(--faint)",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        🗑
      </button>
    </div>
  );
}
