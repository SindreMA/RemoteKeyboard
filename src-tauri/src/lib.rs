//! RemoteKeyboard — Tauri app entry. The shared cross-platform UI (popover +
//! main window) sits here; the native injection engine lives behind
//! [`engine::RebindEngine`]. See `ARCHITECTURE.md` / `TECH_STACK.md`.

mod commands;
mod engine;
mod model;
mod permissions;
mod store;
mod tray;
mod window;

use tauri::{Manager, WindowEvent};

use store::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolve config path and load state (or seed first-run defaults).
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("resolve app config dir");
            let state = AppState::load(config_dir.join("config.json"));
            let onboarded = state.config.lock().unwrap().onboarded;
            app.manage(state);

            // Inject the active profile's rebinds into Karabiner at launch.
            app.state::<AppState>().startup();

            // Menubar-only agent by default (no Dock icon).
            #[cfg(target_os = "macos")]
            {
                let _ = app
                    .handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            tray::build(app.handle())?;

            // First run → open the main window straight into onboarding.
            if !onboarded {
                window::show_main(app.handle());
            }

            Ok(())
        })
        .on_window_event(|win, event| match event {
            // Closing the main window hides it (keep running in the menubar).
            WindowEvent::CloseRequested { api, .. } if win.label() == "main" => {
                api.prevent_close();
                let _ = win.hide();
                window::on_main_hidden(win.app_handle());
            }
            // The popover dismisses itself when it loses focus (native feel).
            WindowEvent::Focused(false) if win.label() == "popover" => {
                let _ = win.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::set_armed,
            commands::set_debug,
            commands::set_mode,
            commands::set_onboarded,
            commands::set_universal_fallback,
            commands::set_active_profile,
            commands::set_pinned,
            commands::add_profile,
            commands::rename_profile,
            commands::delete_profile,
            commands::add_match_rule,
            commands::delete_match_rule,
            commands::add_mapping,
            commands::update_mapping,
            commands::delete_mapping,
            commands::load_starter,
            commands::export_config_to,
            commands::import_config_from,
            commands::refresh_scope,
            commands::check_permissions,
            commands::request_accessibility,
            commands::request_input_monitoring,
            commands::open_accessibility_settings,
            commands::open_input_monitoring_settings,
            commands::open_url,
            commands::start_karabiner,
            commands::open_main,
            commands::hide_popover,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
