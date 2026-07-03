//! Application state: the persisted [`Config`], the ephemeral [`Runtime`], and
//! the active [`RebindEngine`]. The config file *is* the import/export artifact.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::engine::{detect_engine, RebindEngine};
use crate::model::*;

pub struct AppState {
    pub config: Mutex<Config>,
    pub runtime: Mutex<Runtime>,
    pub engine: Box<dyn RebindEngine>,
    pub config_path: PathBuf,
}

impl AppState {
    /// Load from disk (running migrations) or seed defaults on first run.
    pub fn load(config_path: PathBuf) -> Self {
        let engine = detect_engine();
        let config = read_config(&config_path).unwrap_or_else(default_config);
        let runtime = Runtime {
            scope_active: false,
            frontmost_bundle: String::new(),
            frontmost_name: "—".into(),
            secure_input: false,
            permissions: crate::permissions::check(),
            engine: engine.status(),
            log: Vec::new(),
        };
        AppState {
            config: Mutex::new(config),
            runtime: Mutex::new(runtime),
            engine,
            config_path,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            config: self.config.lock().unwrap().clone(),
            runtime: self.runtime.lock().unwrap().clone(),
            platform: std::env::consts::OS.to_string(),
        }
    }

    /// The profile that is currently effective (a manual pin overrides the
    /// active selection).
    pub fn effective_profile(&self) -> Option<Profile> {
        let cfg = self.config.lock().unwrap();
        let id = cfg
            .pinned_profile_id
            .clone()
            .unwrap_or_else(|| cfg.active_profile_id.clone());
        cfg.profiles.iter().find(|p| p.id == id).cloned()
    }

    fn persist(&self) {
        let cfg = self.config.lock().unwrap();
        if let Some(parent) = self.config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(body) = serde_json::to_string_pretty(&*cfg) {
            let _ = std::fs::write(&self.config_path, body);
        }
    }

    /// Re-derive engine status and push it into the runtime mirror.
    fn refresh_engine(&self) {
        let mut rt = self.runtime.lock().unwrap();
        rt.engine = self.engine.status();
    }

    /// Push the current state to the engine at launch (inject rules if armed).
    pub fn startup(&self) {
        self.sync_engine();
        self.refresh_engine();
    }

    /// Best-effort: hand the effective profile to the engine (or clear it when
    /// disarmed). Errors are swallowed here — surfaced via engine status.
    fn sync_engine(&self) {
        let armed = self.config.lock().unwrap().armed;
        let result = match (armed, self.effective_profile()) {
            (true, Some(p)) => self.engine.apply(&p),
            // Disarmed, or armed with no resolvable profile → clear (never leave
            // stale rules injected, and don't misreport "live").
            _ => self.engine.clear(),
        };
        let _ = result;
    }
}

/// Persist, re-sync the engine, and broadcast a fresh snapshot to every window.
/// Call this after any mutation.
pub fn commit(app: &AppHandle, state: &AppState) {
    state.persist();
    state.sync_engine();
    state.refresh_engine();
    let _ = app.emit("snapshot", state.snapshot());
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn read_config(path: &PathBuf) -> Option<Config> {
    let body = std::fs::read_to_string(path).ok()?;
    let mut cfg: Config = serde_json::from_str(&body).ok()?;
    migrate(&mut cfg);
    Some(cfg)
}

/// Forward-migrate older configs. No-op today (only schema v1 exists), but the
/// seam is in place so the import/export artifact stays portable.
fn migrate(cfg: &mut Config) {
    if cfg.schema_version < SCHEMA_VERSION {
        cfg.schema_version = SCHEMA_VERSION;
    }
}

/// First-run defaults: a Universal fallback plus an empty `Work-PC` profile.
/// No rebinds are seeded — the user adds their own (or opts into the starter
/// set from onboarding / the empty state).
pub fn default_config() -> Config {
    let universal = Profile {
        id: new_id(),
        name: "Universal".into(),
        universal: true,
        match_rules: vec![],
        mappings: vec![],
    };
    let work = Profile {
        id: new_id(),
        name: "Work-PC".into(),
        universal: false,
        match_rules: vec![MatchRule {
            id: new_id(),
            kind: RuleKind::Contains,
            value: "WORK-PC".into(),
        }],
        // Start empty — no rebinds until the user adds them (or opts into the
        // starter set from onboarding / the empty state).
        mappings: vec![],
    };
    let active = work.id.clone();
    Config {
        schema_version: SCHEMA_VERSION,
        mode: Mode::Client,
        onboarded: false,
        armed: true,
        debug: false,
        active_profile_id: active,
        pinned_profile_id: None,
        universal_fallback: true,
        profiles: vec![universal, work],
    }
}

/// The starter set: common Mac ⌘-shortcuts remapped to their Windows
/// ⌃-equivalents (the shortcuts that don't survive the RDP hop from a Mac).
pub fn starter_mappings() -> Vec<Mapping> {
    fn keys(input: &[&str], output: &[&str]) -> Mapping {
        Mapping {
            id: new_id(),
            input: input.iter().map(|s| s.to_string()).collect(),
            output_mode: OutputMode::Keys,
            output: output.iter().map(|s| s.to_string()).collect(),
            text: String::new(),
        }
    }
    vec![
        keys(&["Meta", "C"], &["Control", "C"]),
        keys(&["Meta", "V"], &["Control", "V"]),
        keys(&["Meta", "X"], &["Control", "X"]),
        keys(&["Meta", "A"], &["Control", "A"]),
        keys(&["Meta", "Z"], &["Control", "Z"]),
        keys(&["Meta", "W"], &["Control", "W"]),
    ]
}
