// Mirrors the Rust model in `src-tauri/src/model.rs` (serialized camelCase).
// Keys are canonical tokens (e.g. "Meta", "Control", "AltGr", "Shift", "W",
// "7", "Space", "Return", "F5"), never platform glyphs — the UI renders glyphs
// per platform/mode via lib/keys.ts.

export type Mode = "client" | "host";
export type OutputMode = "keys" | "text";
export type RuleKind = "contains" | "regex" | "exact";
export type Platform = "macos" | "windows" | "linux";

export interface MatchRule {
  id: string;
  kind: RuleKind;
  value: string;
}

export interface Mapping {
  id: string;
  input: string[];
  outputMode: OutputMode;
  output: string[];
  text: string;
}

export interface Profile {
  id: string;
  name: string;
  universal: boolean;
  matchRules: MatchRule[];
  mappings: Mapping[];
}

export interface Config {
  schemaVersion: number;
  mode: Mode;
  onboarded: boolean;
  armed: boolean;
  debug: boolean;
  activeProfileId: string;
  pinnedProfileId: string | null;
  universalFallback: boolean;
  profiles: Profile[];
}

export interface Permissions {
  accessibility: boolean;
  inputMonitoring: boolean;
}

export interface EngineStatus {
  kind: string; // "karabiner" | "none"
  installed: boolean;
  healthy: boolean;
  detail: string;
}

export interface LogEntry {
  id: number;
  time: string;
  profile: string;
  from: string[];
  to: string[];
  toText?: string;
  result: "sent" | "secure" | "passed";
}

export interface Runtime {
  scopeActive: boolean;
  frontmostBundle: string;
  frontmostName: string;
  secureInput: boolean;
  permissions: Permissions;
  engine: EngineStatus;
  log: LogEntry[];
}

export interface Snapshot {
  config: Config;
  runtime: Runtime;
  platform: Platform;
}

export const MODIFIERS = ["Meta", "Control", "Alt", "AltGr", "Shift"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export function isModifier(token: string): token is Modifier {
  return (MODIFIERS as readonly string[]).includes(token);
}
