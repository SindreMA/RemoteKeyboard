// Surface 03 (right pane) — the core record-input → choose-output editor.

import { useEffect, useState } from "react";
import type { Mapping, OutputMode, Profile, Snapshot } from "../../types";
import { backend } from "../../lib/api";
import { captureTokens, orderTokens } from "../../lib/keys";
import { MappingRow } from "./MappingRow";
import { ModeChip } from "../../components/ModeChip";
import { KeyboardGlyph } from "../../components/Icon";

interface Field {
  id: string;
  field: "input" | "output";
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function MappingsPanel({ snap, profile }: { snap: Snapshot; profile: Profile }) {
  const { platform } = snap;
  const isHost = snap.config.mode === "host";

  const [rec, setRec] = useState<Field | null>(null);
  const [recPreview, setRecPreview] = useState<string[]>([]);
  const [dropFor, setDropFor] = useState<Field | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(profile.name);

  useEffect(() => setName(profile.name), [profile.id]); // resync on profile switch

  // Capture the next physical key/combo into the recording field. A full combo
  // (with a base key) commits on keydown; a bare modifier — or modifier combo —
  // commits on release, so you can bind ⌘ (or ⌘⇧) on its own.
  useEffect(() => {
    if (!rec) return;
    let peak: string[] = []; // largest modifier set held this gesture
    let done = false;
    const stop = () => {
      setRec(null);
      setRecPreview([]);
    };
    const heldMods = (e: KeyboardEvent): string[] => {
      const h: string[] = [];
      if (e.metaKey) h.push("Meta");
      if (e.ctrlKey) h.push("Control");
      if (e.altKey) h.push(e.code === "AltRight" ? "AltGr" : "Alt");
      if (e.shiftKey) h.push("Shift");
      return h;
    };
    const commit = (tokens: string[]) => {
      if (done || tokens.length === 0) return;
      done = true;
      const m = profile.mappings.find((x) => x.id === rec.id);
      if (m) {
        const updated: Mapping =
          rec.field === "input"
            ? { ...m, input: tokens }
            : { ...m, output: tokens, outputMode: "keys" };
        backend.updateMapping(profile.id, updated);
      }
      stop();
    };
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing into a real input; drop out of recording instead.
      if (isEditable(document.activeElement)) return stop();
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return stop();

      const held = heldMods(e);
      if (held.length > peak.length) peak = held;
      const tokens = captureTokens(e, platform);
      if (!tokens) {
        setRecPreview(held); // bare modifier — wait for a key or a release
        return;
      }
      commit(tokens); // combo with a base key
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (done) return;
      const remaining = heldMods(e);
      // All modifiers released with none ever paired to a base key → bind the
      // modifier(s) alone.
      if (remaining.length === 0 && peak.length > 0) commit(orderTokens(peak));
      else setRecPreview(remaining);
    };
    const onBlur = () => stop(); // alt-tab away cancels recording
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [rec, profile, platform]);

  // Dismiss the combo picker on any click outside it (or its caret / opener).
  useEffect(() => {
    if (!dropFor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-rk-dropdown]") || t?.closest("[data-rk-caret]")) return;
      setDropFor(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [dropFor]);

  const update = (m: Mapping, patch: Partial<Mapping>) =>
    backend.updateMapping(profile.id, { ...m, ...patch });

  const startRec = (id: string, field: "input" | "output") => {
    setDropFor(null);
    setRecPreview([]);
    // Drop focus from any text field so the capture listener isn't bypassed.
    (document.activeElement as HTMLElement | null)?.blur();
    setRec({ id, field });
  };

  const toggleDrop = (id: string, field: "input" | "output") => {
    setRec(null);
    setDropFor((cur) => (cur?.id === id && cur.field === field ? null : { id, field }));
  };

  const q = search.trim().toLowerCase();
  const list = q
    ? profile.mappings.filter((m) =>
        `${m.input.join(" ")} ${m.output.join(" ")} ${m.text}`.toLowerCase().includes(q),
      )
    : profile.mappings;

  const scopeChip = isHost ? "Active in remote sessions" : "Active in Remote Desktop";

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* header */}
      <div
        style={{
          padding: "12px 16px 11px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              backend.renameProfile(profile.id, e.target.value);
            }}
            disabled={profile.universal}
            style={{
              font: "700 17px/1.2 var(--ui)",
              color: "var(--text)",
              background: "transparent",
              border: 0,
              outline: "none",
              width: 150,
              letterSpacing: "-.3px",
              padding: "2px 4px",
              borderRadius: 6,
            }}
          />
          <ModeChip mode={snap.config.mode} size="sm" />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 9px",
              borderRadius: 20,
              background: "var(--greenSoft)",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)" }} />
            <span style={{ font: "600 10.5px/1 var(--ui)", color: "var(--green)" }}>{scopeChip}</span>
          </div>
          <div style={{ flex: 1 }} />
          <HeaderButton onClick={() => backend.importConfig()}>Import</HeaderButton>
          <HeaderButton onClick={() => backend.exportConfig()}>Export</HeaderButton>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 11px",
            background: "var(--field)",
            borderRadius: 9,
          }}
        >
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter mappings…"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: "none",
              font: "400 13px/1 var(--ui)",
              color: "var(--text)",
            }}
          />
        </div>
      </div>

      {/* table */}
      <div style={{ flex: 1, overflow: "auto", padding: "10px 14px 14px", minHeight: 0 }}>
        {profile.mappings.length === 0 ? (
          <EmptyState onStarter={() => backend.loadStarter(profile.id)} onAdd={() => backend.addMapping(profile.id)} />
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 26px 1.18fr 30px",
                gap: 10,
                padding: "0 8px 8px",
              }}
            >
              <div style={{ font: "700 10px/1 var(--mono)", letterSpacing: ".6px", color: "var(--faint)" }}>
                WHEN I PRESS
              </div>
              <div />
              <div style={{ font: "700 10px/1 var(--mono)", letterSpacing: ".6px", color: "var(--faint)" }}>
                SEND INSTEAD
              </div>
              <div />
            </div>

            {list.map((m) => (
              <MappingRow
                key={m.id}
                m={m}
                platform={platform}
                recInput={rec?.id === m.id && rec.field === "input"}
                recOutput={rec?.id === m.id && rec.field === "output"}
                recPreview={recPreview}
                inputDropOpen={dropFor?.id === m.id && dropFor.field === "input"}
                outputDropOpen={dropFor?.id === m.id && dropFor.field === "output"}
                onRecInput={() => startRec(m.id, "input")}
                onRecOutput={() => startRec(m.id, "output")}
                onOpenInputDrop={() => toggleDrop(m.id, "input")}
                onOpenOutputDrop={() => toggleDrop(m.id, "output")}
                onApplyInput={(tokens) => {
                  update(m, { input: tokens });
                  setDropFor(null);
                }}
                onApplyOutput={(tokens) => {
                  update(m, { output: tokens, outputMode: "keys" });
                  setDropFor(null);
                }}
                onSetMode={(mode: OutputMode) => update(m, { outputMode: mode })}
                onText={(text) => update(m, { text })}
                onDelete={() => backend.deleteMapping(profile.id, m.id)}
              />
            ))}

            {list.length === 0 && (
              <div style={{ padding: "20px 12px", font: "400 13px/1.5 var(--ui)", color: "var(--faint)" }}>
                No mappings match “{search}”.
              </div>
            )}

            <button
              onClick={() => backend.addMapping(profile.id)}
              style={{
                margin: "10px 8px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--accent)",
                background: "var(--accSoft)",
                font: "600 13px/1 var(--ui)",
                color: "var(--accent)",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add mapping
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function HeaderButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 11px",
        borderRadius: 8,
        border: "1px solid var(--border2)",
        background: "var(--rowbg)",
        font: "600 12px/1 var(--ui)",
        color: "var(--text)",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ onStarter, onAdd }: { onStarter: () => void; onAdd: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "56px 24px",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: "var(--accSoft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <KeyboardGlyph size={32} color="var(--accent)" />
      </div>
      <div style={{ font: "700 16px/1.3 var(--ui)", color: "var(--text)" }}>No mappings yet</div>
      <div style={{ font: "400 13px/1.5 var(--ui)", color: "var(--sub)", maxWidth: 340 }}>
        Add one to remap a key or combo — or load a starter set of common Mac ⌘-shortcut →
        Windows ⌃-shortcut rebinds.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          onClick={onStarter}
          style={{
            padding: "9px 15px",
            borderRadius: 10,
            border: 0,
            background: "var(--accent)",
            color: "#fff",
            font: "600 13px/1 var(--ui)",
          }}
        >
          Load starter rebinds
        </button>
        <button
          onClick={onAdd}
          style={{
            padding: "9px 15px",
            borderRadius: 10,
            border: "1px solid var(--border2)",
            background: "var(--rowbg)",
            color: "var(--text)",
            font: "600 13px/1 var(--ui)",
          }}
        >
          Add mapping
        </button>
      </div>
    </div>
  );
}
