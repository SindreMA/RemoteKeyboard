//! Injection-engine adapter.
//!
//! Per `ARCHITECTURE.md` the macOS engine is the **Karabiner DriverKit virtual-HID
//! driver** (not a `CGEventTap`, which fails inside RDP). We don't build the
//! driver — we reuse Karabiner-Elements: this module writes the active profile's
//! rebinds **directly into the user's active Karabiner profile**
//! (`~/.config/karabiner/karabiner.json`), which Karabiner hot-reloads. No manual
//! "add rule" step.
//!
//! Safety:
//! - Every rule we write is tagged (its `description` starts with [`RULE_TAG`]);
//!   we only ever add/remove *our* rules and preserve everything else.
//! - Every manipulator is scoped with `frontmost_application_if` to the Remote
//!   Desktop bundle id, so rebinds can't affect normal Mac usage.
//! - [`KarabinerEngine::apply`] is idempotent — it only writes when the resulting
//!   rules differ, so it won't trigger a Karabiner reload on every edit.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::model::{EngineStatus, Mapping, OutputMode, Profile};

/// Marks rules owned by RemoteKeyboard inside the user's Karabiner config.
const RULE_TAG: &str = "RemoteKeyboard —";
/// Rebinds only fire while Remote Desktop is frontmost (client-mode Tier-1 scope).
const RDP_BUNDLE_RE: &str = "^com\\.microsoft\\.rdc";

pub trait RebindEngine: Send + Sync {
    fn status(&self) -> EngineStatus;
    /// Make `profile` the live rebind set. `force` bypasses the no-op guard and
    /// always rewrites (triggering a Karabiner reload) — used at launch to reset
    /// state and release any stuck keys from a previous session.
    fn apply(&self, profile: &Profile, force: bool, scoped: bool) -> Result<(), String>;
    /// Remove all our rebinds (disarm).
    fn clear(&self) -> Result<(), String>;
}

/// Pick the engine for this platform/install. Falls back to [`NoopEngine`] when
/// no native engine is available, so the app stays fully usable for editing.
pub fn detect_engine() -> Box<dyn RebindEngine> {
    #[cfg(target_os = "macos")]
    {
        if karabiner_installed() {
            return Box::new(KarabinerEngine::new());
        }
    }
    Box::new(NoopEngine)
}

/// No engine wired — the UI/config still works; rebinds simply don't fire.
pub struct NoopEngine;

impl RebindEngine for NoopEngine {
    fn status(&self) -> EngineStatus {
        EngineStatus {
            kind: "none".into(),
            installed: false,
            healthy: false,
            detail: if cfg!(target_os = "macos") {
                "No engine installed. RemoteKeyboard drives the Karabiner DriverKit virtual-HID \
                 driver to reach Remote Desktop — install Karabiner-Elements (publisher: pqrs.org)."
                    .into()
            } else {
                "Native engine not available on this platform yet.".into()
            },
        }
    }
    fn apply(&self, _profile: &Profile, _force: bool, _scoped: bool) -> Result<(), String> {
        Ok(())
    }
    fn clear(&self) -> Result<(), String> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// macOS — live Karabiner injection.
// ---------------------------------------------------------------------------

pub struct KarabinerEngine {
    config_path: PathBuf,
    last_error: Mutex<Option<String>>,
}

impl KarabinerEngine {
    pub fn new() -> Self {
        Self {
            config_path: karabiner_config_path(),
            last_error: Mutex::new(None),
        }
    }

    /// The tagged, RDP-scoped complex-modification rules for one profile.
    /// Public + pure for unit tests / previews.
    pub fn build_rules(profile: &Profile, scoped: bool) -> Vec<Value> {
        profile
            .mappings
            .iter()
            .filter(|m| !m.input.is_empty())
            .filter_map(|m| manipulator_rule(m, scoped))
            .collect()
    }

    fn record_result(&self, res: Result<(), String>) -> Result<(), String> {
        *self.last_error.lock().unwrap() = res.as_ref().err().cloned();
        res
    }

    fn read_config(&self) -> Result<Value, String> {
        let body = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("couldn't read karabiner.json: {e}"))?;
        serde_json::from_str(&body).map_err(|e| format!("couldn't parse karabiner.json: {e}"))
    }

    /// Atomic write: serialize to a sibling temp file, then rename over the
    /// target. A crash/kill mid-write leaves the original karabiner.json intact.
    fn write_config(&self, root: &Value) -> Result<(), String> {
        let out = serde_json::to_string_pretty(root).map_err(|e| e.to_string())?;
        let tmp = self.config_path.with_extension("rk-tmp");
        fs::write(&tmp, out.as_bytes()).map_err(|e| format!("couldn't write temp config: {e}"))?;
        fs::rename(&tmp, &self.config_path)
            .map_err(|e| format!("couldn't replace karabiner.json: {e}"))
    }
}

impl RebindEngine for KarabinerEngine {
    fn status(&self) -> EngineStatus {
        let installed = karabiner_installed();
        let running = grabber_running();
        let err = self.last_error.lock().unwrap().clone();
        let healthy = installed && running && err.is_none();
        let detail = if let Some(e) = err {
            format!("Engine error: {e}")
        } else if !installed {
            "No engine installed.".into()
        } else if !running {
            "Karabiner-Elements is installed but not running — open it (or enable it in Login \
             Items) so rebinds can apply."
                .into()
        } else {
            "Live — rebinds are injected into your active Karabiner profile and scoped to Remote \
             Desktop. (Text output is best-effort via paste.)"
                .into()
        };
        EngineStatus {
            kind: "karabiner".into(),
            installed,
            healthy,
            detail,
        }
    }

    fn apply(&self, profile: &Profile, force: bool, scoped: bool) -> Result<(), String> {
        let res = (|| {
            if !self.config_path.exists() {
                return Err(
                    "Karabiner isn't configured yet — launch Karabiner-Elements once, then re-arm."
                        .into(),
                );
            }
            let mut root = self.read_config()?;
            let want = Self::build_rules(profile, scoped);

            let profiles = root
                .get_mut("profiles")
                .and_then(Value::as_array_mut)
                .ok_or("karabiner.json has no \"profiles\" array")?;
            if profiles.is_empty() {
                return Err("no Karabiner profiles found".into());
            }
            let idx = profiles
                .iter()
                .position(|p| p.get("selected").and_then(Value::as_bool).unwrap_or(false))
                .unwrap_or(0);

            // No-op guard: skip the write (and Karabiner reload) if our rules are
            // already exactly `want` in the selected profile and nowhere else.
            // `force` bypasses it to guarantee a clean reload (stuck-key recovery).
            let current_here: Vec<Value> = ours(&profiles[idx]);
            let others_have_ours = profiles
                .iter()
                .enumerate()
                .any(|(i, p)| i != idx && has_ours(p));
            if !force && current_here == want && !others_have_ours {
                return Ok(());
            }

            // Strip our old rules from every profile, then add fresh to the active one.
            for p in profiles.iter_mut() {
                if let Some(rules) = existing_rules_mut(p) {
                    rules.retain(|r| !is_ours(r));
                }
            }
            rules_mut(&mut profiles[idx])?.extend(want);

            self.write_config(&root)
        })();
        self.record_result(res)
    }

    fn clear(&self) -> Result<(), String> {
        let res = (|| {
            if !self.config_path.exists() {
                return Ok(());
            }
            let mut root = self.read_config()?;
            let mut changed = false;
            if let Some(profiles) = root.get_mut("profiles").and_then(Value::as_array_mut) {
                for p in profiles.iter_mut() {
                    if let Some(rules) = existing_rules_mut(p) {
                        let before = rules.len();
                        rules.retain(|r| !is_ours(r));
                        changed |= rules.len() != before;
                    }
                }
            }
            if changed {
                self.write_config(&root)?;
            }
            Ok(())
        })();
        self.record_result(res)
    }
}

// ---------------------------------------------------------------------------
// karabiner.json helpers (operate on serde_json::Value, preserving unknowns)
// ---------------------------------------------------------------------------

fn is_ours(rule: &Value) -> bool {
    rule.get("description")
        .and_then(Value::as_str)
        .map(|d| d.starts_with(RULE_TAG))
        .unwrap_or(false)
}

fn has_ours(profile: &Value) -> bool {
    profile
        .get("complex_modifications")
        .and_then(|c| c.get("rules"))
        .and_then(Value::as_array)
        .map(|rs| rs.iter().any(is_ours))
        .unwrap_or(false)
}

fn ours(profile: &Value) -> Vec<Value> {
    profile
        .get("complex_modifications")
        .and_then(|c| c.get("rules"))
        .and_then(Value::as_array)
        .map(|rs| rs.iter().filter(|r| is_ours(r)).cloned().collect())
        .unwrap_or_default()
}

fn existing_rules_mut(profile: &mut Value) -> Option<&mut Vec<Value>> {
    profile
        .get_mut("complex_modifications")?
        .get_mut("rules")?
        .as_array_mut()
}

/// Ensure `profile.complex_modifications.rules` exists as an array and return it.
/// Only synthesizes the containers when genuinely absent; if the user's config
/// has them as some other type, bail with an error rather than clobbering it.
fn rules_mut(profile: &mut Value) -> Result<&mut Vec<Value>, String> {
    let obj = profile
        .as_object_mut()
        .ok_or("selected Karabiner profile is not a JSON object")?;
    let cm = obj
        .entry("complex_modifications")
        .or_insert_with(|| json!({}));
    if !cm.is_object() {
        return Err("selected profile's complex_modifications is not an object".into());
    }
    let rules = cm
        .as_object_mut()
        .unwrap()
        .entry("rules")
        .or_insert_with(|| json!([]));
    if !rules.is_array() {
        return Err("selected profile's complex_modifications.rules is not an array".into());
    }
    Ok(rules.as_array_mut().unwrap())
}

// ---------------------------------------------------------------------------
// Rule generation
// ---------------------------------------------------------------------------

/// The single tagged rule (possibly multiple manipulators) for one mapping.
fn manipulator_rule(m: &Mapping, scoped: bool) -> Option<Value> {
    let manipulators = manipulators_for(m, scoped);
    if manipulators.is_empty() {
        return None;
    }
    Some(json!({
        "description": format!("{RULE_TAG} {}", describe(m)),
        "manipulators": manipulators,
    }))
}

/// Build the `from → to` manipulators for a mapping. A modifier-only input maps
/// **both physical sides** (left+right), side-preserved, so pressing left OR
/// right Command triggers it.
fn manipulators_for(m: &Mapping, scoped: bool) -> Vec<Value> {
    let to = match to_spec(m) {
        Some(t) => t,
        None => return vec![],
    };
    let (in_mods, in_key) = split_tokens(&m.input);

    // Input has a base key → one manipulator; modifiers are side-agnostic
    // (generic `command`/`option`/… so either physical key qualifies).
    if let Some(key) = in_key {
        let mandatory: Vec<&str> = in_mods.iter().filter_map(|t| mandatory_modifier(t)).collect();
        let from = json!({
            "key_code": key,
            "modifiers": { "mandatory": mandatory, "optional": ["caps_lock"] },
        });
        return vec![manipulator(from, resolve_to(&to, 0), scoped)];
    }

    if in_mods.is_empty() {
        return vec![];
    }

    // Single modifier remapped on its own → one manipulator per physical side.
    if in_mods.len() == 1 {
        let sides = modifier_sides(&in_mods[0]);
        return sides
            .iter()
            .enumerate()
            .map(|(i, side)| {
                let from = json!({
                    "key_code": side,
                    "modifiers": { "mandatory": [], "optional": ["any"] },
                });
                manipulator(from, resolve_to(&to, i), scoped)
            })
            .collect();
    }

    // Several modifiers, no base key → last is the key (left variant), rest mandatory.
    let key = match output_modifier(in_mods.last().unwrap()) {
        Some(k) => k,
        None => return vec![],
    };
    let mandatory: Vec<&str> = in_mods[..in_mods.len() - 1]
        .iter()
        .filter_map(|t| mandatory_modifier(t))
        .collect();
    let from = json!({
        "key_code": key,
        "modifiers": { "mandatory": mandatory, "optional": ["any"] },
    });
    vec![manipulator(from, resolve_to(&to, 0), scoped)]
}

fn manipulator(from: Value, to: Value, scoped: bool) -> Value {
    let mut m = json!({ "type": "basic", "from": from, "to": to });
    if scoped {
        // Both must hold: the client is frontmost (fail-safe — a stale variable
        // can never leak the rebind outside the app) AND a live *session window*
        // is focused (set by our own window watcher, since Karabiner can't match
        // window titles).
        m["conditions"] = json!([
            { "type": "frontmost_application_if", "bundle_identifiers": [RDP_BUNDLE_RE] },
            { "type": "variable_if", "name": crate::scope::SESSION_VAR, "value": 1 }
        ]);
    }
    m
}

/// How the output is emitted. `ModifierSides` pairs left↔left / right↔right with
/// a modifier-only input so a swap preserves the side you pressed.
enum ToSpec {
    Fixed(Value),
    ModifierSides(Vec<&'static str>),
}

fn to_spec(m: &Mapping) -> Option<ToSpec> {
    match m.output_mode {
        OutputMode::Text => {
            if m.text.is_empty() {
                return None;
            }
            Some(ToSpec::Fixed(json!([{ "shell_command": paste_command(&m.text) }])))
        }
        OutputMode::Keys => {
            let (mods, key) = split_tokens(&m.output);
            if let Some(k) = key {
                let out_mods: Vec<&str> = mods.iter().filter_map(|t| output_modifier(t)).collect();
                Some(ToSpec::Fixed(json!([{ "key_code": k, "modifiers": out_mods }])))
            } else if mods.len() == 1 {
                Some(ToSpec::ModifierSides(modifier_sides(&mods[0])))
            } else if !mods.is_empty() {
                let key = output_modifier(mods.last().unwrap())?;
                let rest: Vec<&str> = mods[..mods.len() - 1]
                    .iter()
                    .filter_map(|t| output_modifier(t))
                    .collect();
                Some(ToSpec::Fixed(json!([{ "key_code": key, "modifiers": rest }])))
            } else {
                None
            }
        }
    }
}

fn resolve_to(spec: &ToSpec, side: usize) -> Value {
    match spec {
        ToSpec::Fixed(v) => v.clone(),
        ToSpec::ModifierSides(sides) => {
            let code = sides.get(side).or_else(|| sides.last()).copied().unwrap_or("left_command");
            json!([{ "key_code": code }])
        }
    }
}

/// Split tokens into modifier tokens and (at most one) base key_code.
fn split_tokens(tokens: &[String]) -> (Vec<String>, Option<String>) {
    let mut mods = Vec::new();
    let mut key = None;
    for t in tokens {
        if is_modifier_token(t) {
            mods.push(t.clone());
        } else if let Some(k) = key_code(t) {
            key = Some(k);
        }
    }
    (mods, key)
}

fn is_modifier_token(token: &str) -> bool {
    mandatory_modifier(token).is_some()
}

/// Generic modifier name for `from.modifiers.mandatory` — matches either side.
fn mandatory_modifier(token: &str) -> Option<&'static str> {
    Some(match token {
        "Meta" => "command",
        "Control" => "control",
        "Alt" => "option",
        "AltGr" => "right_option",
        "Shift" => "shift",
        _ => return None,
    })
}

/// Specific (left) modifier name for emission in `to` (Karabiner needs a side).
fn output_modifier(token: &str) -> Option<&'static str> {
    Some(match token {
        "Meta" => "left_command",
        "Control" => "left_control",
        "Alt" => "left_option",
        "AltGr" => "right_option",
        "Shift" => "left_shift",
        _ => return None,
    })
}

/// Both physical sides of a modifier, used when it's the key being remapped.
fn modifier_sides(token: &str) -> Vec<&'static str> {
    match token {
        "Meta" => vec!["left_command", "right_command"],
        "Control" => vec!["left_control", "right_control"],
        "Alt" => vec!["left_option", "right_option"],
        "AltGr" => vec!["right_option"],
        "Shift" => vec!["left_shift", "right_shift"],
        _ => vec![],
    }
}

/// Map a canonical key token to a Karabiner `key_code`.
fn key_code(token: &str) -> Option<String> {
    let code = match token {
        "Space" => "spacebar",
        "Return" | "Enter" => "return_or_enter",
        "Tab" => "tab",
        "Delete" | "Backspace" => "delete_or_backspace",
        "ForwardDelete" => "delete_forward",
        "Escape" | "Esc" => "escape",
        "Up" => "up_arrow",
        "Down" => "down_arrow",
        "Left" => "left_arrow",
        "Right" => "right_arrow",
        "Home" => "home",
        "End" => "end",
        "PageUp" => "page_up",
        "PageDown" => "page_down",
        "Insert" => "insert",
        "Menu" => "application",
        "PrintScreen" => "print_screen",
        "ScrollLock" => "scroll_lock",
        "Pause" => "pause",
        "NumLock" => "keypad_num_lock",
        s if s.len() == 1 && s.chars().next().unwrap().is_ascii_alphabetic() => {
            return Some(s.to_ascii_lowercase());
        }
        s if s.len() == 1 && s.chars().next().unwrap().is_ascii_digit() => {
            return Some(s.to_string());
        }
        s if s.starts_with('F') && s.len() > 1 && s[1..].chars().all(|c| c.is_ascii_digit()) => {
            return Some(s.to_ascii_lowercase());
        }
        _ => return None,
    };
    Some(code.to_string())
}

fn describe(m: &Mapping) -> String {
    let from = m.input.join("+");
    let to = match m.output_mode {
        OutputMode::Keys => m.output.join("+"),
        OutputMode::Text => format!("\"{}\"", m.text),
    };
    format!("{from} → {to}")
}

fn paste_command(text: &str) -> String {
    format!(
        "printf %s {} | pbcopy && osascript -e 'tell application \"System Events\" to keystroke \"v\" using command down'",
        shell_quote(text)
    )
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

// ---------------------------------------------------------------------------
// Install / process detection
// ---------------------------------------------------------------------------

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn karabiner_config_path() -> PathBuf {
    home().join(".config/karabiner/karabiner.json")
}

#[cfg(target_os = "macos")]
fn karabiner_installed() -> bool {
    std::path::Path::new("/Applications/Karabiner-Elements.app").exists()
        || home().join(".config/karabiner").exists()
}
#[cfg(not(target_os = "macos"))]
fn karabiner_installed() -> bool {
    false
}

/// Is Karabiner active (so our injected rules actually apply)? The grabber is
/// the enforcer, but we also accept the console-user-server / app processes so
/// this stays robust across Karabiner versions.
#[cfg(target_os = "macos")]
fn grabber_running() -> bool {
    ["karabiner_grabber", "karabiner_console_user_server", "Karabiner-Elements"]
        .iter()
        .any(|name| {
            std::process::Command::new("pgrep")
                .arg("-x")
                .arg(name)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        })
}
#[cfg(not(target_os = "macos"))]
fn grabber_running() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Mapping, OutputMode, Profile};

    fn keys(id: &str, input: &[&str], output: &[&str]) -> Mapping {
        Mapping {
            id: id.into(),
            input: input.iter().map(|s| s.to_string()).collect(),
            output_mode: OutputMode::Keys,
            output: output.iter().map(|s| s.to_string()).collect(),
            text: String::new(),
        }
    }
    fn profile(mappings: Vec<Mapping>) -> Profile {
        Profile { id: "p".into(), name: "P".into(), universal: false, match_rules: vec![], mappings }
    }

    #[test]
    fn cmd_opt_swap_covers_both_sides_preserving_side() {
        let rules = KarabinerEngine::build_rules(&profile(vec![
            keys("1", &["Meta"], &["Alt"]),
            keys("2", &["Alt"], &["Meta"]),
        ]), true);
        assert_eq!(rules.len(), 2);
        let m = rules[0]["manipulators"].as_array().unwrap();
        assert_eq!(m.len(), 2, "modifier-only remap should cover left + right");
        assert_eq!(m[0]["from"]["key_code"], "left_command");
        assert_eq!(m[0]["to"][0]["key_code"], "left_option");
        assert_eq!(m[1]["from"]["key_code"], "right_command");
        assert_eq!(m[1]["to"][0]["key_code"], "right_option");
        // RDP-scoped
        assert_eq!(
            m[0]["conditions"][0]["type"], "frontmost_application_if",
            "rebinds must be scoped to Remote Desktop"
        );
        assert!(rules[0]["description"].as_str().unwrap().starts_with(RULE_TAG));
    }

    #[test]
    fn combo_uses_generic_mandatory_modifier() {
        let rules = KarabinerEngine::build_rules(&profile(vec![keys("1", &["Meta", "W"], &["Control", "W"])]), true);
        let m = &rules[0]["manipulators"][0];
        assert_eq!(m["from"]["key_code"], "w");
        assert_eq!(m["from"]["modifiers"]["mandatory"][0], "command"); // either side
        assert_eq!(m["to"][0]["key_code"], "w");
        assert_eq!(m["to"][0]["modifiers"][0], "left_control");
    }

    #[test]
    fn empty_input_yields_no_rule() {
        assert!(KarabinerEngine::build_rules(&profile(vec![keys("1", &[], &["Control"])]), true).is_empty());
    }
}
