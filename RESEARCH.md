# RemoteKeyboard — Research Findings

> Output of a multi-agent research sweep (73 agents, ~4.4M tokens, 879 tool calls,
> 356 unique sources). Each load-bearing claim was adversarially verified by 3
> independent skeptics instructed to *refute* it. This file is the evidence base;
> see `ARCHITECTURE.md` for the decision, `TECH_STACK.md` for the stack, and
> `PLAN.md` for the roadmap.

---

## TL;DR of what the research found

1. **Root cause is the RDP keyboard transmission model, not "Mac vs Windows keys."**
   Microsoft Remote Desktop / the new **"Windows App"** sends keystrokes in one of two
   modes: **Scancode** (default — sends the *physical key position*, and the **Windows
   host** re-derives the character from *its* layout) or **Unicode** (the Mac resolves
   the character locally and sends a finished codepoint). Norwegian breaks in Scancode
   mode because the Mac's AltGr-layer symbols (`| \ @ $ { } [ ]`) live on different
   physical keys than Windows expects, the Mac only maps **right-Option → AltGr** (so the
   habitual **left-Option** arrives as plain Alt and never reaches the AltGr layer), the
   ISO `<>|` key is ambiguous, dead keys (`^ ~ \` ¨`) fight, and if the host session
   isn't actually running the Norwegian layout even `æ ø å` break.

2. **The single biggest free fix already exists: switch Keyboard Mode to Unicode**
   (`Connections > Keyboard Mode > Unicode`, or **Ctrl+Cmd+U**). Microsoft documents
   this. It fixes *most* plain Nordic typing for zero software — **but** backslash
   often stays broken even in Unicode mode, and Unicode mode **breaks Ctrl/modifier
   combos** (so you can't get correct Nordic typing *and* working shortcut rebinds from
   the one global toggle). That residual gap is what justifies building a tool.

3. **Client-side (Mac) interception works — but only with a Karabiner-style DriverKit
   virtual-HID driver, NOT a plain `CGEventTap`.** CGEventTap-based remappers
   (Hammerspoon, BetterTouchTool, Keyboard Maestro) **demonstrably misfire inside MS
   Remote Desktop**: the original key leaks through, injected modifiers get stripped
   (Ctrl+W arrives as "W"), and Secure Event Input silently disables the tap in password
   fields. A DriverKit virtual-HID driver injects *below* the WindowServer and below the
   client's read point, so the client treats it as genuine hardware.

4. **You don't have to build that driver.** Karabiner's
   `pqrs-org/Karabiner-DriverKit-VirtualHIDDevice` is **public-domain (Unlicense),
   already notarized**, and explicitly allows third-party clients over its root daemon
   socket (the `kanata` project does exactly this). Reusing it removes the single hardest,
   riskiest component *and* sidesteps Apple's discretionary DriverKit/HID entitlement
   approval.

5. **Server-side (Windows) interception is confirmed working but architecturally
   inferior** for this user. A `WH_KEYBOARD_LL` hook *inside the RDP session* sees
   RDP-injected keys and can suppress/replace them (proven by `RdpKbdFix`, PowerToys,
   AutoHotkey). Its problems: it **is** the textbook keylogger signature that corporate
   EDR (Defender for Endpoint/CrowdStrike) flags and WDAC/AppLocker blocks; it needs host
   admin; it can't reliably identify the connecting client (hardware-id is always 0); and
   it must special-case Unicode-mode `VK_PACKET` keys. Keep it as an optional later path.

6. **No existing product fills this niche** ("record input combo → pick output, RDP-window
   only, Nordic-aware, per-connection profiles"). The building blocks exist (raw Karabiner +
   the client's mode toggle); the integrated tool does not.

---

## A. Root cause — why Mac→Windows RDP keys break

### A1. RDP keyboard modes (Scancode vs Unicode) — `confidence: high`
The macOS RDP client (legacy *Microsoft Remote Desktop*, now the *Windows App*) transmits
input in exactly two modes:
- **Scancode** (default): sends 8-bit physical key positions; the **remote Windows session
  layout** translates position → character. Microsoft's own example: scancode 31 yields
  "A" on US but "Q" on French. *This is the root of Nordic breakage.*
- **Unicode**: sends each resolved **character**; the local Mac locale does the translation
  before transmission. Required for IMEs. Bypasses the remote-layout mismatch.
- **Switch on macOS:** `Connections > Keyboard Mode > {Scancode|Unicode}`. Shortcuts:
  Scancode = **Ctrl+Cmd+K**, Unicode = **Ctrl+Cmd+U**.
- **Official "use Scancode" cases:** non-printable keys, single-key app shortcuts,
  Hyper-V/BitLocker entry, VMware console, **all Qt apps** (R Studio, QtCreator). Unicode
  mode breaks these.
- The Mac's **Option key right of space = Windows AltGr**. The "Use Mac shortcuts" pref
  makes the client intercept Cmd+C/X/V/A/Z/F and Cmd+W *itself*, before your tool sees them.
- Sources: <https://learn.microsoft.com/en-us/windows-app/input-keyboard-mouse-touch-pen>,
  <https://learn.microsoft.com/en-us/previous-versions/remote-desktop-client/client-features-macos>,
  MS-RDPBCGR keyboard event spec.

### A2. Windows App vs legacy client — `high`
The 2024 "Windows App" rebrand **inherits the legacy keyboard engine almost unchanged** —
same right-Option=AltGr mapping, same Scancode/Unicode toggle, **same Nordic/AltGr
breakage**. New AltGr/Option regressions are still being reported (MS Q&A 2075275, Sep–Nov
2024). The legacy macOS client is no longer downloadable.

### A3. Norwegian/Nordic AltGr breakage mechanism — `high`
Concretely, Nordic typing breaks because: (1) macOS and Windows ship incompatible
"Norwegian" layouts (Windows KBDNO reaches the third layer via AltGr on different physical
keys); (2) only **right-Option** maps to AltGr, so habitual **left-Option** never triggers
the AltGr layer → `| \ @ $ { } [ ]` come out wrong/empty; (3) the ISO `<>|` key (scancode
`0x56`) is emitted/recognized inconsistently; (4) dead keys are stateful and the compose
state machines fight; (5) if the host session isn't running KBDNO it falls back to en-US and
even `æ ø å` break.

### A4. RDP keyboard protocol (MS-RDPBCGR) — `high`
Scancode mode → `TS_KEYBOARD_EVENT`/`TS_FP_KEYBOARD_EVENT` (8-bit scancode + flags:
`KBDFLAGS_EXTENDED 0x0100`, `KBDFLAGS_RELEASE 0x8000`, etc.). Unicode mode →
`TS_UNICODE_KEYBOARD_EVENT` (a codepoint). The server "accepts a scancode value and
translates it into the correct character depending on the language locale and keyboard
layout used in the session" — translation is **server-side**, which is exactly why the
local Mac layout is irrelevant in scancode mode. The protocol exposes **no per-key remap
hook**, so a fix must live before the client encodes (Mac/HID side) or after RDP injects
(host-side hook).

### A5–A7. Layout interaction & key-vs-char — `high`
The session uses the client-reported HKL by default, but the Mac only reports a *best-match*
locale; Mac-specific layouts fall back to the closest language. A client-side 1:1
key/scancode rebind reliably fixes "wrong character" (layout disagreement) and "key sends
nothing." Dead keys and the AltGr *layer* are **not** expressible as a naive 1:1 swap (see
GAP-G7).

---

## B. Client-side (macOS) feasibility

| # | Finding | Conf |
|---|---------|------|
| **B1** | `CGEventTap` works for normal Cocoa apps but **does not reliably work against MS Remote Desktop** — the client reads at the raw-HID (IOKit/IOHIDManager) layer, parallel to and below the tap. | high |
| **B2** | A rebinder needs the **Accessibility** permission (implies Input Monitoring) for a `.defaultTap` + `CGEventPost`. One-time grant; TCC grant is bound to the code-signing identity. | high |
| **B3** | CGEventTap remapping is observed to fail inside MS RDP; **Secure Event Input outright disables taps**. A **Karabiner-style DriverKit virtual-HID driver sits beneath this** and keeps working. | medium |
| **B4** | **Karabiner-Elements `complex_modifications` (JSON, zero custom code) reliably remap Mac→Windows RDP keys** and can scope to the RDP client app, because they inject at the DriverKit virtual-HID level. Community config exists: `varp/karabiner-rdp`. Scopes per-**app**, not per-connection. | high |
| **B5** | Detect "RDP frontmost" via `NSWorkspace.frontmostApplication.bundleIdentifier` ≈ `com.microsoft.rdc.macos`. Identify *which host* via the focused window's **AX title** (`kAXFocusedWindowAttribute`/`kAXTitleAttribute`) — avoids the Screen Recording permission that `CGWindowName` needs. | high |
| **B6** | Re-inject via `CGEventCreateKeyboardEvent` + `CGEventSetFlags` + `CGEventPost(kCGHIDEventTap)` (with a `kCGEventSourceStateHIDSystemState` source). Works for the frontmost app. *(Relevant only if you ever use the CGEventTap path — which we are not, for RDP.)* | high |
| **B7** | A client-side fix **can** work, but the real lever is the transmission representation (Unicode vs scancode + the AltGr modifier), not "remap one local key to another." | high |

**Verdict:** client-side is the right place to fix it — **via the DriverKit virtual-HID path, not CGEventTap.** Primary source for the CGEventTap failure: Hammerspoon issue #1056 (maintainer: *"Karabiner would definitely work, because that's intercepting/modifying input events in the kernel, before they get up to userspace"*).

---

## C. Server-side (Windows) feasibility

| # | Finding | Conf |
|---|---------|------|
| **C1** | A `WH_KEYBOARD_LL` hook **inside the interactive RDP session** sees RDP-injected keys and can suppress (return nonzero) + replace (`SendInput`) them, because RDP injects at the win32k layer where the LL hook lives. A kernel keyboard *filter driver* does NOT see RDP input. | high |
| **C2** | Detect remote session via `GetSystemMetrics(SM_REMOTESESSION)`. Client info via `WTSQuerySessionInformation` — but **only `WTSClientName` is dependable**; hardware-id is always 0, address is client-reported/NAT-broken. | high |
| **C3** | Must run **in-session** (Session 0 services can't touch input). Pattern: a SYSTEM controller service watches `SERVICE_CONTROL_SESSIONCHANGE` and launches an agent into each interactive session via `WTSQueryUserToken`/`CreateProcessAsUser`. | high |
| **C4** | AutoHotkey on the host can remap RDP keys **only in Scancode mode**; in Unicode mode (the mode Nordic users enable) keys arrive as `VK_PACKET` and AHK hotkeys can't intercept them. | medium |
| **C5** | PowerToys Keyboard Manager is a `WH_KEYBOARD_LL` tool: **only works installed on the remote host**, and even there has documented AltGr/Ctrl+Alt breakage that hits exactly the Nordic case. | high |
| **C6** | In Scancode mode the server gets an 8-bit position scancode and applies the **server** layout. A server-side hook *can* reconstruct intent. | high |
| **C7** | Ordinary keys/AltGr chars inject fine via `SendInput`; **Ctrl+Alt+Del (SAS) needs `SendSAS`**, and **UIPI blocks injection into higher-integrity windows**. Hard OS limits. | high |

**Verdict:** confirmed working (the only interception claim graded confirmed/confirmed/confirmed), but bounded to *"your own / IT-blessed hosts."* `RdpKbdFix` (`github.com/4d61726b/RdpKbdFix`) is a direct precedent — it installs an LL hook and explicitly handles the Unicode `VK_PACKET` path.

---

## D. Framework / language for the tool

| Stack | Tray UI | Can it **suppress** keys for RDP? | Verdict |
|-------|--------|-----------------------------------|---------|
| **Native Swift (macOS) + DriverKit virtual-HID** | `NSStatusItem` | **Yes** — HID-level, the only path proven to reach RDP | **Recommended engine** |
| **Tauri v2 (Rust)** | Good, ~3–15 MB | Only via `rdev unstable_grab` = **CGEventTap on macOS** (the disqualified mechanism) | OK as shell only; must NOT use rdev grab for the RDP path |
| **Electron** | First-class | `uiohook-napi` is **observe+inject only — cannot suppress**; ~150–200 MB | Rejected |
| **.NET 8/9 + Avalonia** | `NativeMenu` | `SharpHook`/libuiohook `SuppressEvent` = **CGEventTap on macOS** | OK for the *Windows companion*; wrong for the Mac engine |
| **Flutter** | Community plugins | Native plugin only; Dart-FFI thread/return issue | Rejected for the engine |
| **Go (Wails/Fyne)** | Good | Mainstream bindings are **listen-only**; suppression = custom cgo | Rejected for the engine |

- **D7/D8:** True suppression on macOS requires a **CGEventTap (fails for RDP) OR an
  IOKit device-seize driver (Karabiner-style — works)**. On Windows, `WH_KEYBOARD_LL`
  (return nonzero) or the Interception kernel driver.
- **V6 (adversarial):** the libraries that *can* suppress cross-platform (`rdev`,
  `SharpHook`) **all use CGEventTap on macOS** — so a cross-platform suppress library
  inherits the exact failure the tool exists to avoid. **A native macOS engine is
  non-negotiable.**

---

## E. Mapping engine & UX

- **E1 — data model:** key triggers on **layout-independent physical identity (HID usage
  id + page)**, like Karabiner — because key labels are wrong on ISO/Nordic boards. Output
  = tagged union `{ keys+modifiers | unicode-text | command }`. Model AltGr explicitly as
  **Right-Alt**; never fold into Left-Ctrl (PowerToys' documented bug).
- **E2 — record/select UX:** a **two-cell row editor** ("input" / "output"), each cell
  offering a **live keyboard-capture popover** (Esc=cancel, Enter=confirm) **and** a
  searchable dropdown fallback. **PowerToys Keyboard Manager is the closest model to copy**;
  Karabiner is dropdown-only.
- **E3 — config:** a single **versioned JSON file** (`schemaVersion` int + `profiles[]`,
  each with match-criteria + from/to rules). The file *is* the import/export artifact;
  export a single version-wrapped profile for sharing.
- **E4 — combo reliability:** (1) tag/recognize your own injected events and ignore them;
  (2) suppress every constituent **down AND up** of the input chord; (3) manage logical
  modifier state so none stays stuck; reset on focus change / profile switch.
- **E5 — debug/notify:** avoid OS notifications (they spam). Use opt-in **debug mode**
  driving a tiny **non-activating HUD** near the cursor + a brief menubar-icon flash
  (mirrors Karabiner `set_notification_message` + an event log window).

---

## F. Existing solutions / build-vs-configure

- **F1:** No polished product is purpose-built for this. Real gap.
- **F2:** Switching to **Unicode mode** fixes most Nordic plain typing for free, but
  **backslash persists broken** and **Unicode mode breaks Ctrl-combos** — documented gaps.
- **F3:** Switching client (Jump Desktop, Royal TSX, FreeRDP) can fix the *typing* half,
  but the real lever is the **Unicode keyboard-mode setting**, not the client brand. Jump
  Desktop has the strongest international-keyboard handling.

---

## G. Distribution / security / gaps

- **G1 (macOS):** ship **Developer ID-signed + notarized**, hardened-runtime,
  **non-sandboxed**; needs **Accessibility** (App Store impossible). Karabiner/BTT model.
- **G2 (Windows):** **Authenticode SHA-256 + timestamp**; expect SmartScreen warnings until
  reputation builds and **real keylogger false-positive risk** (`WH_KEYBOARD_LL` is the
  canonical keylogger API). Pre-submit to Microsoft WDSI; document EDR exclusions.
- **G3 (updates):** Sparkle for native Swift (Karabiner uses it); Tauri updater; Velopack
  cross-platform.
- **GAP-G1:** No published version-pinned CGEventTap-vs-2025-Windows-App test, but evidence
  converges: CGEventTap remaps fail in RDP, DriverKit remaps are the established fix.
- **GAP-G2:** Depending on Karabiner's **Unlicense, already-notarized** DriverKit driver is
  a well-trodden path (kanata does it) — avoids Apple's hard-to-get HID/DriverKit
  entitlements; cost is version-coupling to pqrs.org + macOS releases.
- **GAP-G3:** Managed Mac → needs IT cooperation (extension allowlist + PPPC). Corporate
  Windows host → server agent is the worst-case EDR/WDAC target.
- **GAP-G4:** App-level scoping while RDP is fullscreen on its own Space is reliable;
  **per-connection auto-matching is best-effort** (Windows App often shows generic titles).
- **GAP-G5:** Steady-state suppress-and-reinject overhead is **sub-millisecond**; real risks
  are lost auto-repeat on held keys and event ordering — keep the hot path lean.
- **GAP-G6:** Keyboard Mode is a **global** pref (`ClientSettings.KeyboardDriverMode`),
  readable/writable via `defaults`/CFPreferences; "per-profile mode" = flip the global
  toggle on focus.
- **GAP-G7:** A static 1:1 rebind **cannot reproduce a dead key** — either emit a real
  dead-key scancode and let the OS compose, or build a compose-state machine emitting
  precomposed Unicode.
- **GAP-G8:** **Secure Event Input** silently blinds CGEventTap remappers in password
  fields; the **DriverKit path sits below it** (Karabiner works on the pre-login screen).
  Detect via `IsSecureEventInputEnabled()`.
- **GAP-G9:** Hooking at the DriverKit virtual-HID level swallows a chord **before** the RDP
  client's reserved shortcuts and the macOS menu bar see it. *But* if a rebind's **output**
  is a client menu key-equivalent (Cmd+W, Ctrl+Cmd+U/K) the client eats it.
- **GAP-G10:** A GUI that **generates Karabiner `complex_modifications` JSON** (+ drives the
  client's keyboard mode) is **by far the fastest viable MVP** — it hands you the hardest
  component (reliable virtual-HID injection into RDP) for free.

---

## Key reference repos & docs

- `pqrs-org/Karabiner-DriverKit-VirtualHIDDevice` — the reusable, public-domain driver
- `pqrs-org/Karabiner-Elements` — `complex_modifications`, frontmost-app conditions
- `varp/karabiner-rdp` — community Karabiner config for Mac→Windows RDP keys
- `4d61726b/RdpKbdFix` — server-side `WH_KEYBOARD_LL` RDP key translator (handles `VK_PACKET`)
- `microsoft/PowerToys` Keyboard Manager — the UX model to copy (and its RDP limitations)
- Microsoft Learn: *Windows App input* + *MS-RDPBCGR* keyboard event spec + *WTS_INFO_CLASS*

_Full per-dimension findings, caveats, and all 356 sources are preserved in the workflow
transcript; this file is the curated distillation._
