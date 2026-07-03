# Design Prompt — RemoteKeyboard

> Paste this into Claude design (or Figma Make). It's a self-contained brief for the UI of a
> **cross-platform desktop utility** (macOS **and** Windows) that remaps keyboard keys for
> Microsoft Remote Desktop sessions. Engineering context lives in
> `ARCHITECTURE.md`/`TECH_STACK.md` — this file is UI-only.

---

## Prompt

Design a **modern, minimalist, cross-platform desktop utility** called **RemoteKeyboard** that
runs on **both macOS and Windows** with a **shared design language** rendered in each
platform's native conventions. It lets a user create custom keyboard rebinds that fix
wrong/missing keys when using Microsoft Remote Desktop between a Mac and a Windows PC. The
primary user is on a **Norwegian keyboard**, so characters like `| \ @ { } [ ] $ æ ø å` and
shortcuts like `Cmd+W` / `Ctrl+W` are the pain points.

The app is a **tray/menubar utility**: it lives in the **macOS menubar** and the **Windows
system tray (notification area)**. Clicking the icon opens a small **popover** for quick
control; an "Open RemoteKeyboard" item opens the **main window** where mappings are configured.

### Two run modes the UI must express (same app, same screens, different context)
The product runs in one of two modes depending on where it's installed. The UI must make the
current mode obvious and adapt its language — but the **screens and components are the same**.

- **Client mode — installed on the Mac.** Intercepts keys on the Mac *before* Remote Desktop
  sends them. Scope = *"only while the Remote Desktop window is the active window."* Profiles
  are matched to the **remote host you're connecting to** (e.g. by the session window title).
- **Host mode — installed on the Windows PC.** Runs inside the remote session on the host and
  fixes keys for **every device that connects** (Mac, iPad, Linux, web). Scope = *"only while
  this is a remote session."* Profiles are matched to the **connecting client** (e.g. by
  client name).

Design a small, persistent **mode indicator** (e.g. a labeled chip in the window header and
popover: `Client mode · this Mac` or `Host mode · this PC`), and adapt the scoping panel and
onboarding copy to the active mode.

---

## Surfaces to design (in BOTH macOS and Windows styling)

### 1. Tray icon + popover (the everyday surface)
- A crisp **icon** for the macOS menubar (monochrome template) and the Windows system tray
  (Fluent-styled) — a keyboard glyph with a subtle "swap/return" motif. Three states:
  **active** (rebinds armed), **idle/dormant** (Remote Desktop not in focus / not a remote
  session), **paused** (globally suspended). A brief **flash** when a rebind fires (debug mode).
- A compact **popover** (~320pt / ~340px) with:
  - Big **on/off toggle** — "Rebinds active."
  - The **mode indicator** + active **profile** name + a one-line status, e.g.
    *"Active — Remote Desktop in focus · Profile: Work-PC"* (client) or
    *"Active — remote session · Client: SINDRE-MAC"* (host).
  - A small **profile switcher** with a **"Pin this profile"** toggle.
  - A **Debug mode** switch.
  - Footer: *Open RemoteKeyboard*, *Quit*.

### 2. Main window — Mappings (the core screen)
A clean single window (~860×580) with a **left sidebar** (Profiles) and a **main pane** (the
mapping table). This is the heart of the product — make the **record-input → choose-output**
flow effortless.

- **Sidebar:** list of **Profiles** (e.g. "Universal", "Work-PC", "Azure VDI"), each with a
  small match hint that **changes by mode** — *"matches host: WORK-PC"* in client mode,
  *"matches client: SINDRE-MAC"* in host mode. A "+" to add a profile and a highlighted
  **Universal** fallback. One profile is selected/active.
- **Main pane = a two-column mapping table** (model it on PowerToys Keyboard Manager's
  "Select:" / "To send:" rows, but cleaner and more native):
  - Each row: **[ Input key/combo ]  →  [ Output key/combo ]  [delete]**.
  - The **Input cell**, when clicked, enters a **"recording" state**: it pulses and says
    *"Press a key or combo…"*, captures the next physical key + modifiers, and shows them as
    **keycap chips**. Esc cancels, Enter confirms. Provide a **searchable dropdown** fallback.
  - The **Output cell** offers the same capture **plus an "as text" mode** — a small segmented
    control **"Send keys"** vs **"Send text"** (so a user can map a key directly to the literal
    character `\` or `|` when the key path is broken). Show the resolved character preview.
  - **Keycap glyphs adapt to platform:** macOS shows `⌘ ⌥ ⌃ ⇧` (label right-Option as
    **AltGr**); Windows shows `Ctrl Alt ⊞Win Shift` and **AltGr**. Design the keycap component
    so the same row data renders correctly in either style.
  - A prominent **"+ Add mapping"** button. Empty state: a friendly illustration + *"No
    mappings yet — add one to fix a key."* and a one-tap **"Fix my Norwegian keys"** starter.
- **Window top bar:** profile name (editable inline), the **mode indicator**, an
  **active-scope** indicator (*"Active only in Remote Desktop"* / *"Active only in remote
  sessions"*), **Import** / **Export** buttons, and a **search/filter** box.

### 3. Connection / scoping settings (a panel or tab) — mode-aware
- **Client mode:** *"Rebinds only apply while a Remote Desktop session is the active window."*
  with a live indicator of the detected frontmost app. **Match rules** = window-title
  substring/regex rules → profile, a **Universal** toggle, and a manual **Pin** override.
- **Host mode:** *"Rebinds only apply while this is a remote session."* **Match rules** =
  connecting **client name** → profile, a **Universal (all clients)** toggle, and a manual
  **Pin** override.
- Keep matching honest/low-key in both modes — it's best-effort; the universal fallback and
  manual pin are always available.

### 4. Debug / activity (a panel or slide-over)
- A **debug toggle**. When on, a tiny **non-intrusive HUD** appears near the cursor on each
  rebind showing `input → output` (a small rounded translucent pill, e.g. `⌘W → ⌃W` on Mac,
  `Win+W → Ctrl+W` on Windows). Coalesce rapid events.
- An **Event Log** list: timestamp, profile, `input → output`, suppressed/sent. Scannable;
  monospace for the key columns.
- A subtle **warning banner** pattern for paused states — e.g. *"Rebinds paused — secure input
  active (password field)"* (macOS) / *"Rebinds paused — secure desktop"* (Windows).

### 5. Onboarding (first-run, 3–4 steps) — mode-aware
- Step 0: **mode pick / auto-detect** — "You're installing on a Mac → Client mode" or "on a
  Windows PC → Host mode," with a one-line explanation of each.
- Step 1: **the free fix first** — *"Try switching Remote Desktop to Unicode keyboard mode
  (Ctrl+Cmd+U) — it fixes most Norwegian typing. RemoteKeyboard handles what that can't:
  backslash, shortcut combos, and per-connection profiles."*
- Step 2: **permissions** — macOS: Accessibility + a keyboard-engine system extension (publisher
  shown as "pqrs.org" — reassure the user). Windows: a one-time *"this app monitors keyboard
  input to remap keys"* trust card (it may trigger an antivirus warning — explain why).
- Step 3: **"Fix my Norwegian keys"** one-tap starter set.
- Success state: *"You're set — open Remote Desktop and start typing."*

### Visual language
- **One design system, two native skins.** macOS: Tahoe-era conventions — translucent
  materials, rounded corners, SF Pro / SF Mono, system accent, menubar idioms. Windows: Fluent
  / WinUI — Mica/acrylic, Segoe UI Variable / Cascadia Mono, system accent, notification-area
  idioms. Both: generous whitespace, full **light + dark mode**.
- **Keycap chips are the signature element** — design one component that renders both Mac
  (`⌘⌥⌃⇧`) and Windows (`Ctrl/Alt/Win/Shift`) keycaps from the same data. Used across capture
  fields, the log, and the HUD.
- Calm and trustworthy, not "gamer RGB." This is a precision utility that handles every
  keystroke — it should feel **safe, quiet, and exact**. Color sparingly: green = armed,
  neutral/grey = dormant, amber = paused/secure, red only for destructive actions.
- Keep the mapping table airy and instantly scannable; one obvious primary action per screen.

### Deliverables
For **both macOS and Windows**, in **light and dark mode**: the **tray popover**, the **main
Mappings window** (with a row mid-recording and a populated profile), the **connection/scoping
panel** (showing the client-mode and host-mode variants), the **debug HUD + event log**, and
the **onboarding flow** (showing the mode pick). Plus the **tray/menubar icon** in its three
states for each platform. Provide the reusable **keycap chip** (cross-platform), the **profile
sidebar**, and the **mode indicator** as named components.
```
Reference points to emulate: PowerToys Keyboard Manager (the two-cell row editor) and Fluent
on Windows; Karabiner-Elements (rule clarity) and CleanShot X / Bartender (quiet, premium
menubar feel) on macOS. Match the level of polish; don't copy.
```
