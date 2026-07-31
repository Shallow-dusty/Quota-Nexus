use std::{path::Path, time::Duration};

use chrono::Utc;
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    FromRow, SqlitePool,
};

use crate::{
    domain::{
        AccountConnectionView, NetworkProfileView, OverviewView, QuotaWindowView, ServiceQuotaView,
    },
    error::CommandError,
    network::NewNetworkProfile,
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
    network_profile_label: Option<String>,
}

#[derive(Debug, FromRow)]
struct WindowRow {
    window_kind: String,
    window_label: String,
    used_percent: f64,
    resets_at: Option<String>,
}

#[derive(Debug, Clone, FromRow)]
pub struct NetworkProfileRecord {
    pub id: String,
    pub label: String,
    pub transport: String,
    pub host: String,
    pub port: i64,
    pub has_auth: bool,
}

#[derive(Debug, Clone, FromRow)]
pub struct RefreshTarget {
    pub id: String,
    pub provider: String,
    pub credential_id: String,
    pub scope_id: Option<String>,
    pub network_profile_id: Option<String>,
    pub transport: Option<String>,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub has_auth: Option<bool>,
}

impl RefreshTarget {
    pub fn network_profile(&self) -> Option<NetworkProfileRecord> {
        Some(NetworkProfileRecord {
            id: self.network_profile_id.clone()?,
            label: String::new(),
            transport: self.transport.clone()?,
            host: self.host.clone()?,
            port: self.port?,
            has_auth: self.has_auth.unwrap_or(false),
        })
    }
}

#[derive(Debug, Clone)]
pub struct NewAccountRecord {
    pub id: String,
    pub label: String,
    pub scope_id: Option<String>,
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindowView>,
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

#[allow(clippy::too_many_arguments)]
pub async fn insert_provider_bundle(
    pool: &SqlitePool,
    provider: &str,
    credential_id: &str,
    credential_label: &str,
    network_profile_id: Option<&str>,
    new_profile: Option<&NewNetworkProfile>,
    accounts: &[NewAccountRecord],
) -> Result<(), CommandError> {
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始本地数据库事务"))?;

    if let Some(profile) = new_profile {
        sqlx::query(
            "INSERT INTO network_profiles
             (id, label, transport, host, port, has_auth, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&profile.id)
        .bind(&profile.label)
        .bind(&profile.transport)
        .bind(&profile.host)
        .bind(i64::from(profile.port))
        .bind(profile.has_auth)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法保存固定出口"))?;
    }

    sqlx::query(
        "INSERT INTO credentials
         (id, provider, label, network_profile_id, created_at, last_validated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(credential_id)
    .bind(provider)
    .bind(credential_label)
    .bind(network_profile_id)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法保存凭据元数据"))?;

    for account in accounts {
        sqlx::query(
            "INSERT INTO provider_accounts
             (id, provider, label, plan, credential_id, enabled, created_at,
              last_success_at, scope_id)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
        )
        .bind(&account.id)
        .bind(provider)
        .bind(&account.label)
        .bind(&account.plan)
        .bind(credential_id)
        .bind(&now)
        .bind(&now)
        .bind(&account.scope_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法保存账号配置"))?;
        write_windows(&mut tx, &account.id, &account.windows, &now).await?;
    }

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
    plan: Option<&str>,
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
         SET last_success_at = ?, last_error_category = NULL,
             plan = COALESCE(?, plan)
         WHERE id = ?",
    )
    .bind(&now)
    .bind(plan)
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
                a.last_success_at, a.last_error_category,
                n.label AS network_profile_label
         FROM provider_accounts a
         JOIN credentials c ON c.id = a.credential_id
         LEFT JOIN network_profiles n ON n.id = c.network_profile_id
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
            route_mode_label: row
                .network_profile_label
                .map(|label| format!("固定出口 · {label}"))
                .unwrap_or_else(|| "默认网络栈 / TUN".into()),
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

pub async fn refresh_targets(
    pool: &SqlitePool,
    account_id: Option<&str>,
) -> Result<Vec<RefreshTarget>, CommandError> {
    let base = "SELECT a.id, a.provider, a.credential_id, a.scope_id,
                       n.id AS network_profile_id, n.transport, n.host,
                       n.port, n.has_auth
                FROM provider_accounts a
                JOIN credentials c ON c.id = a.credential_id
                LEFT JOIN network_profiles n ON n.id = c.network_profile_id
                WHERE a.enabled = 1";
    let rows = if let Some(id) = account_id {
        sqlx::query_as::<_, RefreshTarget>(&format!("{base} AND a.id = ?"))
            .bind(id)
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as::<_, RefreshTarget>(base)
            .fetch_all(pool)
            .await
    }
    .map_err(|_| CommandError::storage("无法读取待刷新账号"))?;
    Ok(rows)
}

pub async fn network_profiles(pool: &SqlitePool) -> Result<Vec<NetworkProfileView>, CommandError> {
    let rows = sqlx::query_as::<_, NetworkProfileRecord>(
        "SELECT id, label, transport, host, port, has_auth
         FROM network_profiles ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取固定出口"))?;
    Ok(rows
        .into_iter()
        .map(|row| NetworkProfileView {
            id: row.id,
            label: row.label,
            endpoint_label: format!("{} · {}:{}", row.transport, row.host, row.port),
            has_auth: row.has_auth,
        })
        .collect())
}

pub async fn network_profile_by_id(
    pool: &SqlitePool,
    id: &str,
) -> Result<NetworkProfileRecord, CommandError> {
    sqlx::query_as::<_, NetworkProfileRecord>(
        "SELECT id, label, transport, host, port, has_auth
         FROM network_profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取固定出口"))?
    .ok_or_else(|| CommandError::validation("所选固定出口不存在"))
}

pub async fn credential_label_exists(pool: &SqlitePool, label: &str) -> Result<bool, CommandError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials WHERE label = ?")
        .bind(label)
        .fetch_one(pool)
        .await
        .map_err(|_| CommandError::storage("无法检查已导入凭据"))?;
    Ok(count > 0)
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
        insert_provider_bundle(
            &pool,
            "clinepass",
            "credential-test",
            "测试凭据",
            None,
            None,
            &[NewAccountRecord {
                id: "account-test".into(),
                label: "测试账号".into(),
                scope_id: None,
                plan: None,
                windows,
            }],
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

    #[tokio::test]
    async fn stores_network_profile_without_auth_secret() {
        let directory = tempfile::tempdir().unwrap();
        let pool = open(&directory.path().join("network.sqlite3"))
            .await
            .unwrap();
        let profile = NewNetworkProfile {
            id: "profile-test".into(),
            label: "浏览器出口".into(),
            transport: "socks5h".into(),
            host: "127.0.0.1".into(),
            port: 1080,
            has_auth: true,
        };
        insert_provider_bundle(
            &pool,
            "ollama-cloud",
            "credential-test",
            "Cookie",
            Some(&profile.id),
            Some(&profile),
            &[NewAccountRecord {
                id: "account-test".into(),
                label: "Ollama".into(),
                scope_id: None,
                plan: Some("Pro".into()),
                windows: vec![],
            }],
        )
        .await
        .unwrap();
        let options = network_profiles(&pool).await.unwrap();
        assert_eq!(options[0].endpoint_label, "socks5h · 127.0.0.1:1080");
        let columns: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('network_profiles') ORDER BY cid",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(!columns
            .iter()
            .any(|column| { column.contains("username") || column.contains("password") }));
    }
}
