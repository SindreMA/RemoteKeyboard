//! Tauri commands — the IPC surface shared by the popover and main windows.
//! Every mutation ends in [`commit`], which persists, re-syncs the engine, and
//! broadcasts a fresh `snapshot` event so all windows stay in lockstep.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::model::*;
use crate::store::{commit, new_id, starter_mappings, AppState};

type R<T> = Result<T, String>;

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Snapshot {
    state.snapshot()
}

// --- simple toggles ---------------------------------------------------------

#[tauri::command]
pub fn set_armed(app: AppHandle, state: State<'_, AppState>, armed: bool) {
    state.config.lock().unwrap().armed = armed;
    commit(&app, &state);
}

#[tauri::command]
pub fn set_debug(app: AppHandle, state: State<'_, AppState>, debug: bool) {
    state.config.lock().unwrap().debug = debug;
    commit(&app, &state);
}

#[tauri::command]
pub fn set_mode(app: AppHandle, state: State<'_, AppState>, mode: Mode) {
    state.config.lock().unwrap().mode = mode;
    commit(&app, &state);
}

#[tauri::command]
pub fn set_onboarded(app: AppHandle, state: State<'_, AppState>, onboarded: bool) {
    state.config.lock().unwrap().onboarded = onboarded;
    commit(&app, &state);
}

#[tauri::command]
pub fn set_universal_fallback(app: AppHandle, state: State<'_, AppState>, enabled: bool) {
    state.config.lock().unwrap().universal_fallback = enabled;
    commit(&app, &state);
}

#[tauri::command]
pub fn set_active_profile(app: AppHandle, state: State<'_, AppState>, id: String) {
    {
        let mut cfg = state.config.lock().unwrap();
        if cfg.profiles.iter().any(|p| p.id == id) {
            cfg.active_profile_id = id;
        }
    }
    commit(&app, &state);
}

#[tauri::command]
pub fn set_pinned(app: AppHandle, state: State<'_, AppState>, id: Option<String>) {
    {
        let mut cfg = state.config.lock().unwrap();
        // Only pin a profile that actually exists (a dangling pin would silently
        // disarm the engine); otherwise clear the pin.
        let valid = id
            .as_ref()
            .is_some_and(|pid| cfg.profiles.iter().any(|p| &p.id == pid));
        cfg.pinned_profile_id = if valid { id } else { None };
    }
    commit(&app, &state);
}

// --- profiles ---------------------------------------------------------------

#[tauri::command]
pub fn add_profile(app: AppHandle, state: State<'_, AppState>, name: String) -> String {
    let id = new_id();
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.profiles.push(Profile {
            id: id.clone(),
            name: if name.trim().is_empty() {
                "New profile".into()
            } else {
                name
            },
            universal: false,
            match_rules: vec![],
            mappings: vec![],
        });
        cfg.active_profile_id = id.clone();
    }
    commit(&app, &state);
    id
}

#[tauri::command]
pub fn rename_profile(app: AppHandle, state: State<'_, AppState>, id: String, name: String) {
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == id) {
            p.name = name;
        }
    }
    commit(&app, &state);
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, state: State<'_, AppState>, id: String) -> R<()> {
    {
        let mut cfg = state.config.lock().unwrap();
        // Never delete the last profile or the universal fallback.
        if cfg.profiles.len() <= 1 {
            return Err("Cannot delete the last profile.".into());
        }
        if cfg.profiles.iter().find(|p| p.id == id).is_some_and(|p| p.universal) {
            return Err("The Universal fallback profile cannot be deleted.".into());
        }
        cfg.profiles.retain(|p| p.id != id);
        if cfg.active_profile_id == id {
            cfg.active_profile_id = cfg.profiles[0].id.clone();
        }
        if cfg.pinned_profile_id.as_deref() == Some(id.as_str()) {
            cfg.pinned_profile_id = None;
        }
    }
    commit(&app, &state);
    Ok(())
}

// --- match rules ------------------------------------------------------------

#[tauri::command]
pub fn add_match_rule(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    kind: RuleKind,
    value: String,
) -> String {
    let id = new_id();
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            p.match_rules.push(MatchRule {
                id: id.clone(),
                kind,
                value,
            });
        }
    }
    commit(&app, &state);
    id
}

#[tauri::command]
pub fn delete_match_rule(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    rule_id: String,
) {
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            p.match_rules.retain(|r| r.id != rule_id);
        }
    }
    commit(&app, &state);
}

// --- mappings ---------------------------------------------------------------

#[tauri::command]
pub fn add_mapping(app: AppHandle, state: State<'_, AppState>, profile_id: String) -> String {
    let id = new_id();
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            p.mappings.push(Mapping {
                id: id.clone(),
                input: vec![],
                output_mode: OutputMode::Keys,
                output: vec![],
                text: String::new(),
            });
        }
    }
    commit(&app, &state);
    id
}

#[tauri::command]
pub fn update_mapping(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    mapping: Mapping,
) {
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            if let Some(m) = p.mappings.iter_mut().find(|m| m.id == mapping.id) {
                *m = mapping;
            }
        }
    }
    commit(&app, &state);
}

#[tauri::command]
pub fn delete_mapping(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
    mapping_id: String,
) {
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            p.mappings.retain(|m| m.id != mapping_id);
        }
    }
    commit(&app, &state);
}

#[tauri::command]
pub fn load_starter(app: AppHandle, state: State<'_, AppState>, profile_id: String) {
    {
        let mut cfg = state.config.lock().unwrap();
        if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
            p.mappings = starter_mappings();
        }
    }
    commit(&app, &state);
}

// --- import / export --------------------------------------------------------

#[tauri::command]
pub fn export_config_to(state: State<'_, AppState>, path: String) -> R<()> {
    let cfg = state.config.lock().unwrap().clone();
    let body = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, body).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_config_from(app: AppHandle, state: State<'_, AppState>, path: String) -> R<()> {
    let body = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut imported: Config =
        serde_json::from_str(&body).map_err(|e| format!("Not a valid RemoteKeyboard config: {e}"))?;
    if imported.profiles.is_empty() {
        return Err("Config contains no profiles.".into());
    }
    imported.schema_version = SCHEMA_VERSION;
    if !imported.profiles.iter().any(|p| p.id == imported.active_profile_id) {
        imported.active_profile_id = imported.profiles[0].id.clone();
    }
    // Drop a dangling pin (e.g. an import whose pinned profile was deleted
    // elsewhere) rather than silently disarming with no effective profile.
    if let Some(pid) = imported.pinned_profile_id.clone() {
        if !imported.profiles.iter().any(|p| p.id == pid) {
            imported.pinned_profile_id = None;
        }
    }
    *state.config.lock().unwrap() = imported;
    commit(&app, &state);
    Ok(())
}

// --- scope / windows / system ----------------------------------------------

/// Re-read the frontmost app (macOS) and update scope status. Cheap enough to
/// poll while the Connection panel is open.
#[tauri::command]
pub fn refresh_scope(app: AppHandle, state: State<'_, AppState>) -> Snapshot {
    #[cfg(target_os = "macos")]
    {
        if let Some((bundle, name)) = frontmost_app() {
            let active = bundle.starts_with("com.microsoft.rdc");
            let mut rt = state.runtime.lock().unwrap();
            rt.frontmost_bundle = bundle;
            rt.frontmost_name = name;
            rt.scope_active = active;
        }
    }
    let snap = state.snapshot();
    let _ = app.emit("snapshot", snap.clone());
    snap
}

#[cfg(target_os = "macos")]
fn frontmost_app() -> Option<(String, String)> {
    let script = r#"tell application "System Events"
set p to first application process whose frontmost is true
return (bundle identifier of p) & "|" & (name of p)
end tell"#;
    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    let s = s.trim();
    let (bundle, name) = s.split_once('|')?;
    Some((bundle.to_string(), name.to_string()))
}

#[tauri::command]
pub fn open_main(app: AppHandle) {
    crate::window::show_main(&app);
}

#[tauri::command]
pub fn hide_popover(app: AppHandle) {
    if let Some(w) = app.get_webview_window("popover") {
        let _ = w.hide();
    }
}

// --- permissions ------------------------------------------------------------

fn refresh_permissions_emit(app: &AppHandle, state: &AppState) -> Snapshot {
    {
        let mut rt = state.runtime.lock().unwrap();
        rt.permissions = crate::permissions::check();
        // Re-derive engine status too, so "Live" flips as soon as Karabiner is up.
        rt.engine = state.engine.status();
    }
    let snap = state.snapshot();
    let _ = app.emit("snapshot", snap.clone());
    snap
}

/// Re-read the OS permission state and broadcast it. Cheap to poll.
#[tauri::command]
pub fn check_permissions(app: AppHandle, state: State<'_, AppState>) -> Snapshot {
    refresh_permissions_emit(&app, &state)
}

/// Show the system Accessibility prompt (registers the app), then re-check.
#[tauri::command]
pub fn request_accessibility(app: AppHandle, state: State<'_, AppState>) -> Snapshot {
    crate::permissions::prompt_accessibility();
    refresh_permissions_emit(&app, &state)
}

/// Show the system Input Monitoring prompt, then re-check.
#[tauri::command]
pub fn request_input_monitoring(app: AppHandle, state: State<'_, AppState>) -> Snapshot {
    crate::permissions::prompt_input_monitoring();
    refresh_permissions_emit(&app, &state)
}

#[tauri::command]
pub fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

#[tauri::command]
pub fn open_input_monitoring_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn();
    }
}

/// Open an external URL (e.g. the Karabiner download page) in the browser.
#[tauri::command]
pub fn open_url(url: String) {
    let _ = std::process::Command::new("open").arg(&url).spawn();
}

/// Launch Karabiner-Elements (starts its background services so injected rules
/// go live). The status poll flips to "Live" once it's up.
#[tauri::command]
pub fn start_karabiner() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-a", "Karabiner-Elements"])
            .spawn();
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle, state: State<'_, AppState>) {
    // Remove our injected rebinds so nothing lingers after we're gone.
    let _ = state.engine.clear();
    app.exit(0);
}
