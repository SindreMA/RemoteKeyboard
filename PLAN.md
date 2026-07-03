# RemoteKeyboard — Implementation Plan

> The roadmap. Decision in `ARCHITECTURE.md`, stack in `TECH_STACK.md`, evidence in
> `RESEARCH.md`. **Start with Phase 0 — it can save you from building the wrong thing.**

---

## Phase 0 — Premise spike (½–1 day, before committing) ⚠️ do this first

**Goal:** empirically settle the *residual* problem set and prove the injection path reaches
the live Windows App, so you don't build a tool for problems the free toggle already solves.

- [ ] On your **actual** Windows App + Norwegian layout, switch to **Unicode mode**
      (`Ctrl+Cmd+U`) and record exactly which characters are **still** wrong. *(Expect
      backslash to persist; note anything else.)*
- [ ] Install **Karabiner-Elements**, add a `simple_modification` for one broken key, and test
      it into a **live RDP session** in **both** Scancode and Unicode modes — confirm the
      remapped key arrives correctly. *(Validates the DriverKit path reaches RDP.)*
- [ ] For contrast, try the same remap via a bare `CGEventTap` tool (e.g. Hammerspoon) and
      confirm it **fails / strips modifiers** inside RDP. *(Settles the engine choice on your
      build.)*
- [ ] Confirm the **live Windows App bundle id** via `osascript` or Karabiner EventViewer
      (don't hardcode it).
- [ ] **Decision gate:** write down the residual character/combo set the tool must own, and
      go/no-go on the DriverKit engine.

**If the residual set is tiny** (just backslash) and you don't need combos/profiles, the
honest answer may be "use Unicode mode + a 3-line Karabiner rule" and stop. **If it includes
modifier-combo rebinds, per-connection profiles, or you want a real GUI**, proceed.

---

## Phase 1 — MVP: Mac menubar rebinder (engine + core UX)

**Goal:** a working, signed menubar app that reliably rebinds the residual keys/combos **only
while the RDP session is active**, with a single universal profile.

- [ ] **Tray/menubar app** built in the **shared cross-platform UI shell** (Tauri+Rust or
      .NET+Avalonia — see `TECH_STACK.md`), so host mode reuses it verbatim. macOS onboarding
      detects/guides the **Accessibility** grant and the Karabiner driver **system-extension
      approval**, installs the driver, and verifies the engine is live via a **watchdog**.
- [ ] **Injection engine** via the DriverKit virtual-HID daemon — **or the v0 shortcut:**
      generate a dedicated Karabiner `complex_modifications` profile and drive it (migrate the
      injection layer later without changing UI/data model).
- [ ] **Tier-1 scoping:** gate rebinds on `NSWorkspace.frontmostApplication.bundleIdentifier`
      matching `^com\.microsoft\.rdc(\.|$)`; works fullscreen-on-its-own-Space.
- [ ] **Record-input / select-output editor** (PowerToys two-cell "Select:" / "To send:" row
      model): INPUT captures the physical **HID key + modifier set** via a read-only `NSEvent`
      monitor; OUTPUT is a tagged union supporting **key+modifiers** (AltGr = Right-Alt) **AND
      literal Unicode/text** (covers backslash + any glyph still broken in Unicode mode).
- [ ] **Single-key AND modifier-combo rebinds** (`cmd+w → ctrl+w`, `ctrl+alt+del`).
- [ ] **Versioned JSON config** (`schemaVersion` + `profiles[]`) keyed on HID usage; this file
      **is** the import/export artifact.
- [ ] **Loop guard + stuck-key safety:** tag self-injected events; suppress key-up of swallowed
      chords; reset modifier state on focus change.
- [ ] **Onboarding copy** that first recommends the **free Unicode-mode fix** and frames the
      app as covering the residual gaps.

**Phase 1 done = you can fix your own backslash + Cmd-combos in RDP, scoped to the session.**

---

## Phase 2 — Per-connection profiles, debug UX, hardening

**Goal:** the differentiating features + day-to-day trustworthiness.

- [ ] **Per-connection profiles (Tier-2, best-effort):** read the focused window's **AX title**
      (`kAXFocusedWindowAttribute`/`kAXTitleAttribute`, *not* `CGWindowName`) and switch active
      profile via user-editable **substring/regex** rules, with a **universal fallback** and a
      manual **"pin active profile"** override. Advise users to give each connection a unique
      Friendly Name.
- [ ] **Debug mode:** silent by default; on fire show a tiny **non-activating HUD**
      (`NSPanel .nonactivatingPanel`) of `input → output`, coalescing rapid events, + a
      menubar-icon micro-flash; an **Event Log** window; reserve OS notifications for state
      changes only.
- [ ] **Secure Event Input awareness:** poll `IsSecureEventInputEnabled()`, surface "rebinds
      paused — secure input active" and the **active capture mode** (warn if the driver
      downgraded to a CGEventTap fallback — password-field rebinds silently die then).
- [ ] **Dead-key / compose handling:** precomposed-Unicode output by default; optional
      compose-state machine; explicit ISO `<>|` key support.
- [ ] **Import/export** including single-profile export; **global panic hotkey** to suspend all
      rebinds.
- [ ] **Optional RDP Keyboard-Mode automation:** detect/recommend Unicode vs Scancode per
      profile and drive the client's own `Ctrl+Cmd+U`/`Ctrl+Cmd+K` toggle on focus (mode is a
      single **global** pref, so "per-profile mode" = switch-on-focus).
- [ ] **Distribution hardening:** stable Developer ID identity (TCC grants are tied to code
      identity), notarized stapled `.dmg`, **Sparkle** auto-update, and ready-made **System
      Extensions + PPPC `.mobileconfig`** artifacts for managed-Mac IT (allowlist pqrs.org Team
      ID `G43BCU2T37` + Accessibility PPPC).

---

## Phase 3 — Windows host mode (optional / conditional)

The **same product in host mode** — reuses the Phase 1/2 shared UI codebase, mapping model, and
config schema; only the engine adapter and scoping/identity signals are native Windows.

**Build only if** a concrete need appears: rebinds that must apply regardless of connecting
client, iPad/Linux/web clients, or a host you can administer.

- [ ] **Reuse the shared UI shell** from Phase 1/2; swap in the Windows engine adapter and
      `SM_REMOTESESSION` scoping (no second UI codebase).
- [ ] In-session Windows engine using `WH_KEYBOARD_LL` + `SendInput`, **`VK_PACKET`-aware**
      remap logic (mandatory for Unicode-mode keys), `dwExtraInfo` loop-tagging; launched into
      each session by a SYSTEM controller service; re-arm on `WTS_REMOTE_CONNECT`/unlock,
      survive reconnect.
- [ ] Best-effort per-client profiles keyed on **`WTSClientName`** with manual override +
      universal fallback (never assume a unique client→profile mapping — V4 refuted).
- [ ] **Shared versioned JSON config schema** with the Mac app.
- [ ] Distribution: Authenticode SHA-256 + RFC-3161 signed MSI/MSIX, full version metadata,
      pre-submitted to **Microsoft WDSI**; document Intune/Managed-Installer deploy + **EDR
      exclusion** for locked-down hosts.
- [ ] Scope-out doc: SAS/Ctrl+Alt+Del/secure desktop + injection into elevated windows (UIPI)
      unless the agent runs elevated.

---

## Top risks (carry these through every phase)

1. **macOS / DriverKit fragility** — the engine is version-coupled to pqrs.org and to OS
   releases (Tahoe 26.x breakages reported); an OS update can break remapping with no code
   change. *Mitigate:* pin/test a specific driver release, surface the required version,
   watchdog engine health.
2. **Premise redundancy** — if Phase 0 shows few residual broken keys, product value shrinks
   to combos+profiles+scoping. *Mitigate:* validate the real failing set first; message the
   residual-gap niche honestly.
3. **CGEventTap-fallback + Secure Event Input** — the driver is SEI-immune only while holding
   the exclusive HID grab; a downgrade silently kills password-field rebinds. *Mitigate:*
   surface capture mode; never show a rebind as armed while silenced.
4. **Managed-Mac / MDM blocking** — supervised Macs block the system extension (and on macOS
   26/27 possibly the binary) without IT cooperation. *Mitigate:* signed+notarized build; ship
   System Extensions + PPPC profiles; document allowlisting `G43BCU2T37`.
5. **Dead keys & the ISO `<>|` key are not 1:1-swappable** — treat as a distinct output type,
   not an afterthought.
6. **Per-connection auto-matching is best-effort, not a bijection** — Windows App shows generic
   titles, host names collide. Ship title-rules + universal fallback + manual override; don't
   promise clean automatic mapping.
7. **Output-side collision** — if a rebind's *output* is a client menu key-equivalent (Cmd+W,
   Ctrl+Cmd+U/K), the client's menu eats it. Steer users to scancode-forwarded outputs; warn
   on reserved-chord outputs.
8. **(Windows companion only)** it's the keylogger signature EDR catches and WDAC/AppLocker
   blocks; needs host admin; must handle `VK_PACKET`. *Mitigate* with signing, WDSI, IT deploy
   + EDR exclusion — or avoid by staying Mac-side.
9. **Distribution identity friction** — TCC grants are tied to code-signing identity; re-signing
   forces users to re-grant Accessibility. *Mitigate:* stable Developer ID + a relaunch
   affordance.

---

## Open questions for you (these sharpen the plan)

These genuinely change scope — answers will let me tighten Phases 1–3:

1. **After you switch Windows App to Unicode mode (`Ctrl+Cmd+U`), which specific
   keys/characters are STILL wrong?** *(Defines the real residual set — likely backslash + any
   modifier combos.)*
2. **Is the Windows host yours/your team's (installable, policy-OK), or a locked-down corporate
   host with EDR/WDAC where you lack admin?** *(Decides whether a server-side companion is ever
   viable for you.)*
3. **Do you connect to these hosts only from this Mac, or also from iPad/other devices?**
   *(Multi-device is the one scenario that favors a host-side agent.)*
4. **Which macOS version(s), and is your Mac managed/MDM-enrolled?** *(Affects DriverKit
   system-extension approval and IT allowlisting.)*
5. **Do you need rebinds to work in password/credential fields and inside elevated apps on the
   host?** *(Secure Event Input and UIPI bound what client-side / non-elevated approaches can
   do.)*
6. **"Norwegian" or "Norwegian Extended" macOS layout?** *(Option-combo key positions differ,
   affecting capture/output mapping.)*
7. **Do you need true dead-key ergonomics (press `^` then a vowel → `ô`), or is emitting the
   precomposed character directly enough?**
8. **Are you comfortable with the tool depending on Karabiner's signed driver?** *(The OS
   approval prompt will say "pqrs.org," not your product name.)*

---

## Suggested immediate next step

Run **Phase 0** today. It's a couple of hours and it's the difference between building a
genuinely useful tool and reimplementing a free toggle. Tell me the residual broken-key set
(Q1) and whether the hosts are yours or corporate (Q2), and I'll lock the Phase 1 scope and
start scaffolding.
