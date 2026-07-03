//! macOS privacy-permission checks and prompts.
//!
//! For the rebind pipeline to work the app needs **Accessibility** (observe /
//! control input) and **Input Monitoring** (read keystrokes). Granting only
//! *sticks* to a stable code identity — in `tauri dev` you're granting the debug
//! binary; for a real test build the app (`npm run tauri build`) and grant the
//! bundled `.app`.
//!
//! Note: even with both granted, rebinds fire only once the native injection
//! engine is present — see `engine.rs`.

use crate::model::Permissions;

pub fn check() -> Permissions {
    Permissions {
        accessibility: accessibility_trusted(),
        input_monitoring: input_monitoring_granted(),
    }
}

/// Trigger the system Accessibility prompt (also registers the app in the list).
pub fn prompt_accessibility() {
    #[cfg(target_os = "macos")]
    {
        let _ = macos_accessibility_client::accessibility::application_is_trusted_with_prompt();
    }
}

/// Trigger the system Input Monitoring prompt.
pub fn prompt_input_monitoring() {
    #[cfg(target_os = "macos")]
    {
        let _ = mac_hid::request();
    }
}

fn accessibility_trusted() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_accessibility_client::accessibility::application_is_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

fn input_monitoring_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        mac_hid::granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
mod mac_hid {
    // IOHIDCheckAccess / IOHIDRequestAccess (IOKit, macOS 10.15+).
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDCheckAccess(request: u32) -> u32;
        fn IOHIDRequestAccess(request: u32) -> u8;
    }

    const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    const K_IOHID_ACCESS_TYPE_GRANTED: u32 = 0;

    pub fn granted() -> bool {
        unsafe { IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) == K_IOHID_ACCESS_TYPE_GRANTED }
    }

    pub fn request() -> bool {
        unsafe { IOHIDRequestAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) != 0 }
    }
}
