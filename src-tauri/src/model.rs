//! Data model shared with the frontend. All structs serialize as `camelCase`
//! JSON; the TypeScript types in `src/types.ts` mirror these one-to-one.
//!
//! Keys are stored as *canonical tokens* (e.g. `"Meta"`, `"Control"`, `"AltGr"`,
//! `"Shift"`, `"W"`, `"7"`, `"Space"`, `"Return"`, `"F5"`), never as platform
//! glyphs. The UI renders the right glyph per platform/mode. This follows the
//! architecture rule: key on physical identity, not labels.

use serde::{Deserialize, Serialize};

/// Current persisted-config schema version. Bump on breaking changes and add a
/// migration in [`crate::store::Store::load`].
pub const SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Installed on the Mac — intercepts before Remote Desktop sends.
    Client,
    /// Installed on the Windows host — fixes keys for every connecting client.
    Host,
}

impl Default for Mode {
    fn default() -> Self {
        Mode::Client
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum OutputMode {
    /// Emit a key + modifiers combination.
    Keys,
    /// Emit a literal string/character — map a key to arbitrary text when a
    /// key combo isn't what you want.
    Text,
}

impl Default for OutputMode {
    fn default() -> Self {
        OutputMode::Keys
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum RuleKind {
    /// Substring match against the host window title / client name.
    Contains,
    /// Regular-expression match.
    Regex,
    /// Exact equality (rendered as "host is" / "client is").
    Exact,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MatchRule {
    pub id: String,
    pub kind: RuleKind,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Mapping {
    pub id: String,
    /// Canonical input tokens (the physical key + modifier set).
    pub input: Vec<String>,
    pub output_mode: OutputMode,
    /// Canonical output tokens, used when `output_mode == Keys`.
    pub output: Vec<String>,
    /// Literal text, used when `output_mode == Text`.
    #[serde(default)]
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    /// The universal fallback profile applies when no match rule fires.
    #[serde(default)]
    pub universal: bool,
    #[serde(default)]
    pub match_rules: Vec<MatchRule>,
    #[serde(default)]
    pub mappings: Vec<Mapping>,
}

/// The persisted configuration — this file *is* the import/export artifact.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub schema_version: u32,
    pub mode: Mode,
    /// Has the first-run onboarding been completed?
    #[serde(default)]
    pub onboarded: bool,
    /// Master "Rebinds active" toggle.
    pub armed: bool,
    pub debug: bool,
    pub active_profile_id: String,
    /// When set, auto-matching is overridden and this profile is forced.
    #[serde(default)]
    pub pinned_profile_id: Option<String>,
    /// Fall back to the universal profile when no rule matches.
    #[serde(default = "default_true")]
    pub universal_fallback: bool,
    /// Test mode: drop the "only in Remote Desktop" condition so rebinds apply
    /// **everywhere**. Useful to prove the engine works; not for daily use.
    #[serde(default)]
    pub ignore_scope: bool,
    pub profiles: Vec<Profile>,
}

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Runtime (ephemeral, never persisted) — engine + scope status and event log.
// ---------------------------------------------------------------------------

/// macOS privacy grants the rebind pipeline needs. On other platforms these
/// report `true` (not applicable).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    /// Accessibility (AXIsProcessTrusted) — observe/control input.
    pub accessibility: bool,
    /// Input Monitoring (IOHIDCheckAccess) — read keystrokes.
    pub input_monitoring: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    /// `"karabiner"` (v0 driver path) or `"none"`.
    pub kind: String,
    pub installed: bool,
    pub healthy: bool,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    pub time: String,
    pub profile: String,
    pub from: Vec<String>,
    pub to: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_text: Option<String>,
    /// `"sent"` | `"secure"` | `"passed"`.
    pub result: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Runtime {
    /// True while RemoteKeyboard is in scope (RDP frontmost / remote session).
    pub scope_active: bool,
    pub frontmost_bundle: String,
    pub frontmost_name: String,
    /// Focused window title — distinguishes a live session from the client's
    /// own connection-center window.
    pub window_title: String,
    /// Secure Event Input active → rebinds silently pass through.
    pub secure_input: bool,
    pub permissions: Permissions,
    pub engine: EngineStatus,
    pub log: Vec<LogEntry>,
}

/// Everything a window needs to render. Returned by `get_snapshot` and pushed
/// on every mutation via the `snapshot` event.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub config: Config,
    pub runtime: Runtime,
    /// `"macos"` | `"windows"` | `"linux"` — selects the native skin.
    pub platform: String,
}
