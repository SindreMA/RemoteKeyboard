# RemoteKeyboard — Architecture Decision

> The decision and its rationale. Backed by `RESEARCH.md`. Stack details in
> `TECH_STACK.md`; roadmap in `PLAN.md`.

---

## The decision in one paragraph

Build a **dual-platform product** — a **macOS menubar app (client mode)** and a **Windows
system-tray app (host mode)** — with **one cross-platform UI codebase** sitting on top of a
**native interception engine per OS**. On macOS the engine is a **Karabiner-style DriverKit
virtual-HID driver** (reuse `pqrs-org/Karabiner-DriverKit-VirtualHIDDevice`, public-domain +
already notarized) — **not** a `CGEventTap`, which provably fails inside MS Remote Desktop. On
Windows the engine is an in-session **`WH_KEYBOARD_LL` hook**. **Build the macOS client first**
(it's the most robust fix and dodges corporate-host friction); the Windows host agent is the
same product in host mode, sequenced second. Before writing product code, spend **one day**
confirming which Norwegian characters are *still* broken after flipping the client to **Unicode
mode** — because that free toggle already fixes most plain typing, and the app must justify
itself on the **residual** gaps (backslash, modifier-combo rebinds, per-connection profiles,
RDP-window/session scoping, a record/select GUI, debug notifications).

> **Dual-platform by design, native where it must be.** Your description wants it runnable in
> both places, and it is: the UI, mapping model, config, profiles, debug, and onboarding are a
> single shared codebase. Only the thin interception/injection engine is native per-OS, because
> the research proves no cross-platform *suppression library* reaches Remote Desktop on macOS.
> "Cross-platform" lives in the UI; "native" lives only in the engine adapter. See
> `TECH_STACK.md` for the shared-UI stack (Tauri+Rust or .NET+Avalonia).

---

## Why client-side on Mac (not server-side on Windows)

Your instinct that **server-side benefits all client platforms** is correct *in the
abstract* — one host install fixes the keyboard for every connecting device (Mac, iPad,
Linux, web). The research confirms the server-side hook genuinely works. But for **your
actual situation** (a Mac connecting into Windows hosts, likely some of them corporate), the
client-side Mac path wins decisively:

| Factor | Client-side (Mac, DriverKit) | Server-side (Windows, `WH_KEYBOARD_LL`) |
|---|---|---|
| **Fixes the Mac-origin AltGr/position mismatch** | ✅ at the source, before the wire | ⚠️ has to reconstruct intent after the fact |
| **Works in both Scancode & Unicode mode** | ✅ | ⚠️ must special-case Unicode `VK_PACKET` |
| **Needs admin on the Windows host** | ❌ no | ✅ yes |
| **Trips corporate EDR / WDAC / AppLocker** | ❌ no foreign process on the host | ✅ **it IS the keylogger signature** |
| **Per-connection profiles** | ✅ (best-effort via window title) | ⚠️ only `WTSClientName`, spoofable |
| **Can rebind Cmd-combos like Cmd+W** | ✅ | ❌ those are intercepted Mac-side anyway |
| **Reach for iPad/Linux/web clients** | ❌ Mac only | ✅ **the one real advantage** |

The deciding move: the remap must happen **before the closed RDP client encodes the
keystroke onto the wire.** Doing it Mac-side fixes the problem at its origin and leaves the
Windows host receiving only ordinary, correct RDP events — sidestepping the **entire**
corporate-host blocker class.

**Keep server-side as Phase 3**, gated on a concrete need: rebinds that must apply regardless
of connecting client, iPad/Linux/web clients, or a host you fully administer.

---

## Why DriverKit virtual-HID, not CGEventTap (the load-bearing decision)

This is the single most important technical finding, and it flips the "obvious" choice:

- A **plain `CGEventTap`** (what Hammerspoon, BetterTouchTool, Keyboard Maestro, and every
  cross-platform Rust/.NET hook library use on macOS) **does not reliably work inside MS
  Remote Desktop.** The client reads keyboard at the raw-HID layer, *parallel to and below*
  the tap: the original key leaks through as the wrong character, and synthetic
  re-injection isn't honored (modifiers stripped → **Ctrl+W arrives as "W"**). Worse,
  **Secure Event Input silently disables the tap in password fields** — the worst possible
  place to fail silently with the wrong Nordic character.
- A **DriverKit virtual-HID driver** seizes the physical keyboard (exclusive
  `IOHIDDeviceOpen`) and re-emits through a virtual device macOS treats as **genuine
  hardware** — *below* the WindowServer, *below* the client's read point, and *below* Secure
  Event Input (proven by Karabiner working on the pre-login password screen).

**You don't build the driver.** `pqrs-org/Karabiner-DriverKit-VirtualHIDDevice` is
**Unlicense / public-domain**, **already notarized by pqrs.org**, and explicitly supports
arbitrary third-party clients over its root daemon socket (the `kanata` keyboard remapper
ships exactly this way). Reusing it:
- hands you the hardest, riskiest component (reliable injection that actually reaches RDP)
  for free, and
- sidesteps Apple's **discretionary** DriverKit + `com.apple.developer.hid.virtual.device`
  entitlement approval (days-to-weeks, may be denied).

The OS approval prompt the user sees will name **pqrs.org**, not your product — a known,
widely-allowlisted publisher (Team ID `G43BCU2T37`). (This is an open question to confirm
you're comfortable with — see `PLAN.md`.)

---

## Process shape — client mode (macOS)

```
┌─────────────────────────────────────────────────────────────────┐
│  Unprivileged menubar UI  (shared cross-platform codebase)       │
│  • tray + mapping editor (record input / pick out)               │
│  • NSWorkspace frontmost-app gating (com.microsoft.rdc.*)        │
│  • NSWorkspace frontmost-app gating (com.microsoft.rdc.*)        │
│  • AXUIElement window-title read → per-connection profile match  │
│  • config = single versioned JSON file (import/export artifact)  │
│  • debug HUD + event log                                         │
└───────────────┬─────────────────────────────────────────────────┘
                │ local IPC (load active profile, status)
┌───────────────▼─────────────────────────────────────────────────┐
│  Root engine  (LaunchDaemon, native, thin)                       │
│  • applies the active profile's rebinds on the hot path (O(1))   │
│  • talks to the Karabiner DriverKit daemon over its UNIX socket  │
│  • tags self-injected events; suppresses down+up of swapped chords│
└───────────────┬─────────────────────────────────────────────────┘
                │ UNIX socket
┌───────────────▼─────────────────────────────────────────────────┐
│  Karabiner DriverKit VirtualHIDDevice daemon  (reused, notarized)│
│  • seizes physical keyboard, re-emits via virtual HID device     │
└──────────────────────────────────────────────────────────────────┘
```

This split (root engine + unprivileged UI + bundled driver daemon) is exactly how Karabiner
and kanata ship, and it satisfies the driver's root-only command requirement.

## Process shape — host mode (Windows)

The **same product, same UI codebase** — only the engine adapter and the scoping/identity
signals are swapped for native Windows ones:

```
┌─────────────────────────────────────────────────────────────────┐
│  System-tray UI  (shared cross-platform codebase)               │
│  • tray + mapping editor (record input / pick out)               │
│  • scoping: SM_REMOTESESSION (only act inside a remote session)  │
│  • per-connection match: WTSClientName (best-effort)            │
│  • config = same versioned JSON file (import/export artifact)    │
│  • debug HUD + event log                                         │
└───────────────┬─────────────────────────────────────────────────┘
                │ in-process / local IPC
┌───────────────▼─────────────────────────────────────────────────┐
│  In-session engine  (one per interactive RDP session)            │
│  • WH_KEYBOARD_LL hook: suppress (nonzero) + replace (SendInput) │
│  • VK_PACKET-aware (Unicode-mode keys); dwExtraInfo loop-tagging  │
│  • launched into each session by a SYSTEM controller service     │
└──────────────────────────────────────────────────────────────────┘
```

### Activation scoping
- **Tier 1 (reliable):** gate all rebinds on
  `NSWorkspace.frontmostApplication.bundleIdentifier` matching `^com\.microsoft\.rdc(\.|$)`
  — works even when RDP is fullscreen on its own Space. *Verify the live Windows App bundle
  id at runtime; don't hardcode.*
- **Tier 2 (per-connection, best-effort):** match the focused window's **AX title**
  (`kAXFocusedWindowAttribute`/`kAXTitleAttribute`) via user-editable substring/regex rules,
  with a **universal fallback** and a manual **"pin this profile"** override. Tell users to
  give each connection a unique Friendly Name. Do *not* promise clean automatic
  window→profile mapping (Windows App often shows generic titles).

---

## Adversarial verification of the load-bearing claims

Each claim was attacked by 3 independent skeptics (lenses: API correctness / real-world RDP
behavior / 2026 versions), instructed to **refute** it. Result:

| Claim | Votes | Outcome |
|---|---|---|
| **V1** — Mac client-side can intercept/suppress/rewrite keys before the RDP client sends them | confirmed / uncertain / uncertain | **TRUE, but only via DriverKit virtual-HID — CGEventTap refuted.** |
| **V2** — A `WH_KEYBOARD_LL` hook inside the RDP session sees & can replace injected keys | confirmed / confirmed / confirmed | **TRUE.** Server-side hook works (it's just operationally inferior). |
| **V3** — The Nordic breakage is fixable by key remapping at all | uncertain / confirmed / confirmed | **TRUE client-side, but NOT a naive 1:1 swap** — needs HID-level injection + character/Unicode output + dead-key handling. |
| **V4** — Server-side Windows can reliably ID the connecting client for per-client profiles | refuted / refuted / refuted | **FALSE.** Hardware-id always 0; address NAT-broken; only spoofable `WTSClientName`. Per-client auto-profiles are best-effort only. |
| **V5** — Existing tools/settings don't fully solve it, so building is justified | confirmed / uncertain / confirmed | **TRUE, narrowly** — justified as a UX/orchestration layer, not a novel engine, and not for plain typing (Unicode mode handles that free). |
| **V6** — One cross-platform framework can suppress keys on both OSes, avoiding a native split | uncertain / refuted / refuted | **FALSE for this target.** The cross-platform suppress libs all use CGEventTap on macOS — the disqualified mechanism. **Native Mac engine required.** |

The architecture above is what survives all six verdicts: build **only the Mac side** for
v1, on a **DriverKit engine**, as an **orchestration layer over a solved injection problem**,
with **best-effort (not guaranteed) per-connection** profiles, and **server-side deferred**.

---

## What this explicitly rejects

- ❌ **CGEventTap as the engine** (V1/V6/GAP-G1/GAP-G8) — fails inside RDP, dies under Secure
  Input.
- ❌ **A cross-platform *interception library*** (rdev / SharpHook / uiohook) **for the macOS
  engine** — all reduce to CGEventTap on macOS (or can't suppress at all). *A cross-platform
  **UI** shell is fine and recommended* — the rejection is only about the input/suppression
  layer, which stays native (Karabiner driver on macOS, `WH_KEYBOARD_LL` on Windows).
- ❌ **Building a bespoke DriverKit driver** — Apple's discretionary entitlements; Karabiner's
  is free and notarized.
- ❌ **Server-side Windows agent as the primary** — keylogger EDR signature, needs host admin,
  can't ID clients reliably.
- ❌ **Promising automatic per-connection profile switching** — it's best-effort; ship manual
  override + universal fallback.

---

## Honest scope caveat

For a user whose *only* pain is typing Nordic characters, the **free Unicode-mode toggle**
(`Ctrl+Cmd+U`) — or fixing the Windows host to actually run the Norwegian layout — may make
an app unnecessary. The product earns its place on what configuration **cannot** do:
backslash (broken even in Unicode mode), **modifier-combo rebinds** (you can't get correct
Nordic typing *and* working shortcuts from one global toggle), per-connection profiles,
RDP-window-scoped activation, a record/select GUI, and debug notifications. **Validate the
residual broken-key set in the Phase 0 spike before committing.**
