mod clinepass;
mod commands;
mod credential;
mod domain;
mod error;
mod network;
mod ollama;
mod opencode;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ai-quota-monitor.sqlite3");
            let db = tauri::async_runtime::block_on(storage::open(&db_path))?;
            app.manage(commands::AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::get_connections,
            commands::get_network_profiles,
            commands::validate_provider,
            commands::create_provider_account,
            commands::refresh_all,
            commands::refresh_account,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AI Quota Monitor");
}
