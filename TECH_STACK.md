# RemoteKeyboard — Tech Stack

> The stack decision and the alternatives considered. Rationale traces back to
> `RESEARCH.md`; the decision context is in `ARCHITECTURE.md`.

---

## The shape: one cross-platform UI + a native engine adapter per OS

RemoteKeyboard is a **dual-platform product** — it runs as a **macOS menubar app (client mode)**
and a **Windows system-tray app (host mode)**. The research imposes exactly one hard
constraint on *how* to be cross-platform:

> The **interception/injection engine** must be **native per-OS** — DriverKit virtual-HID on
> macOS, `WH_KEYBOARD_LL` on Windows. Cross-platform *suppression libraries* (rdev, SharpHook)
> are disqualified because **they all use `CGEventTap` on macOS**, which fails inside Remote
> Desktop (V6, verified).

That constraint applies to the **engine**, not the **UI**. The UI — tray, mapping editor,
profiles, debug, onboarding — is identical in concept on both platforms and **should be one
cross-platform codebase**. So the architecture is:

```
   ┌────────────────────────────────────────────┐
   │   Shared cross-platform UI + app logic      │   ← one codebase
   │   (tray, mapping editor, profiles, config)  │
   └───────────────┬────────────────────────────┘
                   │ local IPC / FFI
        ┌──────────┴───────────┐
        ▼                      ▼
  macOS engine adapter   Windows engine adapter   ← thin, native, per-OS
  → Karabiner DriverKit  → in-process WH_KEYBOARD_LL
    driver (reused)        + SendInput
```

The hard, risky part on each OS stays native; everything above it is shared.

---

## Recommendation

**Tauri v2 + Rust** for the shared UI and app logic, with native engine adapters:

| Layer | Choice |
|---|---|
| **UI shell + app logic** | **Tauri v2** (web UI) **+ Rust** core — one codebase, ~5–15 MB bundle, both OSes |
| **Tray / menubar** | Tauri tray API (`NSStatusItem` on macOS, notification area on Windows) |
| **macOS engine** | **Reuse `pqrs-org/Karabiner-DriverKit-VirtualHIDDevice`** (Unlicense, notarized) via the `karabiner-driverkit` Rust binding + a thin root daemon. **Never** rdev/CGEventTap for the RDP path. |
| **Windows engine** | Rust `windows` crate: in-session **`WH_KEYBOARD_LL` + `SendInput`**, `VK_PACKET`-aware, `dwExtraInfo` loop-tagging |
| **macOS scoping** | `NSWorkspace` frontmost app + `AXUIElement` window title (via FFI/objc2) |
| **Windows scoping** | `SM_REMOTESESSION` + `WTSQuerySessionInformation` (client name) |
| **Config** | single **versioned JSON** file, shared schema across both platforms (also the import/export artifact) |
| **Updates** | **Tauri updater** (one mechanism, both OSes) |
| **Signing** | macOS: Developer ID + Hardened Runtime + notarytool; Windows: Authenticode SHA-256 + timestamp, pre-submit to Microsoft WDSI |

**Why Tauri + Rust:** it's the best fit for your stated preference (new / fast / multiplatform),
ships a tiny bundle for an always-on tray utility, and — crucially — Rust can host the
**native** OS-specific engine code directly (the `windows` crate hook on Windows; the
`karabiner-driverkit` binding on macOS), so a single codebase covers both **without** falling
into the cross-platform-suppress-library trap. One config schema, one updater, one UI.

> ⚠️ The one rule that makes Tauri safe here: on macOS the engine adapter must talk to the
> **Karabiner DriverKit driver** — do **not** use rdev's `grab()` (it's a CGEventTap and will
> fail inside Remote Desktop). Tauri/Rust is only the *shell and the Windows engine*; the macOS
> engine is the reused driver.

---

## Strong alternative: .NET 8/9 + Avalonia

If you'd rather work in **C#** (more mature low-level Windows tooling, larger desktop talent
pool):

| Layer | Choice |
|---|---|
| **UI** | **Avalonia** (cross-platform tray via `NativeMenu`, one codebase) |
| **Windows engine** | P/Invoke **`WH_KEYBOARD_LL` + `SendInput`** — first-class in .NET |
| **macOS engine** | thin native interop to the **Karabiner DriverKit driver** (not SharpHook — SharpHook is CGEventTap on macOS) |
| **Updates** | Velopack (cross-platform) |

Trade-offs vs Tauri: heavier runtime, but the **most battle-tested Windows hooking story** and
a simpler in-process engine on the host side. Equally valid; pick by language preference.

---

## The v0 accelerator (works under either UI choice)

Fastest path to something usable **this week**, on the platform you build first:

- **macOS:** don't link the driver directly yet — have the app **generate a Karabiner
  `complex_modifications` profile** and switch profiles via `karabiner_cli` on RDP focus. You
  get virtual-HID injection that actually reaches RDP, modifier combos, and hot-reload **for
  free**; build only the UI, capture UX, scoping, debug, and import/export. (Requires the user
  to install Karabiner-Elements; migrate to the bundled direct driver later — **same UI and
  data model**.)
- **Windows:** the native `WH_KEYBOARD_LL` hook is small enough to write directly from day one.

---

## Stack alternatives considered (and why not)

| Option | Verdict | Reason |
|---|---|---|
| **Tauri v2 + Rust** (shared UI + native engines) | ✅ **recommended** | Best fit for new/fast/multiplatform; tiny bundle; Rust hosts native engine code on both OSes. |
| **.NET 8/9 + Avalonia** (shared UI + native engines) | ✅ strong alt | Most mature Windows hooking; heavier runtime; pick if you prefer C#. |
| **Wrap Karabiner-Elements (macOS v0)** | ✅ for v0 | Hands you the hardest component free; migrate to direct driver later (GAP-G10). |
| **Native split (Swift on Mac + WinUI/.NET on Windows)** | ⚠️ fallback | Max robustness, but **two UI codebases** — contradicts the multiplatform-UI goal. Reserve for if a shared UI proves limiting. |
| **Electron** | ❌ | `uiohook-napi` is observe+inject only (can't suppress); ~150–200 MB for a tray tool. |
| **Flutter** | ❌ engine | UI fine; contributes nothing to hooks; Dart-FFI thread/return limitation. |
| **Go (Wails / Fyne)** | ❌ engine | Tray fine; input bindings are listen-only; suppression needs custom cgo. |
| **rdev / SharpHook for macOS interception** | ❌ | Both are `CGEventTap` on macOS → fail inside Remote Desktop (V6). Use the Karabiner driver instead. |
| **Bespoke DriverKit driver from scratch** | ❌ | Apple's discretionary DriverKit + HID entitlements (days–weeks, may be denied). Karabiner's is free + notarized. |

---

## Mapping engine design notes (shared across both platforms)

- **Key on physical identity, not labels:** HID usage id + page (macOS) / scancode (Windows).
  Key labels are wrong on ISO/Nordic boards — so the UI must **record** keys, not have users
  type names. One canonical internal key model maps to platform codes at the edges.
- **Output is a tagged union:** `key+modifiers` | `unicode-text` | `command`. For broken Nordic
  glyphs and especially the **residual backslash**, prefer **literal Unicode/text output** (the
  position path is exactly what RDP mangles).
- **Model AltGr as Right-Alt explicitly** — never fold into Left-Ctrl (PowerToys' bug).
- **Dead keys** (`^ ~ \` ¨`) are stateful and **cannot** be reproduced by a static 1:1 swap:
  default to emitting the **precomposed character** as a single Unicode event; offer an optional
  compose-state machine (GAP-G7).
- **The ISO `<>|` key** (HID usage `0x64` / macOS `kVK_ISO_Section 0x0A` / PC scancode `0x56`) is
  its own explicit key.
- **Engineering invariants:** tag self-injected events and skip them (loop guard); suppress
  **both** down and up of swallowed chords; reset modifier state on focus change; flush held keys
  on profile switch/quit (no stuck modifiers); keep the hot path O(1) and defer debug
  notifications off-thread (sub-ms budget, GAP-G5).

---

## Windows host-mode specifics (the in-session agent)

Host mode runs inside the interactive RDP session, so beyond the shared UI it needs:

- **Session model:** a SYSTEM controller service watches `SERVICE_CONTROL_SESSIONCHANGE` and
  launches the agent into each interactive session via `WTSQueryUserToken`/`CreateProcessAsUser`;
  re-arm on `WTS_REMOTE_CONNECT`/unlock; survive reconnect.
- **Client identity:** best-effort **`WTSClientName`** only (hardware-id is always 0, address is
  NAT-broken — V4), plus manual override + universal fallback.
- **Distribution caveat:** `WH_KEYBOARD_LL` + `SendInput` **is** the keylogger signature EDR
  flags and WDAC/AppLocker can block — sign, pre-submit to WDSI, and document Intune/Managed-
  Installer deploy + an EDR exclusion for locked-down corporate hosts.
- **Hard limits:** SAS/Ctrl+Alt+Del needs `SendSAS`; UIPI blocks injection into elevated windows.
