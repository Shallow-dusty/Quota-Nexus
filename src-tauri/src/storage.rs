use std::{path::Path, time::Duration};

use chrono::Utc;
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    FromRow, SqlitePool,
};

use crate::{
    domain::{AccountConnectionView, OverviewView, QuotaWindowView, ServiceQuotaView},
    error::CommandError,
};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, FromRow)]
struct AccountRow {
    id: String,
    provider: String,
    label: String,
    plan: Option<String>,
    credential_id: String,
    credential_label: String,
    enabled: bool,
    last_success_at: Option<String>,
    last_error_category: Option<String>,
}

#[derive(Debug, FromRow)]
struct WindowRow {
    window_kind: String,
    window_label: String,
    used_percent: f64,
    resets_at: Option<String>,
}

pub async fn open(path: &Path) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

pub async fn insert_clinepass_account(
    pool: &SqlitePool,
    account_id: &str,
    account_label: &str,
    credential_id: &str,
    credential_label: &str,
    windows: &[QuotaWindowView],
) -> Result<(), CommandError> {
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始本地数据库事务"))?;

    sqlx::query(
        "INSERT INTO credentials
         (id, provider, label, network_profile_id, created_at, last_validated_at)
         VALUES (?, 'clinepass', ?, NULL, ?, ?)",
    )
    .bind(credential_id)
    .bind(credential_label)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法保存凭据元数据"))?;

    sqlx::query(
        "INSERT INTO provider_accounts
         (id, provider, label, credential_id, enabled, created_at, last_success_at)
         VALUES (?, 'clinepass', ?, ?, 1, ?, ?)",
    )
    .bind(account_id)
    .bind(account_label)
    .bind(credential_id)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法保存账号配置"))?;

    write_windows(&mut tx, account_id, windows, &now).await?;
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交本地数据库事务"))
}

async fn write_windows(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    account_id: &str,
    windows: &[QuotaWindowView],
    observed_at: &str,
) -> Result<(), CommandError> {
    sqlx::query("DELETE FROM quota_snapshots WHERE account_id = ?")
        .bind(account_id)
        .execute(&mut **tx)
        .await
        .map_err(|_| CommandError::storage("无法更新额度快照"))?;

    for window in windows {
        sqlx::query(
            "INSERT INTO quota_snapshots
             (account_id, window_kind, window_label, used_percent, resets_at, observed_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(account_id)
        .bind(&window.kind)
        .bind(&window.label)
        .bind(window.used_percent)
        .bind(&window.resets_at)
        .bind(observed_at)
        .execute(&mut **tx)
        .await
        .map_err(|_| CommandError::storage("无法写入额度窗口"))?;
    }
    Ok(())
}

pub async fn update_success(
    pool: &SqlitePool,
    account_id: &str,
    credential_id: &str,
    windows: &[QuotaWindowView],
) -> Result<(), CommandError> {
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始刷新事务"))?;
    write_windows(&mut tx, account_id, windows, &now).await?;
    sqlx::query(
        "UPDATE provider_accounts
         SET last_success_at = ?, last_error_category = NULL
         WHERE id = ?",
    )
    .bind(&now)
    .bind(account_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法更新账号状态"))?;
    sqlx::query("UPDATE credentials SET last_validated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(credential_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法更新凭据状态"))?;
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交刷新事务"))
}

pub async fn update_failure(
    pool: &SqlitePool,
    account_id: &str,
    category: &str,
) -> Result<(), CommandError> {
    sqlx::query("UPDATE provider_accounts SET last_error_category = ? WHERE id = ?")
        .bind(category)
        .bind(account_id)
        .execute(pool)
        .await
        .map_err(|_| CommandError::storage("无法记录账号刷新状态"))?;
    Ok(())
}

async fn account_rows(pool: &SqlitePool) -> Result<Vec<AccountRow>, CommandError> {
    sqlx::query_as::<_, AccountRow>(
        "SELECT a.id, a.provider, a.label, a.plan, a.credential_id,
                c.label AS credential_label, a.enabled,
                a.last_success_at, a.last_error_category
         FROM provider_accounts a
         JOIN credentials c ON c.id = a.credential_id
         ORDER BY a.created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取本地账号"))
}

async fn windows_for(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<Vec<QuotaWindowView>, CommandError> {
    let rows = sqlx::query_as::<_, WindowRow>(
        "SELECT window_kind, window_label, used_percent, resets_at
         FROM quota_snapshots
         WHERE account_id = ?
         ORDER BY CASE window_kind
           WHEN 'rolling_5h' THEN 1 WHEN 'session' THEN 2
           WHEN 'weekly' THEN 3 WHEN 'monthly' THEN 4 ELSE 5 END",
    )
    .bind(account_id)
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取额度快照"))?;
    Ok(rows
        .into_iter()
        .map(|row| QuotaWindowView {
            id: row.window_kind.clone(),
            kind: row.window_kind,
            label: row.window_label,
            used_percent: row.used_percent,
            resets_at: row.resets_at,
        })
        .collect())
}

pub async fn overview(pool: &SqlitePool) -> Result<OverviewView, CommandError> {
    let rows = account_rows(pool).await?;
    let mut accounts = Vec::with_capacity(rows.len());
    let mut refreshed_at: Option<String> = None;
    for row in rows {
        let windows = windows_for(pool, &row.id).await?;
        if row.last_success_at > refreshed_at {
            refreshed_at = row.last_success_at.clone();
        }
        let stale = row.last_error_category.is_some();
        accounts.push(ServiceQuotaView {
            id: row.id,
            provider_name: provider_name(&row.provider).into(),
            provider: row.provider,
            account_label: row.label,
            plan: row.plan,
            state: if stale { "stale-with-error" } else { "ready" }.into(),
            freshness: if stale { "stale" } else { "fresh" }.into(),
            last_success_at: row.last_success_at,
            error_category: row.last_error_category,
            windows,
        });
    }
    Ok(OverviewView {
        accounts,
        refreshed_at,
        source: "tauri",
    })
}

pub async fn connections(pool: &SqlitePool) -> Result<Vec<AccountConnectionView>, CommandError> {
    let rows = account_rows(pool).await?;
    let mut output = Vec::with_capacity(rows.len());
    for row in rows {
        let shared_account_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM provider_accounts WHERE credential_id = ?")
                .bind(&row.credential_id)
                .fetch_one(pool)
                .await
                .map_err(|_| CommandError::storage("无法读取凭据引用数"))?;
        let stale = row.last_error_category.is_some();
        output.push(AccountConnectionView {
            id: row.id,
            provider_name: provider_name(&row.provider).into(),
            provider: row.provider,
            account_label: row.label,
            plan: row.plan,
            credential_label: row.credential_label,
            shared_account_count,
            route_mode_label: "默认网络栈 / TUN".into(),
            state: if stale { "stale-with-error" } else { "ready" }.into(),
            freshness: if stale { "stale" } else { "fresh" }.into(),
            last_success_at: row.last_success_at,
            next_refresh_at: None,
            enabled: row.enabled,
            error_category: row.last_error_category,
        });
    }
    Ok(output)
}

pub async fn enabled_accounts(
    pool: &SqlitePool,
    account_id: Option<&str>,
) -> Result<Vec<(String, String, String)>, CommandError> {
    let rows = if let Some(id) = account_id {
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT id, provider, credential_id
             FROM provider_accounts WHERE enabled = 1 AND id = ?",
        )
        .bind(id)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, (String, String, String)>(
            "SELECT id, provider, credential_id
             FROM provider_accounts WHERE enabled = 1",
        )
        .fetch_all(pool)
        .await
    }
    .map_err(|_| CommandError::storage("无法读取待刷新账号"))?;
    Ok(rows)
}

fn provider_name(provider: &str) -> &str {
    match provider {
        "clinepass" => "Cline Pass",
        "opencode-go" => "OpenCode Go",
        "ollama-cloud" => "Ollama Cloud",
        _ => "未知服务",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migration_and_snapshot_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        let pool = open(&directory.path().join("test.sqlite3")).await.unwrap();

        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        assert_eq!(busy_timeout, 5_000);

        let windows = vec![QuotaWindowView {
            id: "weekly".into(),
            kind: "weekly".into(),
            label: "周额度".into(),
            used_percent: 42.5,
            resets_at: Some("2026-08-03T00:00:00Z".into()),
        }];
        insert_clinepass_account(
            &pool,
            "account-test",
            "测试账号",
            "credential-test",
            "测试凭据",
            &windows,
        )
        .await
        .unwrap();

        let overview = overview(&pool).await.unwrap();
        assert_eq!(overview.source, "tauri");
        assert_eq!(overview.accounts.len(), 1);
        assert_eq!(overview.accounts[0].windows[0].used_percent, 42.5);
        assert_eq!(
            connections(&pool).await.unwrap()[0].credential_label,
            "测试凭据"
        );
    }
}
