use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::Path,
    time::Duration,
};

use chrono::{Duration as ChronoDuration, Utc};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    FromRow, SqlitePool,
};

use crate::{
    domain::{
        AccountConnectionView, AppSettingsView, CredentialOptionView, HistoryPointView,
        NetworkProfileView, OverviewView, ProviderHealthView, QuotaWindowView, ServiceQuotaView,
        UpdateSettingsInput,
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
    next_refresh_at: Option<String>,
    next_attempt_at: Option<String>,
    consecutive_failures: i64,
    auth_paused: bool,
    effective_refresh_minutes: Option<i64>,
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
    pub consecutive_failures: i64,
    pub circuit_state: String,
    pub next_probe_at: Option<String>,
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

#[derive(Debug, Clone, FromRow)]
pub struct CredentialContext {
    pub id: String,
    pub provider: String,
    pub network_profile_id: Option<String>,
    pub transport: Option<String>,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub has_auth: Option<bool>,
    pub scope_id: Option<String>,
}

impl CredentialContext {
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

#[derive(Debug, Clone, FromRow)]
pub struct AppSettingsRecord {
    pub refresh_interval_minutes: Option<i64>,
    pub adaptive_refresh: bool,
    pub warning_threshold: f64,
    pub high_threshold: f64,
    pub critical_threshold: f64,
    pub history_days: Option<i64>,
    pub tray_enabled: bool,
    pub autostart_enabled: bool,
    pub privacy_mode: bool,
    pub notify_auth: bool,
    pub notify_stale: bool,
    pub notify_recovery: bool,
}

#[derive(Debug, Clone)]
pub struct AlertEvent {
    pub title: String,
    pub body: String,
}

#[derive(Debug)]
pub struct DeleteAccountOutcome {
    pub credential_id: Option<String>,
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
    let policy = settings_record(pool).await?;
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
              last_success_at, scope_id, consecutive_failures, auth_paused,
              effective_refresh_minutes, next_refresh_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 0, 0, ?, ?, ?)",
        )
        .bind(&account.id)
        .bind(provider)
        .bind(&account.label)
        .bind(&account.plan)
        .bind(credential_id)
        .bind(&now)
        .bind(&now)
        .bind(&account.scope_id)
        .bind(effective_interval(&policy, &account.windows, None))
        .bind(next_refresh_at(
            &policy,
            &account.windows,
            &account.id,
            None,
        ))
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法保存账号配置"))?;
        write_windows(
            &mut tx,
            &account.id,
            &account.windows,
            &now,
            policy.history_days,
        )
        .await?;
    }

    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交本地数据库事务"))
}

pub async fn insert_accounts_for_credential(
    pool: &SqlitePool,
    credential_id: &str,
    provider: &str,
    accounts: &[NewAccountRecord],
) -> Result<usize, CommandError> {
    let now = Utc::now().to_rfc3339();
    let policy = settings_record(pool).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始账号复用事务"))?;
    let mut inserted = 0usize;
    for account in accounts {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM provider_accounts
             WHERE credential_id = ? AND COALESCE(scope_id, '') = COALESCE(?, '')",
        )
        .bind(credential_id)
        .bind(&account.scope_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法检查已存在的账号作用域"))?;
        if exists > 0 {
            continue;
        }
        sqlx::query(
            "INSERT INTO provider_accounts
             (id, provider, label, plan, credential_id, enabled, created_at,
              last_success_at, scope_id, consecutive_failures, auth_paused,
              effective_refresh_minutes, next_refresh_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 0, 0, ?, ?, ?)",
        )
        .bind(&account.id)
        .bind(provider)
        .bind(&account.label)
        .bind(&account.plan)
        .bind(credential_id)
        .bind(&now)
        .bind(&now)
        .bind(&account.scope_id)
        .bind(effective_interval(&policy, &account.windows, None))
        .bind(next_refresh_at(
            &policy,
            &account.windows,
            &account.id,
            None,
        ))
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法保存复用凭据的账号"))?;
        write_windows(
            &mut tx,
            &account.id,
            &account.windows,
            &now,
            policy.history_days,
        )
        .await?;
        inserted += 1;
    }
    if inserted == 0 {
        return Err(CommandError::validation(
            "该凭据对应的账号或 Workspace 已经存在",
        ));
    }
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交账号复用事务"))?;
    Ok(inserted)
}

async fn write_windows(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    account_id: &str,
    windows: &[QuotaWindowView],
    observed_at: &str,
    history_days: Option<i64>,
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

        if history_days.is_some() {
            sqlx::query(
                "INSERT OR IGNORE INTO quota_history
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
            .map_err(|_| CommandError::storage("无法写入额度历史"))?;
        }
    }
    if let Some(days) = history_days {
        let cutoff = (Utc::now() - ChronoDuration::days(days)).to_rfc3339();
        sqlx::query("DELETE FROM quota_history WHERE observed_at < ?")
            .bind(cutoff)
            .execute(&mut **tx)
            .await
            .map_err(|_| CommandError::storage("无法清理过期额度历史"))?;
    } else {
        sqlx::query("DELETE FROM quota_history")
            .execute(&mut **tx)
            .await
            .map_err(|_| CommandError::storage("无法关闭额度历史"))?;
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
    let policy = settings_record(pool).await?;
    let current_interval: Option<i64> =
        sqlx::query_scalar("SELECT effective_refresh_minutes FROM provider_accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| CommandError::storage("无法读取账号刷新计划"))?
            .flatten();
    let effective = effective_interval(&policy, windows, current_interval);
    let next_refresh = next_refresh_at(&policy, windows, account_id, current_interval);
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始刷新事务"))?;
    write_windows(&mut tx, account_id, windows, &now, policy.history_days).await?;
    sqlx::query(
        "UPDATE provider_accounts
         SET last_success_at = ?, last_error_category = NULL,
             plan = COALESCE(?, plan), consecutive_failures = 0,
             next_attempt_at = NULL, auth_paused = 0,
             effective_refresh_minutes = ?, next_refresh_at = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(plan)
    .bind(effective)
    .bind(next_refresh)
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
    sqlx::query(
        "UPDATE provider_health
         SET circuit_state = 'closed', consecutive_failures = 0,
             last_success_at = ?, next_probe_at = NULL,
             last_error_category = NULL, updated_at = ?
         WHERE provider = (SELECT provider FROM provider_accounts WHERE id = ?)",
    )
    .bind(&now)
    .bind(&now)
    .bind(account_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法更新供应商健康状态"))?;
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交刷新事务"))
}

pub async fn update_failure(
    pool: &SqlitePool,
    target: &RefreshTarget,
    error: &CommandError,
    explicit_proxy: bool,
) -> Result<(), CommandError> {
    let now = Utc::now();
    let now_text = now.to_rfc3339();
    let category = if explicit_proxy && error.code == "network" {
        "proxy"
    } else {
        error.category()
    };
    let failures = target.consecutive_failures.saturating_add(1);
    let (auth_paused, next_attempt_at) = match error.code {
        "auth" => (true, None),
        "parser" => (
            false,
            Some((now + ChronoDuration::minutes(30)).to_rfc3339()),
        ),
        "rate_limit" => {
            let seconds = error.retry_after_seconds.unwrap_or(300).max(300);
            let seconds = i64::try_from(seconds.min(86_400)).unwrap_or(86_400);
            (
                false,
                Some((now + ChronoDuration::seconds(seconds)).to_rfc3339()),
            )
        }
        _ => {
            let minutes = match failures {
                0 | 1 => 5,
                2 => 10,
                3 => 20,
                4 => 40,
                _ => 60,
            };
            (
                false,
                Some((now + ChronoDuration::minutes(minutes)).to_rfc3339()),
            )
        }
    };
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始失败状态事务"))?;
    sqlx::query(
        "UPDATE provider_accounts
         SET last_error_category = ?, consecutive_failures = ?,
             next_attempt_at = ?, auth_paused = ?,
             next_refresh_at = COALESCE(?, next_refresh_at), updated_at = ?
         WHERE id = ?",
    )
    .bind(category)
    .bind(failures)
    .bind(&next_attempt_at)
    .bind(auth_paused)
    .bind(&next_attempt_at)
    .bind(&now_text)
    .bind(&target.id)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法记录账号刷新状态"))?;

    let circuit_state = if error.code == "parser" {
        "open"
    } else {
        target.circuit_state.as_str()
    };
    let next_probe_at = if error.code == "parser" {
        next_attempt_at.as_deref()
    } else {
        target.next_probe_at.as_deref()
    };
    sqlx::query(
        "UPDATE provider_health
         SET circuit_state = ?, consecutive_failures = consecutive_failures + 1,
             next_probe_at = ?, last_error_category = ?, updated_at = ?
         WHERE provider = ?",
    )
    .bind(circuit_state)
    .bind(next_probe_at)
    .bind(category)
    .bind(&now_text)
    .bind(&target.provider)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法记录供应商健康状态"))?;
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交失败状态事务"))
}

async fn account_rows(pool: &SqlitePool) -> Result<Vec<AccountRow>, CommandError> {
    sqlx::query_as::<_, AccountRow>(
        "SELECT a.id, a.provider, a.label, a.plan, a.credential_id,
                c.label AS credential_label, a.enabled,
                a.last_success_at, a.last_error_category,
                n.label AS network_profile_label, a.next_refresh_at,
                a.next_attempt_at, a.consecutive_failures, a.auth_paused,
                a.effective_refresh_minutes
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
            state: if !row.enabled {
                "paused"
            } else if stale {
                "stale-with-error"
            } else {
                "ready"
            }
            .into(),
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
            credential_id: row.credential_id,
            shared_account_count,
            route_mode_label: row
                .network_profile_label
                .map(|label| format!("固定出口 · {label}"))
                .unwrap_or_else(|| "默认网络栈 / TUN".into()),
            state: if !row.enabled {
                "paused"
            } else if stale {
                "stale-with-error"
            } else {
                "ready"
            }
            .into(),
            freshness: if stale { "stale" } else { "fresh" }.into(),
            last_success_at: row.last_success_at,
            next_refresh_at: row.next_refresh_at,
            next_attempt_at: row.next_attempt_at,
            effective_refresh_minutes: row.effective_refresh_minutes,
            consecutive_failures: row.consecutive_failures,
            auth_paused: row.auth_paused,
            enabled: row.enabled,
            error_category: row.last_error_category,
        });
    }
    Ok(output)
}

pub async fn refresh_targets(
    pool: &SqlitePool,
    account_id: Option<&str>,
    manual: bool,
) -> Result<Vec<RefreshTarget>, CommandError> {
    let base = "SELECT a.id, a.provider, a.credential_id, a.scope_id,
                       n.id AS network_profile_id, n.transport, n.host,
                       n.port, n.has_auth, a.consecutive_failures,
                       h.circuit_state, h.next_probe_at
                FROM provider_accounts a
                JOIN credentials c ON c.id = a.credential_id
                LEFT JOIN network_profiles n ON n.id = c.network_profile_id
                JOIN provider_health h ON h.provider = a.provider
                WHERE a.enabled = 1 AND a.auth_paused = 0
                  AND (
                    h.circuit_state = 'closed' OR
                    (h.next_probe_at IS NOT NULL AND h.next_probe_at <= ?)
                  )";
    let now = Utc::now().to_rfc3339();
    let schedule_filter = if manual {
        String::new()
    } else {
        " AND (a.next_attempt_at IS NULL OR a.next_attempt_at <= ?)
          AND a.next_refresh_at IS NOT NULL AND a.next_refresh_at <= ?"
            .into()
    };
    let rows_result = if let Some(id) = account_id {
        let query = format!("{base}{schedule_filter} AND a.id = ?");
        let query = sqlx::query_as::<_, RefreshTarget>(&query).bind(&now);
        let query = if manual {
            query
        } else {
            query.bind(&now).bind(&now)
        };
        query.bind(id).fetch_all(pool).await
    } else {
        let query = format!("{base}{schedule_filter} ORDER BY a.next_refresh_at ASC");
        let query = sqlx::query_as::<_, RefreshTarget>(&query).bind(&now);
        let query = if manual {
            query
        } else {
            query.bind(&now).bind(&now)
        };
        query.fetch_all(pool).await
    };
    let rows = rows_result.map_err(|_| CommandError::storage("无法读取待刷新账号"))?;

    let mut selected = Vec::new();
    let mut probing = std::collections::HashSet::new();
    for row in rows {
        if row.circuit_state == "closed" || probing.insert(row.provider.clone()) {
            selected.push(row);
        }
    }
    for target in &selected {
        if target.circuit_state != "closed" {
            sqlx::query(
                "UPDATE provider_health SET circuit_state = 'half-open', updated_at = ?
                 WHERE provider = ?",
            )
            .bind(&now)
            .bind(&target.provider)
            .execute(pool)
            .await
            .map_err(|_| CommandError::storage("无法进入供应商半开探测"))?;
        }
    }
    Ok(selected)
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

pub async fn network_profile_usage(pool: &SqlitePool, id: &str) -> Result<i64, CommandError> {
    sqlx::query_scalar("SELECT COUNT(*) FROM credentials WHERE network_profile_id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|_| CommandError::storage("无法读取固定出口引用"))
}

pub async fn update_network_profile(
    pool: &SqlitePool,
    profile: &NewNetworkProfile,
) -> Result<(), CommandError> {
    let result = sqlx::query(
        "UPDATE network_profiles
         SET label = ?, transport = ?, host = ?, port = ?, has_auth = ?
         WHERE id = ?",
    )
    .bind(&profile.label)
    .bind(&profile.transport)
    .bind(&profile.host)
    .bind(i64::from(profile.port))
    .bind(profile.has_auth)
    .bind(&profile.id)
    .execute(pool)
    .await
    .map_err(|_| CommandError::storage("无法更新固定出口"))?;
    if result.rows_affected() == 0 {
        return Err(CommandError::validation("固定出口不存在"));
    }
    Ok(())
}

pub async fn delete_network_profile(pool: &SqlitePool, id: &str) -> Result<bool, CommandError> {
    if network_profile_usage(pool, id).await? > 0 {
        return Err(CommandError::validation("该固定出口仍被凭据使用，不能删除"));
    }
    let has_auth: Option<bool> =
        sqlx::query_scalar("SELECT has_auth FROM network_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|_| CommandError::storage("无法读取固定出口"))?;
    let Some(has_auth) = has_auth else {
        return Err(CommandError::validation("固定出口不存在"));
    };
    sqlx::query("DELETE FROM network_profiles WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|_| CommandError::storage("无法删除固定出口"))?;
    Ok(has_auth)
}

pub async fn credential_options(
    pool: &SqlitePool,
) -> Result<Vec<CredentialOptionView>, CommandError> {
    #[derive(FromRow)]
    struct Row {
        id: String,
        provider: String,
        label: String,
        shared_account_count: i64,
        network_profile_label: Option<String>,
        last_validated_at: Option<String>,
    }
    let rows = sqlx::query_as::<_, Row>(
        "SELECT c.id, c.provider, c.label,
                COUNT(a.id) AS shared_account_count,
                n.label AS network_profile_label, c.last_validated_at
         FROM credentials c
         LEFT JOIN provider_accounts a ON a.credential_id = c.id
         LEFT JOIN network_profiles n ON n.id = c.network_profile_id
         GROUP BY c.id, c.provider, c.label, n.label, c.last_validated_at
         ORDER BY c.created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取可复用凭据"))?;
    Ok(rows
        .into_iter()
        .map(|row| CredentialOptionView {
            id: row.id,
            provider: row.provider,
            label: row.label,
            shared_account_count: row.shared_account_count,
            route_mode_label: row
                .network_profile_label
                .map(|label| format!("固定出口 · {label}"))
                .unwrap_or_else(|| "默认网络栈 / TUN".into()),
            last_validated_at: row.last_validated_at,
        })
        .collect())
}

pub async fn credential_context(
    pool: &SqlitePool,
    credential_id: &str,
) -> Result<CredentialContext, CommandError> {
    sqlx::query_as::<_, CredentialContext>(
        "SELECT c.id, c.provider, c.network_profile_id,
                n.transport, n.host, n.port, n.has_auth,
                (SELECT a.scope_id FROM provider_accounts a
                 WHERE a.credential_id = c.id ORDER BY a.created_at ASC LIMIT 1) AS scope_id
         FROM credentials c
         LEFT JOIN network_profiles n ON n.id = c.network_profile_id
         WHERE c.id = ?",
    )
    .bind(credential_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取凭据上下文"))?
    .ok_or_else(|| CommandError::validation("所选凭据不存在"))
}

pub async fn mark_credential_updated(
    pool: &SqlitePool,
    credential_id: &str,
) -> Result<(), CommandError> {
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始凭据更新事务"))?;
    sqlx::query("UPDATE credentials SET last_validated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(credential_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法更新凭据状态"))?;
    sqlx::query(
        "UPDATE provider_accounts
         SET auth_paused = 0, consecutive_failures = 0,
             next_attempt_at = NULL, next_refresh_at = ?,
             last_error_category = NULL, updated_at = ?
         WHERE credential_id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(credential_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法恢复凭据关联账号"))?;
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交凭据更新事务"))
}

pub async fn update_account(
    pool: &SqlitePool,
    id: &str,
    label: &str,
    enabled: bool,
) -> Result<(), CommandError> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE provider_accounts
         SET label = ?, enabled = ?,
             next_refresh_at = CASE
               WHEN ? = 1 AND auth_paused = 0 THEN ?
               ELSE NULL
             END,
             updated_at = ?
         WHERE id = ?",
    )
    .bind(label)
    .bind(enabled)
    .bind(enabled)
    .bind(&now)
    .bind(&now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|_| CommandError::storage("无法更新账号"))?;
    if result.rows_affected() == 0 {
        return Err(CommandError::validation("账号不存在"));
    }
    Ok(())
}

pub async fn delete_account(
    pool: &SqlitePool,
    id: &str,
) -> Result<DeleteAccountOutcome, CommandError> {
    let credential_id: String =
        sqlx::query_scalar("SELECT credential_id FROM provider_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|_| CommandError::storage("无法读取待删除账号"))?
            .ok_or_else(|| CommandError::validation("账号不存在"))?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始删除账号事务"))?;
    sqlx::query("DELETE FROM provider_accounts WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法删除本地账号"))?;
    let remaining: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM provider_accounts WHERE credential_id = ?")
            .bind(&credential_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| CommandError::storage("无法检查凭据引用"))?;
    let deleted_credential = if remaining == 0 {
        sqlx::query("DELETE FROM credentials WHERE id = ?")
            .bind(&credential_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| CommandError::storage("无法删除凭据元数据"))?;
        Some(credential_id)
    } else {
        None
    };
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交删除账号事务"))?;
    Ok(DeleteAccountOutcome {
        credential_id: deleted_credential,
    })
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

pub async fn settings_record(pool: &SqlitePool) -> Result<AppSettingsRecord, CommandError> {
    sqlx::query_as::<_, AppSettingsRecord>(
        "SELECT refresh_interval_minutes, adaptive_refresh, warning_threshold,
                high_threshold, critical_threshold, history_days, tray_enabled,
                autostart_enabled, privacy_mode, notify_auth, notify_stale,
                notify_recovery
         FROM app_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取应用设置"))
}

pub async fn settings(pool: &SqlitePool) -> Result<AppSettingsView, CommandError> {
    let row = settings_record(pool).await?;
    Ok(AppSettingsView {
        refresh_interval_minutes: row.refresh_interval_minutes,
        adaptive_refresh: row.adaptive_refresh,
        warning_threshold: row.warning_threshold,
        high_threshold: row.high_threshold,
        critical_threshold: row.critical_threshold,
        history_days: row.history_days,
        tray_enabled: row.tray_enabled,
        autostart_enabled: row.autostart_enabled,
        privacy_mode: row.privacy_mode,
        notify_auth: row.notify_auth,
        notify_stale: row.notify_stale,
        notify_recovery: row.notify_recovery,
    })
}

pub async fn update_settings(
    pool: &SqlitePool,
    input: UpdateSettingsInput,
) -> Result<AppSettingsView, CommandError> {
    if !matches!(input.refresh_interval_minutes, None | Some(5 | 15 | 30)) {
        return Err(CommandError::validation(
            "刷新周期只能是手动、5、15 或 30 分钟",
        ));
    }
    if !matches!(input.history_days, None | Some(7 | 30 | 90)) {
        return Err(CommandError::validation(
            "历史保留只能是关闭、7、30 或 90 天",
        ));
    }
    if !(0.0..=100.0).contains(&input.warning_threshold)
        || !(0.0..=100.0).contains(&input.high_threshold)
        || !(0.0..=100.0).contains(&input.critical_threshold)
        || input.warning_threshold >= input.high_threshold
        || input.high_threshold >= input.critical_threshold
    {
        return Err(CommandError::validation(
            "通知阈值必须满足 0 ≤ Warning < High < Critical ≤ 100",
        ));
    }
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始设置事务"))?;
    sqlx::query(
        "UPDATE app_settings SET
           refresh_interval_minutes = ?, adaptive_refresh = ?,
           warning_threshold = ?, high_threshold = ?, critical_threshold = ?,
           history_days = ?, tray_enabled = ?, autostart_enabled = ?,
           privacy_mode = ?, notify_auth = ?, notify_stale = ?,
           notify_recovery = ?, updated_at = ?
         WHERE id = 1",
    )
    .bind(input.refresh_interval_minutes)
    .bind(input.adaptive_refresh)
    .bind(input.warning_threshold)
    .bind(input.high_threshold)
    .bind(input.critical_threshold)
    .bind(input.history_days)
    .bind(input.tray_enabled)
    .bind(input.autostart_enabled)
    .bind(input.privacy_mode)
    .bind(input.notify_auth)
    .bind(input.notify_stale)
    .bind(input.notify_recovery)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|_| CommandError::storage("无法保存应用设置"))?;
    if input.refresh_interval_minutes.is_some() {
        sqlx::query(
            "UPDATE provider_accounts
             SET next_refresh_at = ?, effective_refresh_minutes = ?,
                 updated_at = ?
             WHERE enabled = 1 AND auth_paused = 0",
        )
        .bind(&now)
        .bind(input.refresh_interval_minutes)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法更新账号刷新计划"))?;
    } else {
        sqlx::query(
            "UPDATE provider_accounts SET next_refresh_at = NULL,
             effective_refresh_minutes = NULL, updated_at = ?",
        )
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法关闭周期刷新"))?;
    }
    if input.history_days.is_none() {
        sqlx::query("DELETE FROM quota_history")
            .execute(&mut *tx)
            .await
            .map_err(|_| CommandError::storage("无法关闭历史记录"))?;
    }
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交设置事务"))?;
    settings(pool).await
}

pub async fn provider_health(pool: &SqlitePool) -> Result<Vec<ProviderHealthView>, CommandError> {
    #[derive(FromRow)]
    struct Row {
        provider: String,
        circuit_state: String,
        last_success_at: Option<String>,
        next_probe_at: Option<String>,
        consecutive_failures: i64,
    }
    let rows = sqlx::query_as::<_, Row>(
        "SELECT provider, circuit_state, last_success_at, next_probe_at,
                consecutive_failures
         FROM provider_health
         ORDER BY CASE provider
           WHEN 'clinepass' THEN 1 WHEN 'opencode-go' THEN 2 ELSE 3 END",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取供应商诊断"))?;
    Ok(rows
        .into_iter()
        .map(|row| ProviderHealthView {
            provider_name: provider_name(&row.provider).into(),
            provider: row.provider,
            circuit_state: row.circuit_state,
            last_success_at: row.last_success_at,
            next_probe_at: row.next_probe_at,
            consecutive_failures: row.consecutive_failures,
        })
        .collect())
}

pub async fn history(pool: &SqlitePool, days: i64) -> Result<Vec<HistoryPointView>, CommandError> {
    if !matches!(days, 7 | 30 | 90) {
        return Err(CommandError::validation("历史范围只能是 7、30 或 90 天"));
    }
    #[derive(FromRow)]
    struct Row {
        account_id: String,
        provider: String,
        account_label: String,
        window_kind: String,
        window_label: String,
        used_percent: f64,
        observed_at: String,
    }
    let cutoff = (Utc::now() - ChronoDuration::days(days)).to_rfc3339();
    let rows = sqlx::query_as::<_, Row>(
        "SELECT h.account_id, a.provider, a.label AS account_label,
                h.window_kind, h.window_label, h.used_percent, h.observed_at
         FROM quota_history h
         JOIN provider_accounts a ON a.id = h.account_id
         WHERE h.observed_at >= ?
         ORDER BY h.observed_at ASC",
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取额度历史"))?;
    Ok(rows
        .into_iter()
        .map(|row| HistoryPointView {
            account_id: row.account_id,
            provider: row.provider,
            account_label: row.account_label,
            window_kind: row.window_kind,
            window_label: row.window_label,
            used_percent: row.used_percent,
            observed_at: row.observed_at,
        })
        .collect())
}

pub async fn evaluate_quota_alerts(
    pool: &SqlitePool,
    account_id: &str,
    windows: &[QuotaWindowView],
) -> Result<Vec<AlertEvent>, CommandError> {
    let settings = settings_record(pool).await?;
    let (provider, account_label): (String, String) =
        sqlx::query_as("SELECT provider, label FROM provider_accounts WHERE id = ?")
            .bind(account_id)
            .fetch_one(pool)
            .await
            .map_err(|_| CommandError::storage("无法读取告警账号"))?;
    let now = Utc::now().to_rfc3339();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| CommandError::storage("无法开始告警状态事务"))?;
    let mut events = Vec::new();
    for window in windows {
        let key = format!("quota:{}", window.kind);
        let period_key = window.resets_at.as_deref().unwrap_or("unknown");
        let existing: Option<(String, Option<String>, i64, Option<String>)> = sqlx::query_as(
            "SELECT state, period_key, generation, last_notified_at
             FROM alert_states WHERE account_id = ? AND alert_key = ?",
        )
        .bind(account_id)
        .bind(&key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法读取额度告警状态"))?;
        let (mut previous, previous_period, mut generation, previous_notified) =
            existing.unwrap_or_else(|| ("normal".into(), None, 0, None));
        if previous_period.as_deref() != Some(period_key) {
            previous = "normal".into();
            generation += 1;
        }
        let previous_rank = alert_rank(&previous);
        let computed = quota_alert_state(window.used_percent, &settings);
        let next = if computed == "normal"
            && previous_rank > 0
            && window.used_percent >= settings.warning_threshold - 5.0
        {
            previous.as_str()
        } else {
            computed
        };
        let next_rank = alert_rank(next);
        let should_notify = next_rank > previous_rank
            || (previous_rank > 0 && next_rank == 0 && settings.notify_recovery);
        if should_notify {
            let title = if next_rank == 0 {
                "额度状态已恢复".to_string()
            } else {
                format!("额度 {}", alert_state_label(next))
            };
            let body = if next_rank == 0 {
                format!(
                    "{} · {} 的{}已回落至 {:.1}%",
                    provider_name(&provider),
                    account_label,
                    window.label,
                    window.used_percent
                )
            } else {
                format!(
                    "{} · {} 的{}已使用 {:.1}%",
                    provider_name(&provider),
                    account_label,
                    window.label,
                    window.used_percent
                )
            };
            events.push(AlertEvent { title, body });
        }
        let notified_at = if should_notify {
            Some(now.clone())
        } else {
            previous_notified
        };
        sqlx::query(
            "INSERT INTO alert_states
             (account_id, alert_key, period_key, generation, state,
              last_notified_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(account_id, alert_key) DO UPDATE SET
               period_key = excluded.period_key,
               generation = excluded.generation,
               state = excluded.state,
               last_notified_at = excluded.last_notified_at,
               updated_at = excluded.updated_at",
        )
        .bind(account_id)
        .bind(&key)
        .bind(period_key)
        .bind(generation)
        .bind(next)
        .bind(notified_at)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|_| CommandError::storage("无法保存额度告警状态"))?;
    }
    tx.commit()
        .await
        .map_err(|_| CommandError::storage("无法提交额度告警状态"))?;
    Ok(events)
}

pub async fn evaluate_health_alert(
    pool: &SqlitePool,
    account_id: &str,
    next_state: &str,
) -> Result<Vec<AlertEvent>, CommandError> {
    let settings = settings_record(pool).await?;
    let (provider, account_label): (String, String) =
        sqlx::query_as("SELECT provider, label FROM provider_accounts WHERE id = ?")
            .bind(account_id)
            .fetch_one(pool)
            .await
            .map_err(|_| CommandError::storage("无法读取健康告警账号"))?;
    let existing: Option<(String, i64, Option<String>)> = sqlx::query_as(
        "SELECT state, generation, last_notified_at
         FROM alert_states WHERE account_id = ? AND alert_key = 'health'",
    )
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| CommandError::storage("无法读取健康告警状态"))?;
    let (previous, generation, previous_notified) =
        existing.unwrap_or_else(|| ("normal".into(), 0, None));
    let changed = previous != next_state;
    let should_notify = changed
        && match next_state {
            "normal" => previous != "normal" && settings.notify_recovery,
            "auth" => settings.notify_auth,
            _ => settings.notify_stale,
        };
    let now = Utc::now().to_rfc3339();
    let notified_at = if should_notify {
        Some(now.clone())
    } else {
        previous_notified
    };
    sqlx::query(
        "INSERT INTO alert_states
         (account_id, alert_key, period_key, generation, state,
          last_notified_at, updated_at)
         VALUES (?, 'health', NULL, ?, ?, ?, ?)
         ON CONFLICT(account_id, alert_key) DO UPDATE SET
           generation = excluded.generation,
           state = excluded.state,
           last_notified_at = excluded.last_notified_at,
           updated_at = excluded.updated_at",
    )
    .bind(account_id)
    .bind(if previous == "normal" && next_state != "normal" {
        generation + 1
    } else {
        generation
    })
    .bind(next_state)
    .bind(notified_at)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|_| CommandError::storage("无法保存健康告警状态"))?;
    if !should_notify {
        return Ok(Vec::new());
    }
    let title = match next_state {
        "normal" => "额度监控已恢复",
        "auth" => "需要更新凭据",
        "parser" => "供应商页面结构已变化",
        "proxy" => "固定出口不可用",
        _ => "额度数据已陈旧",
    };
    Ok(vec![AlertEvent {
        title: title.into(),
        body: format!("{} · {}", provider_name(&provider), account_label),
    }])
}

fn quota_alert_state(used_percent: f64, settings: &AppSettingsRecord) -> &'static str {
    if used_percent >= settings.critical_threshold {
        "critical"
    } else if used_percent >= settings.high_threshold {
        "high"
    } else if used_percent >= settings.warning_threshold {
        "warning"
    } else {
        "normal"
    }
}

fn alert_rank(state: &str) -> u8 {
    match state {
        "warning" => 1,
        "high" => 2,
        "critical" => 3,
        _ => 0,
    }
}

fn alert_state_label(state: &str) -> &str {
    match state {
        "warning" => "Warning",
        "high" => "High",
        "critical" => "Critical",
        _ => "恢复",
    }
}

fn effective_interval(
    policy: &AppSettingsRecord,
    windows: &[QuotaWindowView],
    current: Option<i64>,
) -> Option<i64> {
    let base = policy.refresh_interval_minutes?;
    if !policy.adaptive_refresh || base == 5 {
        return Some(base);
    }
    let maximum = windows
        .iter()
        .map(|window| window.used_percent)
        .fold(0.0_f64, f64::max);
    if maximum >= policy.warning_threshold {
        Some(5)
    } else if maximum < policy.warning_threshold - 5.0 {
        Some(base)
    } else {
        Some(current.unwrap_or(base))
    }
}

fn next_refresh_at(
    policy: &AppSettingsRecord,
    windows: &[QuotaWindowView],
    account_id: &str,
    current: Option<i64>,
) -> Option<String> {
    let minutes = effective_interval(policy, windows, current)?;
    let jitter = stable_jitter_seconds(account_id);
    Some(
        (Utc::now() + ChronoDuration::minutes(minutes) + ChronoDuration::seconds(jitter))
            .to_rfc3339(),
    )
}

fn stable_jitter_seconds(account_id: &str) -> i64 {
    let mut hasher = DefaultHasher::new();
    account_id.hash(&mut hasher);
    i64::try_from(hasher.finish() % 16).unwrap_or(0)
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
    use chrono::DateTime;

    fn quota_window(used_percent: f64) -> QuotaWindowView {
        QuotaWindowView {
            id: "weekly".into(),
            kind: "weekly".into(),
            label: "周额度".into(),
            used_percent,
            resets_at: Some("2026-08-03T00:00:00Z".into()),
        }
    }

    async fn seeded_pool(provider: &str) -> SqlitePool {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.keep().join("seeded.sqlite3");
        let pool = open(&path).await.unwrap();
        insert_provider_bundle(
            &pool,
            provider,
            "credential-test",
            "测试凭据",
            None,
            None,
            &[NewAccountRecord {
                id: "account-test".into(),
                label: "测试账号".into(),
                scope_id: if provider == "opencode-go" {
                    Some("workspace-a".into())
                } else {
                    None
                },
                plan: None,
                windows: vec![quota_window(42.5)],
            }],
        )
        .await
        .unwrap();
        pool
    }

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

        let windows = vec![quota_window(42.5)];
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

    #[tokio::test]
    async fn appends_history_and_applies_adaptive_hysteresis() {
        let pool = seeded_pool("clinepass").await;

        update_success(
            &pool,
            "account-test",
            "credential-test",
            None,
            &[quota_window(72.0)],
        )
        .await
        .unwrap();
        let raised = connections(&pool).await.unwrap().remove(0);
        assert_eq!(raised.effective_refresh_minutes, Some(5));

        update_success(
            &pool,
            "account-test",
            "credential-test",
            None,
            &[quota_window(68.0)],
        )
        .await
        .unwrap();
        let hysteresis = connections(&pool).await.unwrap().remove(0);
        assert_eq!(hysteresis.effective_refresh_minutes, Some(5));

        update_success(
            &pool,
            "account-test",
            "credential-test",
            None,
            &[quota_window(64.0)],
        )
        .await
        .unwrap();
        let restored = connections(&pool).await.unwrap().remove(0);
        assert_eq!(restored.effective_refresh_minutes, Some(15));

        let history_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM quota_history WHERE account_id = ?")
                .bind("account-test")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(history_count >= 2);
    }

    #[tokio::test]
    async fn applies_auth_pause_rate_limit_and_parser_circuit() {
        let pool = seeded_pool("clinepass").await;
        let target = refresh_targets(&pool, Some("account-test"), true)
            .await
            .unwrap()
            .remove(0);
        update_failure(&pool, &target, &CommandError::auth(), false)
            .await
            .unwrap();
        let auth = connections(&pool).await.unwrap().remove(0);
        assert!(auth.auth_paused);
        assert!(refresh_targets(&pool, Some("account-test"), true)
            .await
            .unwrap()
            .is_empty());

        mark_credential_updated(&pool, "credential-test")
            .await
            .unwrap();
        let target = refresh_targets(&pool, Some("account-test"), true)
            .await
            .unwrap()
            .remove(0);
        let before = Utc::now();
        update_failure(&pool, &target, &CommandError::rate_limit(Some(900)), false)
            .await
            .unwrap();
        let rate_limited = connections(&pool).await.unwrap().remove(0);
        let retry_at =
            DateTime::parse_from_rfc3339(rate_limited.next_attempt_at.as_deref().unwrap())
                .unwrap()
                .with_timezone(&Utc);
        assert!(retry_at >= before + ChronoDuration::seconds(895));

        let target = refresh_targets(&pool, Some("account-test"), true)
            .await
            .unwrap()
            .remove(0);
        update_failure(
            &pool,
            &target,
            &CommandError::parser("schema changed"),
            false,
        )
        .await
        .unwrap();
        let health = provider_health(&pool)
            .await
            .unwrap()
            .into_iter()
            .find(|item| item.provider == "clinepass")
            .unwrap();
        assert_eq!(health.circuit_state, "open");
        assert!(refresh_targets(&pool, Some("account-test"), true)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn validates_settings_and_disables_scheduled_refresh() {
        let pool = seeded_pool("ollama-cloud").await;
        let current = settings(&pool).await.unwrap();
        let invalid = UpdateSettingsInput {
            warning_threshold: 90.0,
            high_threshold: 80.0,
            ..UpdateSettingsInput {
                refresh_interval_minutes: current.refresh_interval_minutes,
                adaptive_refresh: current.adaptive_refresh,
                warning_threshold: current.warning_threshold,
                high_threshold: current.high_threshold,
                critical_threshold: current.critical_threshold,
                history_days: current.history_days,
                tray_enabled: current.tray_enabled,
                autostart_enabled: current.autostart_enabled,
                privacy_mode: current.privacy_mode,
                notify_auth: current.notify_auth,
                notify_stale: current.notify_stale,
                notify_recovery: current.notify_recovery,
            }
        };
        assert_eq!(
            update_settings(&pool, invalid).await.unwrap_err().code,
            "validation"
        );

        let disabled = UpdateSettingsInput {
            refresh_interval_minutes: None,
            adaptive_refresh: true,
            warning_threshold: 70.0,
            high_threshold: 85.0,
            critical_threshold: 95.0,
            history_days: None,
            tray_enabled: true,
            autostart_enabled: false,
            privacy_mode: false,
            notify_auth: true,
            notify_stale: true,
            notify_recovery: false,
        };
        update_settings(&pool, disabled).await.unwrap();
        assert!(refresh_targets(&pool, None, false)
            .await
            .unwrap()
            .is_empty());
        let history_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quota_history")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(history_count, 0);
    }

    #[tokio::test]
    async fn reuses_credential_without_duplicate_scope() {
        let pool = seeded_pool("opencode-go").await;
        let duplicate = insert_accounts_for_credential(
            &pool,
            "credential-test",
            "opencode-go",
            &[NewAccountRecord {
                id: "account-duplicate".into(),
                label: "重复工作区".into(),
                scope_id: Some("workspace-a".into()),
                plan: None,
                windows: vec![quota_window(10.0)],
            }],
        )
        .await
        .unwrap_err();
        assert_eq!(duplicate.code, "validation");

        let inserted = insert_accounts_for_credential(
            &pool,
            "credential-test",
            "opencode-go",
            &[NewAccountRecord {
                id: "account-second".into(),
                label: "第二工作区".into(),
                scope_id: Some("workspace-b".into()),
                plan: None,
                windows: vec![quota_window(20.0)],
            }],
        )
        .await
        .unwrap();
        assert_eq!(inserted, 1);
        assert_eq!(
            credential_options(&pool).await.unwrap()[0].shared_account_count,
            2
        );
    }

    #[tokio::test]
    async fn deduplicates_and_rearms_quota_and_health_alerts() {
        let pool = seeded_pool("clinepass").await;
        let warning = quota_window(72.0);
        assert_eq!(
            evaluate_quota_alerts(&pool, "account-test", std::slice::from_ref(&warning))
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(evaluate_quota_alerts(&pool, "account-test", &[warning])
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            evaluate_quota_alerts(&pool, "account-test", &[quota_window(87.0)])
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(
            evaluate_quota_alerts(&pool, "account-test", &[quota_window(64.0)])
                .await
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            evaluate_quota_alerts(&pool, "account-test", &[quota_window(72.0)])
                .await
                .unwrap()
                .len(),
            1
        );

        assert_eq!(
            evaluate_health_alert(&pool, "account-test", "auth")
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(evaluate_health_alert(&pool, "account-test", "auth")
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn deletes_last_credential_only_after_all_shared_accounts_are_removed() {
        let pool = seeded_pool("opencode-go").await;
        insert_accounts_for_credential(
            &pool,
            "credential-test",
            "opencode-go",
            &[NewAccountRecord {
                id: "account-second".into(),
                label: "第二工作区".into(),
                scope_id: Some("workspace-b".into()),
                plan: None,
                windows: vec![quota_window(20.0)],
            }],
        )
        .await
        .unwrap();
        let first = delete_account(&pool, "account-test").await.unwrap();
        assert!(first.credential_id.is_none());
        let credential_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(credential_count, 1);
        let second = delete_account(&pool, "account-second").await.unwrap();
        assert_eq!(second.credential_id.as_deref(), Some("credential-test"));
        let credential_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(credential_count, 0);
    }

    #[tokio::test]
    async fn supports_five_accounts_for_each_provider_in_one_overview() {
        let directory = tempfile::tempdir().unwrap();
        let pool = open(&directory.path().join("scale.sqlite3")).await.unwrap();
        for provider in ["clinepass", "opencode-go", "ollama-cloud"] {
            for index in 0..5 {
                let credential_id = format!("{provider}-credential-{index}");
                let account_id = format!("{provider}-account-{index}");
                insert_provider_bundle(
                    &pool,
                    provider,
                    &credential_id,
                    &format!("{provider} 凭据 {index}"),
                    None,
                    None,
                    &[NewAccountRecord {
                        id: account_id,
                        label: format!("{provider} 账号 {index}"),
                        scope_id: (provider == "opencode-go").then(|| format!("workspace-{index}")),
                        plan: None,
                        windows: vec![quota_window(10.0 + f64::from(index))],
                    }],
                )
                .await
                .unwrap();
            }
        }
        let overview = overview(&pool).await.unwrap();
        assert_eq!(overview.accounts.len(), 15);
        for provider in ["clinepass", "opencode-go", "ollama-cloud"] {
            assert_eq!(
                overview
                    .accounts
                    .iter()
                    .filter(|account| account.provider == provider)
                    .count(),
                5
            );
        }
    }
}
