//! Window/activation helpers for the menubar-agent lifecycle.
//!
//! RemoteKeyboard runs as a macOS *accessory* app (no Dock icon). When the main
//! window is opened we temporarily promote the app to a regular activation
//! policy so the window can take focus and come to front; when it's hidden we
//! drop back to accessory so the app lives only in the menubar.

use tauri::{AppHandle, Manager};

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        }
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Some(p) = app.get_webview_window("popover") {
        let _ = p.hide();
    }
}

/// Called when the main window is hidden/closed — return to a menubar-only
/// accessory app.
pub fn on_main_hidden(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
    let _ = app;
}
