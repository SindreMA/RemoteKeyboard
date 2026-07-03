# RemoteKeyboard

A utility to create custom **keyboard rebinds for Microsoft Remote Desktop** — remap any key or
combo when remoting from a **Mac** into a Windows PC (e.g. map Mac `⌘`-shortcuts to their
Windows `⌃`-equivalents, or any physical key to another key or literal text). Purely a
rebinder — no language/character-set assumptions.

> Status: **MVP scaffold in progress.** The full UI from
> [Claude Design](https://claude.ai/design/p/88370874-6b34-41e7-81bf-8e28bacf5751) is
> implemented on **Tauri v2 + React/TS**, wired to a Rust backend (versioned-JSON config,
> menubar tray, popover + main windows). The native injection engine is behind a trait with a
> **v0 Karabiner** adapter (see `Engine status` below). The planning docs that produced this —
> a 73-agent research sweep with adversarial verification of every load-bearing claim — follow.

## The decision (short version)

- **Dual-platform product, one shared UI codebase:** a **macOS menubar app (client mode)** and
  a **Windows system-tray app (host mode)** — same UI, mapping model, config, profiles, and
  debug; only the interception **engine** is native per-OS.
- **Engines:** macOS = a **Karabiner-style DriverKit virtual-HID driver** (reuse pqrs.org's
  public-domain, notarized one) — **not** a `CGEventTap`, which provably fails inside Remote
  Desktop. Windows = an in-session **`WH_KEYBOARD_LL` hook**.
- **Shared-UI stack:** **Tauri + Rust** (recommended for new/fast/multiplatform) or **.NET +
  Avalonia** — the cross-platform shell hosts the native engine adapter on each OS.
- **Build the macOS client first** (most robust fix, dodges corporate-host friction); the
  Windows **host mode** is the same app, sequenced second — it works, but it's the keylogger
  signature corporate EDR blocks, needs host admin, and can't reliably ID clients.
- **Fastest start:** wrap Karabiner-Elements on macOS (generate `complex_modifications` JSON)
  behind your own UI; migrate to the direct driver later without changing the product.
- **Scope:** a pure key rebinder — single keys and modifier combos (e.g. `⌘W → ⌃W`,
  `⌃⌥Del`), an output that can be a key combo **or** literal text, per-connection profiles, and
  RDP-window-scoped activation.

## The app

A **Tauri v2 + React/TypeScript** desktop app. One shared UI codebase; the native injection
engine is isolated behind a Rust trait (`engine::RebindEngine`).

```
RemoteKeyboard/
├── src/                      # React/TS frontend (the shared UI)
│   ├── theme.css             # design tokens — 4 palettes (mac/win × light/dark)
│   ├── types.ts              # mirrors the Rust model (camelCase)
│   ├── lib/{api,keys}.ts     # Tauri IPC seam (+ browser mock) · key capture/glyphs
│   ├── components/           # Keycap chip, toggles, mode indicator, status dot
│   └── views/                # Popover, Main shell, Onboarding, panels/{Mappings,Scoping,Debug}
└── src-tauri/src/            # Rust backend
    ├── model.rs              # Config / Profile / Mapping / Runtime (serde)
    ├── store.rs              # versioned JSON config + state + snapshot/emit
    ├── commands.rs           # the IPC surface (one `snapshot` event after every mutation)
    ├── engine.rs             # RebindEngine trait + v0 Karabiner generator
    ├── tray.rs / window.rs   # menubar icon + popover positioning + accessory lifecycle
    └── lib.rs                # Tauri builder wiring
```

### Build & run

```bash
npm install
npm run tauri dev      # launches the menubar app (macOS)
npm run build          # typecheck + production web build
cargo check            # (in src-tauri/) typecheck the Rust backend
```

The UI also runs in a plain browser against an in-memory mock backend — handy for design review:

```bash
npm run build && npx vite preview     # then open /?view=main · /?view=popover · /?view=main&onboarding=1
```

### Engine status (v0)

Per `ARCHITECTURE.md`, the macOS engine is the **Karabiner DriverKit virtual-HID driver** (not a
`CGEventTap`). v0 ships the *accelerator*: the app **generates** a Karabiner
`complex_modifications` asset from the active profile. Live profile selection and arbitrary
Unicode/text output are **not yet wired** — the app reports this honestly in the popover/Debug
status and only arms once Karabiner-Elements (publisher `pqrs.org`) is installed. Migrating to
the bundled direct driver later won't change the UI or config schema.

## Documents

| File | What's in it |
|---|---|
| [`RESEARCH.md`](./RESEARCH.md) | Findings + sources: root cause, client/server feasibility, stack, UX, distribution |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The decision, client-vs-server, the DriverKit-not-CGEventTap call, **adversarial verification table** |
| [`TECH_STACK.md`](./TECH_STACK.md) | Stack choice + every alternative considered and why not |
| [`PLAN.md`](./PLAN.md) | Phased roadmap (start at **Phase 0**), risks, and **open questions for you** |
| [`design-prompt.md`](./design-prompt.md) | Self-contained UI brief for Claude design |
| [`Description.md`](./Description.md) | Your original project description |

## Next step

Wire the live macOS engine: confirm a **Karabiner** remap actually reaches an RDP session
(install Karabiner-Elements, then drive profile selection from `engine.rs`), and answer whether
the Windows hosts are **yours or corporate** (decides whether a host-side agent is ever viable).
That locks the Phase 1 engine scope.

> The deeper planning docs (`ARCHITECTURE.md`, `PLAN.md`, `RESEARCH.md`, `design-prompt.md`)
> were written around a Norwegian-layout premise; the product is now a general-purpose rebinder,
> so treat their language-specific framing as historical.
