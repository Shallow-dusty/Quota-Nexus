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

use tauri::Manager;

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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ai-quota-monitor.sqlite3");
            let db = tauri::async_runtime::block_on(storage::open(&db_path))?;
            scheduler::spawn(app.handle().clone(), db.clone());
            app.manage(commands::AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::get_connections,
            commands::get_network_profiles,
            commands::get_credentials,
            commands::get_settings,
            commands::update_settings,
            commands::get_provider_health,
            commands::validate_provider,
            commands::validate_existing_credential,
            commands::create_provider_account,
            commands::update_credential,
            commands::update_account,
            commands::refresh_all,
            commands::refresh_account,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AI Quota Monitor");
}
