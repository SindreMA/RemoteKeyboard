// Backend seam. Under Tauri it calls Rust commands and listens for `snapshot`
// events; in a plain browser it falls back to an in-memory mock that mirrors the
// Rust default config + mutations, so the whole UI is renderable for preview.

import { useEffect, useState } from "react";
import type {
  Config,
  Mapping,
  Mode,
  Profile,
  RuleKind,
  Snapshot,
} from "../types";

type UnlistenFn = () => void;
type Listener = (s: Snapshot) => void;

export interface Backend {
  getSnapshot(): Promise<Snapshot>;
  onSnapshot(cb: Listener): Promise<UnlistenFn>;
  setArmed(armed: boolean): Promise<void>;
  setDebug(debug: boolean): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  setOnboarded(onboarded: boolean): Promise<void>;
  setUniversalFallback(enabled: boolean): Promise<void>;
  setActiveProfile(id: string): Promise<void>;
  setPinned(id: string | null): Promise<void>;
  addProfile(name: string): Promise<string>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  addMatchRule(profileId: string, kind: RuleKind, value: string): Promise<string>;
  deleteMatchRule(profileId: string, ruleId: string): Promise<void>;
  addMapping(profileId: string): Promise<string>;
  updateMapping(profileId: string, mapping: Mapping): Promise<void>;
  deleteMapping(profileId: string, mappingId: string): Promise<void>;
  loadStarter(profileId: string): Promise<void>;
  exportConfig(): Promise<void>;
  importConfig(): Promise<void>;
  refreshScope(): Promise<Snapshot>;
  checkPermissions(): Promise<Snapshot>;
  requestAccessibility(): Promise<Snapshot>;
  requestInputMonitoring(): Promise<Snapshot>;
  openAccessibilitySettings(): Promise<void>;
  openInputMonitoringSettings(): Promise<void>;
  openUrl(url: string): Promise<void>;
  startKarabiner(): Promise<void>;
  openMain(): Promise<void>;
  hidePopover(): Promise<void>;
  quitApp(): Promise<void>;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------------------------------------------------------------------------
// Tauri backend
// ---------------------------------------------------------------------------

function makeTauriBackend(): Backend {
  // Imported lazily so the mock path never pulls the Tauri runtime in.
  const core = () => import("@tauri-apps/api/core");
  const event = () => import("@tauri-apps/api/event");
  const dialog = () => import("@tauri-apps/plugin-dialog");

  const cmd = async <T>(name: string, args?: Record<string, unknown>): Promise<T> =>
    (await core()).invoke<T>(name, args);

  return {
    getSnapshot: () => cmd<Snapshot>("get_snapshot"),
    onSnapshot: async (cb) => {
      const { listen } = await event();
      return listen<Snapshot>("snapshot", (e) => cb(e.payload));
    },
    setArmed: (armed) => cmd("set_armed", { armed }),
    setDebug: (debug) => cmd("set_debug", { debug }),
    setMode: (mode) => cmd("set_mode", { mode }),
    setOnboarded: (onboarded) => cmd("set_onboarded", { onboarded }),
    setUniversalFallback: (enabled) => cmd("set_universal_fallback", { enabled }),
    setActiveProfile: (id) => cmd("set_active_profile", { id }),
    setPinned: (id) => cmd("set_pinned", { id }),
    addProfile: (name) => cmd<string>("add_profile", { name }),
    renameProfile: (id, name) => cmd("rename_profile", { id, name }),
    deleteProfile: (id) => cmd("delete_profile", { id }),
    addMatchRule: (profileId, kind, value) =>
      cmd<string>("add_match_rule", { profileId, kind, value }),
    deleteMatchRule: (profileId, ruleId) =>
      cmd("delete_match_rule", { profileId, ruleId }),
    addMapping: (profileId) => cmd<string>("add_mapping", { profileId }),
    updateMapping: (profileId, mapping) => cmd("update_mapping", { profileId, mapping }),
    deleteMapping: (profileId, mappingId) =>
      cmd("delete_mapping", { profileId, mappingId }),
    loadStarter: (profileId) => cmd("load_starter", { profileId }),
    exportConfig: async () => {
      const { save } = await dialog();
      const path = await save({
        defaultPath: "remote-keyboard.json",
        filters: [{ name: "RemoteKeyboard config", extensions: ["json"] }],
      });
      if (path) await cmd("export_config_to", { path });
    },
    importConfig: async () => {
      const { open } = await dialog();
      const path = await open({
        multiple: false,
        filters: [{ name: "RemoteKeyboard config", extensions: ["json"] }],
      });
      if (typeof path === "string") await cmd("import_config_from", { path });
    },
    refreshScope: () => cmd<Snapshot>("refresh_scope"),
    checkPermissions: () => cmd<Snapshot>("check_permissions"),
    requestAccessibility: () => cmd<Snapshot>("request_accessibility"),
    requestInputMonitoring: () => cmd<Snapshot>("request_input_monitoring"),
    openAccessibilitySettings: () => cmd("open_accessibility_settings"),
    openInputMonitoringSettings: () => cmd("open_input_monitoring_settings"),
    openUrl: (url) => cmd("open_url", { url }),
    startKarabiner: () => cmd("start_karabiner"),
    openMain: () => cmd("open_main"),
    hidePopover: () => cmd("hide_popover"),
    quitApp: () => cmd("quit_app"),
  };
}

// ---------------------------------------------------------------------------
// Mock backend (browser preview) — mirrors src-tauri/src/store.rs
// ---------------------------------------------------------------------------

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function starterMappings(): Mapping[] {
  const keys = (input: string[], output: string[]): Mapping => ({
    id: uid(),
    input,
    outputMode: "keys",
    output,
    text: "",
  });
  return [
    keys(["Meta", "C"], ["Control", "C"]),
    keys(["Meta", "V"], ["Control", "V"]),
    keys(["Meta", "X"], ["Control", "X"]),
    keys(["Meta", "A"], ["Control", "A"]),
    keys(["Meta", "Z"], ["Control", "Z"]),
    keys(["Meta", "W"], ["Control", "W"]),
  ];
}

function defaultConfig(): Config {
  const universal: Profile = {
    id: uid(),
    name: "Universal",
    universal: true,
    matchRules: [],
    mappings: [],
  };
  const work: Profile = {
    id: uid(),
    name: "Work-PC",
    universal: false,
    matchRules: [{ id: uid(), kind: "contains", value: "WORK-PC" }],
    mappings: [], // start empty — no seeded rebinds
  };
  return {
    schemaVersion: 1,
    mode: "client",
    armed: true,
    debug: false,
    activeProfileId: work.id,
    pinnedProfileId: null,
    universalFallback: true,
    profiles: [universal, work],
    onboarded: PREVIEW_ONBOARDED,
  } as Config;
}

// Preview-only: `?onboarding=1` starts the mock un-onboarded so the first-run
// flow can be inspected in the browser. No effect under Tauri.
const PREVIEW_ONBOARDED =
  typeof window === "undefined" ||
  new URLSearchParams(window.location.search).get("onboarding") !== "1";

function makeMockBackend(): Backend {
  const snap: Snapshot = {
    config: defaultConfig(),
    platform: "macos",
    runtime: {
      scopeActive: true,
      frontmostBundle: "com.microsoft.rdc.macos",
      frontmostName: "Windows App",
      secureInput: false,
      permissions: { accessibility: false, inputMonitoring: false },
      engine: {
        kind: "karabiner",
        installed: true,
        healthy: false,
        detail: "Browser preview — Karabiner installed but not running. Click Start.",
      },
      log: [],
    },
  };
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(structuredClone(snap)));
  const profile = (id: string) => snap.config.profiles.find((p) => p.id === id);

  return {
    getSnapshot: async () => structuredClone(snap),
    onSnapshot: async (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setArmed: async (v) => { snap.config.armed = v; emit(); },
    setDebug: async (v) => { snap.config.debug = v; emit(); },
    setMode: async (v) => { snap.config.mode = v; emit(); },
    setOnboarded: async (v) => { snap.config.onboarded = v; emit(); },
    setUniversalFallback: async (v) => { snap.config.universalFallback = v; emit(); },
    setActiveProfile: async (id) => {
      if (profile(id)) snap.config.activeProfileId = id;
      emit();
    },
    setPinned: async (id) => { snap.config.pinnedProfileId = id; emit(); },
    addProfile: async (name) => {
      const id = uid();
      snap.config.profiles.push({
        id, name: name.trim() || "New profile", universal: false, matchRules: [], mappings: [],
      });
      snap.config.activeProfileId = id;
      emit();
      return id;
    },
    renameProfile: async (id, name) => { const p = profile(id); if (p) p.name = name; emit(); },
    deleteProfile: async (id) => {
      if (snap.config.profiles.length <= 1) return;
      if (profile(id)?.universal) return;
      snap.config.profiles = snap.config.profiles.filter((p) => p.id !== id);
      if (snap.config.activeProfileId === id) snap.config.activeProfileId = snap.config.profiles[0].id;
      if (snap.config.pinnedProfileId === id) snap.config.pinnedProfileId = null;
      emit();
    },
    addMatchRule: async (profileId, kind, value) => {
      const id = uid();
      profile(profileId)?.matchRules.push({ id, kind, value });
      emit();
      return id;
    },
    deleteMatchRule: async (profileId, ruleId) => {
      const p = profile(profileId);
      if (p) p.matchRules = p.matchRules.filter((r) => r.id !== ruleId);
      emit();
    },
    addMapping: async (profileId) => {
      const id = uid();
      profile(profileId)?.mappings.push({ id, input: [], outputMode: "keys", output: [], text: "" });
      emit();
      return id;
    },
    updateMapping: async (profileId, mapping) => {
      const p = profile(profileId);
      if (p) { const i = p.mappings.findIndex((m) => m.id === mapping.id); if (i >= 0) p.mappings[i] = mapping; }
      emit();
    },
    deleteMapping: async (profileId, mappingId) => {
      const p = profile(profileId);
      if (p) p.mappings = p.mappings.filter((m) => m.id !== mappingId);
      emit();
    },
    loadStarter: async (profileId) => { const p = profile(profileId); if (p) p.mappings = starterMappings(); emit(); },
    exportConfig: async () => console.info("[mock] export config", snap.config),
    importConfig: async () => console.info("[mock] import config (no-op in preview)"),
    refreshScope: async () => structuredClone(snap),
    checkPermissions: async () => structuredClone(snap),
    requestAccessibility: async () => {
      snap.runtime.permissions.accessibility = true;
      emit();
      return structuredClone(snap);
    },
    requestInputMonitoring: async () => {
      snap.runtime.permissions.inputMonitoring = true;
      emit();
      return structuredClone(snap);
    },
    openAccessibilitySettings: async () => console.info("[mock] open Accessibility settings"),
    openInputMonitoringSettings: async () => console.info("[mock] open Input Monitoring settings"),
    openUrl: async (url) => console.info("[mock] open url", url),
    startKarabiner: async () => {
      snap.runtime.engine.healthy = true;
      snap.runtime.engine.detail = "Preview — engine live.";
      emit();
    },
    openMain: async () => {},
    hidePopover: async () => {},
    quitApp: async () => console.info("[mock] quit"),
  };
}

export const backend: Backend = inTauri ? makeTauriBackend() : makeMockBackend();

/** Subscribe to the live snapshot. Returns `null` until the first load. */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let un: UnlistenFn | undefined;
    let alive = true;
    backend.getSnapshot().then((s) => alive && setSnap(s));
    backend.onSnapshot((s) => alive && setSnap(s)).then((fn) => {
      if (alive) un = fn;
      else fn();
    });
    return () => {
      alive = false;
      un?.();
    };
  }, []);
  return snap;
}
