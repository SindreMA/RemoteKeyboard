// Canonical-token <-> glyph rendering, physical-key capture, and the dropdown
// key catalog. Tokens are layout-independent (captured from `KeyboardEvent.code`
// where possible) so they're layout-independent — key labels differ across
// physical keyboards, but the physical position/token does not.

import type { Platform } from "../types";
import { isModifier } from "../types";

const MOD_MAC: Record<string, string> = {
  Meta: "⌘", // ⌘
  Control: "⌃", // ⌃
  Alt: "⌥", // ⌥
  AltGr: "AltGr",
  Shift: "⇧", // ⇧
};

const MOD_WIN: Record<string, string> = {
  Meta: "Win",
  Control: "Ctrl",
  Alt: "Alt",
  AltGr: "AltGr",
  Shift: "Shift",
};

const KEY_MAC: Record<string, string> = {
  Space: "Space",
  Return: "⏎", // ⏎
  Tab: "⇥", // ⇥
  Delete: "⌫", // ⌫
  ForwardDelete: "⌦", // ⌦
  Escape: "esc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Insert: "Insert",
  Menu: "▤ Menu",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  Pause: "Pause",
  NumLock: "NumLk",
};

const KEY_WIN: Record<string, string> = {
  Space: "Space",
  Return: "Enter",
  Tab: "Tab",
  Delete: "Backspace",
  ForwardDelete: "Del",
  Escape: "Esc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Insert: "Ins",
  Menu: "▤ Menu",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  Pause: "Pause",
  NumLock: "NumLk",
};

/** Display a single canonical token as the right glyph for the platform. */
export function displayToken(token: string, platform: Platform): string {
  const win = platform === "windows";
  if (isModifier(token)) return (win ? MOD_WIN : MOD_MAC)[token] ?? token;
  const special = (win ? KEY_WIN : KEY_MAC)[token];
  if (special) return special;
  return token;
}

/** Whether the modifier glyph should hug its neighbour (mac symbols are tight). */
export function isGlyphModifier(token: string, platform: Platform): boolean {
  return platform !== "windows" && isModifier(token) && token !== "AltGr";
}

// --- capture ---------------------------------------------------------------

const BARE_MODIFIERS = ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"];

const CODE_NAMED: Record<string, string> = {
  Space: "Space",
  Enter: "Return",
  NumpadEnter: "Return",
  Tab: "Tab",
  Backspace: "Delete",
  Delete: "ForwardDelete",
  Escape: "Escape",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  ContextMenu: "Menu",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  NumLock: "NumLock",
};

/** Map a physical `KeyboardEvent.code` to a canonical key token. */
function codeToToken(code: string, key: string): string {
  if (CODE_NAMED[code]) return CODE_NAMED[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return m[1];
  m = /^(F\d{1,2})$/.exec(code);
  if (m) return m[1];
  // Fall back to the produced character (uppercased for single chars).
  if (key && key.length === 1) return key.toUpperCase();
  return key || code;
}

/**
 * Build the canonical token list from a keydown. Returns `null` while only a
 * bare modifier is held (wait for a real key), so the recorder keeps pulsing.
 *
 * AltGr is treated as a distinct modifier only on Windows, where the OS reports
 * it via the AltGraph modifier state and synthesizes a phantom Left-Ctrl
 * alongside it (which we drop). On macOS, Option is plain Alt — the web platform
 * can't reliably distinguish right-Option inside a combo, and macOS treats it as
 * Alt anyway.
 */
export function captureTokens(e: KeyboardEvent, platform: Platform): string[] | null {
  if (BARE_MODIFIERS.includes(e.key)) return null;
  const altGr =
    platform === "windows" &&
    typeof e.getModifierState === "function" &&
    e.getModifierState("AltGraph");
  const tokens: string[] = [];
  if (e.metaKey) tokens.push("Meta");
  if (e.ctrlKey && !altGr) tokens.push("Control");
  if (altGr) tokens.push("AltGr");
  else if (e.altKey) tokens.push("Alt");
  if (e.shiftKey) tokens.push("Shift");
  tokens.push(codeToToken(e.code, e.key));
  return tokens;
}

// --- combo builder ---------------------------------------------------------

/** Modifiers in canonical display order (also the token-ordering order). */
export const MODIFIER_ORDER = ["Meta", "Control", "Alt", "AltGr", "Shift"] as const;

/** Order a combo: modifiers first (canonical order), then the base key(s). */
export function orderTokens(tokens: string[]): string[] {
  const mods = MODIFIER_ORDER.filter((m) => tokens.includes(m));
  const rest = tokens.filter((t) => !isModifier(t));
  return [...mods, ...rest];
}

/**
 * The base-key catalog for the dropdown. Deliberately includes Windows-only keys
 * that a Mac keyboard can't produce (so you can't record them) — the Menu/App
 * key, Insert, PrintScreen, ScrollLock, Pause/Break, NumLock, F13–F24 — which is
 * the whole reason the output side needs a picker, not just recording.
 */
export const KEY_CATALOG: string[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."1234567890".split(""),
  "Space",
  "Tab",
  "Return",
  "Delete", // ⌫ / Backspace
  "ForwardDelete", // ⌦ / Del
  "Escape",
  "Up",
  "Down",
  "Left",
  "Right",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "Menu", // Windows Application / context-menu key
  "PrintScreen",
  "ScrollLock",
  "Pause",
  "NumLock",
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
];

export function searchCatalog(query: string, platform: Platform): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return KEY_CATALOG;
  return KEY_CATALOG.filter(
    (t) => t.toLowerCase().includes(q) || displayToken(t, platform).toLowerCase().includes(q),
  );
}

// Modifiers are also selectable *as the key itself* — so an output can be a bare
// modifier (e.g. remap Caps Lock → Control, or ⌘ → ⌃).

const MOD_ALIASES: Record<string, string[]> = {
  Meta: ["cmd", "command", "win", "windows", "meta", "super", "⌘"],
  Control: ["ctrl", "control", "ctl", "⌃"],
  Alt: ["alt", "option", "opt", "⌥"],
  AltGr: ["altgr", "alt gr", "ralt", "right alt", "right option"],
  Shift: ["shift", "⇧"],
};

/** A friendly, platform-appropriate name for a modifier (for the picker list). */
export function modifierName(token: string, platform: Platform): string {
  const win = platform === "windows";
  switch (token) {
    case "Meta":
      return win ? "Windows key" : "Command";
    case "Control":
      return "Control";
    case "Alt":
      return win ? "Alt" : "Option";
    case "AltGr":
      return "AltGr";
    case "Shift":
      return "Shift";
    default:
      return token;
  }
}

export function searchModifiers(query: string, platform: Platform): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...MODIFIER_ORDER];
  return MODIFIER_ORDER.filter(
    (m) =>
      m.toLowerCase().includes(q) ||
      displayToken(m, platform).toLowerCase().includes(q) ||
      modifierName(m, platform).toLowerCase().includes(q) ||
      (MOD_ALIASES[m] || []).some((a) => a.includes(q)),
  );
}
