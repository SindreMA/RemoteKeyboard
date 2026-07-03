// Surface 06 — first-run onboarding. Mode-aware, 4 steps: pick mode →
// permissions → starter rebinds → success.

import { useState } from "react";
import type { Snapshot } from "../types";
import { backend } from "../lib/api";
import { AppBadge } from "../components/Icon";

const LAST_STEP = 3;

export function Onboarding({ snap }: { snap: Snapshot }) {
  const { config, platform } = snap;
  const isWin = platform === "windows";
  const isHost = config.mode === "host";

  const [step, setStep] = useState(0);
  const [acc, setAcc] = useState(false);
  const [ext, setExt] = useState(false);

  const finish = () => backend.setOnboarded(true);
  const next = () => (step >= LAST_STEP ? finish() : setStep(step + 1));
  const back = () => setStep(Math.max(0, step - 1));

  const starterChips = isWin
    ? ["Win C → Ctrl C", "Win V → Ctrl V", "Win A → Ctrl A", "Win Z → Ctrl Z", "Win W → Ctrl W"]
    : ["⌘C → ⌃C", "⌘V → ⌃V", "⌘A → ⌃A", "⌘Z → ⌃Z", "⌘W → ⌃W"];

  return (
    <div style={{ height: "100%", background: "var(--win)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div data-tauri-drag-region style={{ height: 38, width: "100%", flex: "none" }} />
      <div style={{ width: 560, maxWidth: "92%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: "12px 34px 20px" }}>
          {step === 0 && (
            <div>
              <AppBadge size={40} />
              <div style={{ font: "700 22px/1.25 var(--ui)", color: "var(--text)", letterSpacing: "-.4px", marginTop: 16 }}>
                How are you installing?
              </div>
              <div style={{ font: "400 13.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 10, marginBottom: 20 }}>
                Same app, two roles. Pick where RemoteKeyboard runs — it auto-detects, but you can switch.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <ModeCard
                  icon="💻"
                  title="Client mode · on this Mac"
                  body="Remaps keys on the Mac before Remote Desktop sends them. Profiles match the remote host you connect to."
                  selected={!isHost}
                  onClick={() => backend.setMode("client")}
                />
                <ModeCard
                  icon="🖥️"
                  title="Host mode · on this Windows PC"
                  body="Runs inside the session and remaps keys for every device that connects. Profiles match the connecting client."
                  selected={isHost}
                  onClick={() => backend.setMode("host")}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ font: "700 22px/1.25 var(--ui)", color: "var(--text)", letterSpacing: "-.4px" }}>
                {isWin ? "One trust prompt" : "Two permissions to grant"}
              </div>
              <div style={{ font: "400 13.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 10, marginBottom: 20 }}>
                {isWin
                  ? "RemoteKeyboard rewrites keystrokes inside remote sessions. Windows needs:"
                  : "RemoteKeyboard reads and rewrites keystrokes only inside Remote Desktop. It needs:"}
              </div>
              {isWin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <PermCard
                    icon="🛡️"
                    title="Allow keyboard monitoring"
                    body="RemoteKeyboard reads and rewrites keystrokes to remap them. Some antivirus tools flag this as a keylogger — it isn't; nothing leaves your PC."
                    label={acc ? "Granted" : "Grant"}
                    onClick={() => setAcc(true)}
                  />
                  <PermCard
                    icon="⚙️"
                    title="Run as a background service"
                    body="Starts with the session so rebinds are ready the moment a client connects."
                    label={ext ? "Granted" : "Grant"}
                    onClick={() => setExt(true)}
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <PermCard
                    icon="♿"
                    title="Accessibility"
                    body="Lets the app observe and control keyboard input. macOS will ask you to allow RemoteKeyboard."
                    label={acc ? "Requested" : "Grant"}
                    onClick={() => {
                      setAcc(true);
                      backend.requestAccessibility();
                    }}
                  />
                  <PermCard
                    icon="⌨️"
                    title="Input Monitoring"
                    body="Lets the app read keystrokes to remap them. macOS will ask you to allow RemoteKeyboard."
                    label={ext ? "Requested" : "Grant"}
                    onClick={() => {
                      setExt(true);
                      backend.requestInputMonitoring();
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ font: "700 22px/1.25 var(--ui)", color: "var(--text)", letterSpacing: "-.4px" }}>
                Add starter rebinds
              </div>
              <div style={{ font: "400 13.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 10, marginBottom: 18 }}>
                Load a starter set — common Mac ⌘-shortcuts remapped to their Windows ⌃-equivalents. Edit or remove
                them anytime, or skip and start from scratch.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {starterChips.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 13px",
                      borderRadius: 9,
                      background: "var(--field)",
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                      color: "var(--text)",
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  backend.loadStarter(config.activeProfileId);
                  setStep(LAST_STEP);
                }}
                style={{
                  marginTop: 18,
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: 0,
                  background: "var(--accent)",
                  color: "#fff",
                  font: "600 13px/1 var(--ui)",
                }}
              >
                Load starter set
              </button>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center", paddingTop: 30 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--greenSoft)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 30,
                  color: "var(--green)",
                }}
              >
                ✓
              </div>
              <div style={{ font: "700 22px/1.25 var(--ui)", color: "var(--text)", letterSpacing: "-.4px", marginTop: 18 }}>
                You're set
              </div>
              <div style={{ font: "400 14px/1.6 var(--ui)", color: "var(--sub)", marginTop: 10 }}>
                Open Remote Desktop and start typing. RemoteKeyboard lives in your menubar.
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            flex: "none",
            padding: "14px 34px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  background: i <= step ? "var(--accent)" : "rgba(128,128,128,.35)",
                  transition: "width .2s",
                }}
              />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {step !== LAST_STEP && (
            <button
              onClick={finish}
              style={{ border: 0, background: "transparent", color: "var(--sub)", font: "500 12.5px/1 var(--ui)" }}
            >
              Skip setup
            </button>
          )}
          {step > 0 && step !== LAST_STEP && (
            <button
              onClick={back}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "1px solid var(--border2)",
                background: "var(--rowbg)",
                color: "var(--text)",
                font: "600 12.5px/1 var(--ui)",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            style={{
              padding: "8px 16px",
              borderRadius: 9,
              border: 0,
              background: "var(--accent)",
              color: "#fff",
              font: "600 12.5px/1 var(--ui)",
            }}
          >
            {step === LAST_STEP ? "Open RemoteKeyboard" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  body,
  selected,
  onClick,
}: {
  icon: string;
  title: string;
  body: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "15px 16px",
        borderRadius: 12,
        cursor: "pointer",
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accSoft)" : "var(--rowbg)",
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ font: "600 14px/1.2 var(--ui)", color: "var(--text)" }}>{title}</div>
        <div style={{ font: "400 11.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 4 }}>{body}</div>
      </div>
      <span style={{ fontSize: 15, color: selected ? "var(--accent)" : "var(--faint)" }}>{selected ? "●" : "○"}</span>
    </div>
  );
}

function PermCard({
  icon,
  title,
  body,
  label,
  onClick,
}: {
  icon: string;
  title: string;
  body: string;
  label: string;
  onClick: () => void;
}) {
  const granted = label === "Granted";
  return (
    <div
      style={{
        padding: "15px 16px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--rowbg)",
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ font: "600 14px/1.2 var(--ui)", color: "var(--text)" }}>{title}</div>
        <div style={{ font: "400 11.5px/1.5 var(--ui)", color: "var(--sub)", marginTop: 4 }}>{body}</div>
      </div>
      <button
        onClick={onClick}
        disabled={granted}
        style={{
          flex: "none",
          padding: "7px 14px",
          borderRadius: 8,
          border: 0,
          font: "600 12px/1 var(--ui)",
          color: "#fff",
          background: granted ? "var(--green)" : "var(--accent)",
          cursor: granted ? "default" : "pointer",
        }}
      >
        {label}
      </button>
    </div>
  );
}
