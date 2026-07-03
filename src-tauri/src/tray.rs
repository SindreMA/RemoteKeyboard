//! Menubar/system-tray icon: a left click toggles the popover (positioned under
//! the icon); the context menu offers "Open RemoteKeyboard" and "Quit".

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition,
};

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", "Open RemoteKeyboard", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit RemoteKeyboard", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open_i, &sep, &quit_i])?;

    // Monochrome template glyph — macOS tints it for light/dark menubars.
    let icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("rk-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("RemoteKeyboard")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => crate::window::show_main(app),
            "quit" => {
                if let Some(state) = app.try_state::<crate::store::AppState>() {
                    let _ = state.engine.clear();
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                let Some(win) = app.get_webview_window("popover") else {
                    return;
                };
                if win.is_visible().unwrap_or(false) {
                    let _ = win.hide();
                    return;
                }
                // Center the popover under the tray icon, just below the menubar.
                let scale = win.scale_factor().unwrap_or(1.0);
                let pos = rect.position.to_physical::<f64>(scale);
                let size = rect.size.to_physical::<f64>(scale);
                let win_w = win.outer_size().map(|s| s.width as f64).unwrap_or(332.0 * scale);
                let x = pos.x + size.width / 2.0 - win_w / 2.0;
                let y = pos.y + size.height + 6.0 * scale;
                let _ = win.set_position(PhysicalPosition::new(
                    x.max(8.0).round() as i32,
                    y.round() as i32,
                ));
                let _ = win.show();
                let _ = win.set_focus();
            }
        })
        .build(app)?;
    Ok(())
}
