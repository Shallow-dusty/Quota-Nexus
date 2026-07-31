mod clinepass;
mod commands;
mod credential;
mod domain;
mod error;
mod network;
mod ollama;
mod opencode;
mod scheduler;
mod storage;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};

pub mod local_import {
    use std::path::Path;

    use serde::Serialize;

    use crate::{commands, error::CommandError, storage};

    pub use crate::domain::{CreateProviderAccountInput, RouteSelectionInput};

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ImportOutcome {
        pub credential_label: String,
        pub account_count: usize,
        pub skipped: bool,
    }

    pub async fn import_if_missing(
        db_path: &Path,
        input: CreateProviderAccountInput,
    ) -> Result<ImportOutcome, CommandError> {
        let pool = storage::open(db_path)
            .await
            .map_err(|_| CommandError::storage("无法打开桌面数据库"))?;
        if storage::credential_label_exists(&pool, &input.credential_label).await? {
            return Ok(ImportOutcome {
                credential_label: input.credential_label,
                account_count: 0,
                skipped: true,
            });
        }
        let credential_label = input.credential_label.clone();
        let before = storage::connections(&pool).await?.len();
        let after = commands::create_provider_account_core(&pool, input)
            .await?
            .len();
        Ok(ImportOutcome {
            credential_label,
            account_count: after.saturating_sub(before),
            skipped: false,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !has_background_arg(args.iter()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ai-quota-monitor.sqlite3");
            let db = tauri::async_runtime::block_on(storage::open(&db_path))?;
            let settings = tauri::async_runtime::block_on(storage::settings_record(&db))?;
            if settings.autostart_enabled {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
            let tray_enabled = Arc::new(AtomicBool::new(settings.tray_enabled));
            let show = MenuItem::with_id(app, "show", "显示 AI Quota Monitor", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("application icon").clone())
                .tooltip("AI Quota Monitor")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            tray.set_visible(settings.tray_enabled)?;
            scheduler::spawn(app.handle().clone(), db.clone());
            app.manage(commands::AppState { db, tray_enabled });
            if !settings.tray_enabled || !has_background_arg(std::env::args_os()) {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<commands::AppState>();
                if state.tray_enabled.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::get_connections,
            commands::get_network_profiles,
            commands::update_network_profile,
            commands::delete_network_profile,
            commands::get_credentials,
            commands::get_settings,
            commands::update_settings,
            commands::get_provider_health,
            commands::get_history,
            commands::export_latest_snapshot,
            commands::get_diagnostic_manifest,
            commands::export_diagnostics,
            commands::send_test_notification,
            commands::validate_provider,
            commands::validate_existing_credential,
            commands::create_provider_account,
            commands::update_credential,
            commands::update_account,
            commands::delete_account,
            commands::refresh_all,
            commands::refresh_account,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AI Quota Monitor");
}

fn has_background_arg<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    args.into_iter()
        .any(|arg| arg.as_ref() == std::ffi::OsStr::new("--background"))
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::has_background_arg;
    use std::ffi::OsString;

    #[test]
    fn recognizes_only_explicit_background_startup() {
        assert!(has_background_arg([
            OsString::from("ai-quota-monitor.exe"),
            OsString::from("--background"),
        ]));
        assert!(!has_background_arg([OsString::from(
            "ai-quota-monitor.exe"
        )]));
    }
}
