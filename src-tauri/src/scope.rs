//! Window-level scoping.
//!
//! Karabiner can only condition on the frontmost *application*, which is too
//! coarse: Windows App's connection-center window is the same app as a live
//! remote session. So we detect the focused window ourselves and publish the
//! result as a Karabiner **variable** (`rk_rdp_session`), which the injected
//! rules gate on — alongside the app condition as a fail-safe.

/// The Karabiner variable our rules gate on.
pub const SESSION_VAR: &str = "rk_rdp_session";

const KARABINER_CLI: &str =
    "/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli";

/// Window titles that belong to the client's own chrome, not a remote session.
const CHROME_TITLES: &[&str] = &[
    "windows app",
    "microsoft remote desktop",
    "connection center",
    "settings",
    "preferences",
    "about",
    "devices",
    "apps",
    "add pc",
    "edit pc",
    "add workspace",
];

#[derive(Clone, Debug, Default)]
pub struct Frontmost {
    pub bundle: String,
    pub app_name: String,
    pub window_title: String,
}

/// The frontmost app + its focused window title (macOS, via Accessibility).
#[cfg(target_os = "macos")]
pub fn frontmost() -> Option<Frontmost> {
    // One AppleScript round-trip returns everything we need. Tab-separated so
    // window titles containing punctuation survive.
    let script = r#"tell application "System Events"
set p to first application process whose frontmost is true
set b to ""
try
set b to bundle identifier of p
end try
set t to ""
try
set t to name of front window of p
end try
return b & tab & (name of p) & tab & t
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
    let mut parts = s.trim_end_matches('\n').split('\t');
    Some(Frontmost {
        bundle: parts.next().unwrap_or_default().to_string(),
        app_name: parts.next().unwrap_or_default().to_string(),
        window_title: parts.next().unwrap_or_default().to_string(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn frontmost() -> Option<Frontmost> {
    None
}

/// Is the frontmost app the Remote Desktop client?
pub fn is_rdp_app(f: &Frontmost) -> bool {
    f.bundle.starts_with("com.microsoft.rdc")
}

/// Is a *live remote session window* focused (as opposed to the connection
/// center / settings)? Session windows are titled after the connection.
pub fn is_session_window(f: &Frontmost) -> bool {
    if !is_rdp_app(f) {
        return false;
    }
    let t = f.window_title.trim();
    if t.is_empty() {
        return false;
    }
    if t.eq_ignore_ascii_case(f.app_name.trim()) {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    !CHROME_TITLES.iter().any(|c| lower == *c)
}

/// Publish the session state to Karabiner. Cheap, but only call it on change.
pub fn set_session_variable(active: bool) {
    if !std::path::Path::new(KARABINER_CLI).exists() {
        return;
    }
    let json = format!("{{\"{}\":{}}}", SESSION_VAR, if active { 1 } else { 0 });
    let _ = std::process::Command::new(KARABINER_CLI)
        .arg("--set-variables")
        .arg(json)
        .output();
}
