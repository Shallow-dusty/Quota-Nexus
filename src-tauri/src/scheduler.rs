use std::time::Duration;

use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::commands;

pub fn spawn(app: AppHandle, db: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        loop {
            match commands::scheduled_refresh(&app, &db).await {
                Ok(Some(overview)) => {
                    let _ = app.emit("overview-updated", overview);
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = app.emit("scheduler-error", error);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}
