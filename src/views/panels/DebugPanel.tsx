// Surface 05 — Debug: the non-intrusive HUD preview, the secure-input pause
// banner, and the event log.

import type { Snapshot } from "../../types";
import { backend } from "../../lib/api";
import { SwitchSmall } from "../../components/Toggle";
import { KeyCombo } from "../../components/Keycap";

export function DebugPanel({ snap }: { snap: Snapshot }) {
  const { config, runtime, platform } = snap;
  const isHost = config.mode === "host";
  const win = platform === "windows";

  const hudCtx = isHost
    ? "Remote session — SINDRE-MAC · connected"
    : "Remote Desktop — WORK-PC · session active";
  const hudFrom = win ? "Win+W" : "⌘W";
  const hudTo = win ? "Ctrl+W" : "⌃W";
  const secureText = isHost
    ? "Rebinds pause on the secure desktop (sign-in / UAC). Keystrokes pass through untouched."
    : "Rebinds pause under Secure Event Input (password fields). Keystrokes pass through untouched.";

  const resultStyle = (r: string) =>
    r === "sent"
      ? { c: "var(--green)", bg: "var(--greenSoft)" }
      : r === "secure"
      ? { c: "var(--amber)", bg: "var(--amberSoft)" }
      : { c: "var(--faint)", bg: "var(--field)" };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", minHeight: 0, display: "flex", flexDirection: "column", gap: 13 }}>
      {/* debug toggle + engine status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 14px",
          borderRadius: "var(--winR)",
          background: "var(--rowbg)",
          border: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 15 }}>🐞</span>
        <div style={{ flex: 1 }}>
          <div style={{ font: "600 13px/1.2 var(--ui)", color: "var(--text)" }}>Debug mode</div>
          <div style={{ font: "400 11px/1.3 var(--ui)", color: "var(--sub)", marginTop: 2 }}>
            {runtime.engine.detail}
          </div>
        </div>
        <SwitchSmall on={config.debug} onClick={() => backend.setDebug(!config.debug)} />
      </div>

      {/* HUD preview */}
      <div
        style={{
          borderRadius: "var(--winR)",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "#15161a",
          position: "relative",
          height: 150,
          backgroundImage:
            "repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 12px,rgba(255,255,255,0) 12px 24px)",
        }}
      >
        <div style={{ position: "absolute", top: 11, left: 14, font: "600 10.5px/1 var(--mono)", color: "rgba(255,255,255,.42)" }}>
          {hudCtx}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "54%",
            transform: "translate(-50%,-50%)",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 13px",
            borderRadius: 11,
            background: "rgba(28,28,32,.72)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,.12)",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 8px",
              borderRadius: 6,
              background: "rgba(255,255,255,.1)",
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {hudFrom}
          </span>
          <span style={{ color: "#7fe39a", fontSize: 14 }}>→</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 8px",
              borderRadius: 6,
              background: "rgba(127,227,154,.18)",
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#9af0b3",
            }}
          >
            {hudTo}
          </span>
        </div>
        <div style={{ position: "absolute", bottom: 10, left: 14, font: "400 9.5px/1 var(--mono)", color: "rgba(255,255,255,.32)" }}>
          non-intrusive HUD · rapid events coalesced
        </div>
      </div>

      {/* secure-input banner */}
      <div
        style={{
          padding: "10px 13px",
          borderRadius: 10,
          background: "var(--amberSoft)",
          border: "1px solid var(--amber)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 14 }}>⚠️</span>
        <span style={{ font: "600 12.5px/1.3 var(--ui)", color: "var(--amber)" }}>{secureText}</span>
      </div>

      {/* event log */}
      <div
        style={{
          borderRadius: "var(--winR)",
          background: "var(--win)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "90px 100px 1fr 86px",
            gap: 10,
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            font: "700 9.5px/1 var(--mono)",
            letterSpacing: ".5px",
            color: "var(--faint)",
          }}
        >
          <div>TIME</div>
          <div>PROFILE</div>
          <div>INPUT → OUTPUT</div>
          <div style={{ textAlign: "right" }}>RESULT</div>
        </div>

        {runtime.log.length === 0 ? (
          <div style={{ padding: "26px 16px", textAlign: "center", font: "400 12.5px/1.5 var(--ui)", color: "var(--faint)" }}>
            No rebinds logged yet.
            {!config.debug && " Turn on Debug mode to record fired rebinds here."}
          </div>
        ) : (
          runtime.log.map((e) => {
            const rs = resultStyle(e.result);
            return (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 100px 1fr 86px",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--sub)" }}>{e.time}</div>
                <div style={{ font: "500 11.5px/1 var(--ui)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.profile}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <KeyCombo tokens={e.from} platform={platform} small />
                  <span style={{ color: "var(--faint)" }}>→</span>
                  {e.toText ? (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                      {e.toText}
                    </span>
                  ) : (
                    <KeyCombo tokens={e.to} platform={platform} small />
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ font: "600 10px/1 var(--mono)", color: rs.c, background: rs.bg, padding: "3px 7px", borderRadius: 5 }}>
                    {e.result}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
