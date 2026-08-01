use std::{
    collections::HashMap,
    io::Write,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use chrono::Utc;
use futures::{stream, StreamExt};
use reqwest::Client;
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Semaphore;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    clinepass, credential,
    domain::{
        AccountConnectionView, AppSettingsView, CreateProviderAccountInput, CredentialOptionView,
        HistoryPointView, NetworkProfileView, OverviewView, ProviderHealthView,
        ProviderValidationView, RouteSelectionInput, UpdateAccountInput, UpdateCredentialInput,
        UpdateNetworkProfileInput, UpdateSettingsInput, ValidateProviderInput,
    },
    error::CommandError,
    network::{self, NewNetworkProfile},
    ollama, opencode, storage,
};

pub struct AppState {
    pub db: SqlitePool,
    pub tray_enabled: Arc<AtomicBool>,
}

struct ResolvedRoute {
    client: Client,
    network_profile_id: Option<String>,
    new_profile: Option<NewNetworkProfile>,
    new_auth: Option<(String, String)>,
    explicit: bool,
}

enum ProviderPayload {
    Cline(Vec<crate::domain::QuotaWindowView>),
    Ollama(ollama::OllamaQuota),
    OpenCode(Vec<opencode::WorkspaceQuota>),
}

#[tauri::command]
pub async fn get_overview(state: State<'_, AppState>) -> Result<OverviewView, CommandError> {
    storage::overview(&state.db).await
}

#[tauri::command]
pub async fn get_connections(
    state: State<'_, AppState>,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    storage::connections(&state.db).await
}

#[tauri::command]
pub async fn get_network_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<NetworkProfileView>, CommandError> {
    storage::network_profiles(&state.db).await
}

#[tauri::command]
pub async fn update_network_profile(
    state: State<'_, AppState>,
    input: UpdateNetworkProfileInput,
) -> Result<Vec<NetworkProfileView>, CommandError> {
    let id = input.id.trim();
    if id.is_empty() {
        return Err(CommandError::validation("请选择要更新的固定出口"));
    }
    let existing = storage::network_profile_by_id(&state.db, id).await?;
    let old_auth = if existing.has_auth {
        Some(credential::load_proxy_auth(id)?)
    } else {
        None
    };
    let (mut profile, new_auth) = network::parse_new_profile(
        id.to_string(),
        &input.label,
        &input.proxy_url,
        input.username.as_deref(),
        input.password.as_deref(),
    )?;
    let preserve_auth = new_auth.is_none() && !input.clear_auth;
    profile.has_auth = new_auth.is_some() || (preserve_auth && existing.has_auth);
    let selected_auth = if let Some((username, password)) = &new_auth {
        Some(crate::credential::ProxyAuth {
            username: Zeroizing::new(username.clone()),
            password: Zeroizing::new(password.clone()),
        })
    } else if preserve_auth {
        old_auth.as_ref().map(|auth| crate::credential::ProxyAuth {
            username: Zeroizing::new(auth.username.to_string()),
            password: Zeroizing::new(auth.password.to_string()),
        })
    } else {
        None
    };
    let client_auth = selected_auth
        .as_ref()
        .map(|auth| (auth.username.to_string(), auth.password.to_string()));
    network::build_new_profile_client(&profile, client_auth.as_ref())?;
    if let Some((username, password)) = &new_auth {
        credential::store_proxy_auth(id, username, password)?;
    }
    if let Err(error) = storage::update_network_profile(&state.db, &profile).await {
        if let Some(auth) = old_auth.as_ref() {
            let _ = credential::store_proxy_auth(id, &auth.username, &auth.password);
        } else if new_auth.is_some() {
            let _ = credential::delete_proxy_auth(id);
        }
        return Err(error);
    }
    if input.clear_auth && existing.has_auth {
        credential::delete_proxy_auth(id)?;
    }
    storage::network_profiles(&state.db).await
}

#[tauri::command]
pub async fn delete_network_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<NetworkProfileView>, CommandError> {
    let id = id.trim();
    let had_auth = storage::delete_network_profile(&state.db, id).await?;
    if had_auth {
        credential::delete_proxy_auth(id)?;
    }
    storage::network_profiles(&state.db).await
}

#[tauri::command]
pub async fn get_credentials(
    state: State<'_, AppState>,
) -> Result<Vec<CredentialOptionView>, CommandError> {
    storage::credential_options(&state.db).await
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettingsView, CommandError> {
    storage::settings(&state.db).await
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: UpdateSettingsInput,
) -> Result<AppSettingsView, CommandError> {
    let previous = storage::settings(&state.db).await?;
    apply_autostart(&app, input.autostart_enabled)?;
    let tray_enabled = input.tray_enabled;
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Err(_error) = tray.set_visible(tray_enabled) {
            let _ = apply_autostart(&app, previous.autostart_enabled);
            return Err(CommandError::storage("无法更新托盘状态"));
        }
    }
    let stored = match storage::update_settings(&state.db, input).await {
        Ok(stored) => stored,
        Err(error) => {
            if let Some(tray) = app.tray_by_id("main-tray") {
                let _ = tray.set_visible(previous.tray_enabled);
            }
            let _ = apply_autostart(&app, previous.autostart_enabled);
            return Err(error);
        }
    };
    state.tray_enabled.store(tray_enabled, Ordering::Relaxed);
    Ok(stored)
}

fn apply_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), CommandError> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|_| CommandError::storage("无法启用开机自启"))?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|_| CommandError::storage("无法关闭开机自启"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_provider_health(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderHealthView>, CommandError> {
    storage::provider_health(&state.db).await
}

#[tauri::command]
pub async fn get_history(
    state: State<'_, AppState>,
    days: i64,
) -> Result<Vec<HistoryPointView>, CommandError> {
    storage::history(&state.db, days).await
}

#[tauri::command]
pub async fn export_latest_snapshot(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, CommandError> {
    let overview = storage::overview(&state.db).await?;
    let document = sanitized_snapshot(&overview);
    let directory = app
        .path()
        .download_dir()
        .map_err(|_| CommandError::storage("无法定位下载目录"))?;
    let filename = format!(
        "ai-quota-snapshot-{}.json",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    let path = directory.join(filename);
    let contents = serde_json::to_vec_pretty(&document)
        .map_err(|_| CommandError::storage("无法生成脱敏快照"))?;
    std::fs::write(&path, contents).map_err(|_| CommandError::storage("无法写入脱敏快照"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_diagnostic_manifest() -> Vec<&'static str> {
    vec![
        "manifest.json（应用版本、系统、数据库 schema）",
        "provider-health.json（供应商熔断与成功时间）",
        "settings.json（无秘密的应用设置）",
        "latest-snapshot.json（脱敏后的最新额度）",
    ]
}

#[tauri::command]
pub async fn export_diagnostics(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, CommandError> {
    let overview = storage::overview(&state.db).await?;
    let health = storage::provider_health(&state.db).await?;
    let settings = storage::settings(&state.db).await?;
    let schema_version: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(&state.db)
        .await
        .map_err(|_| CommandError::storage("无法读取数据库 schema 版本"))?;
    let generated_at = Utc::now();
    let manifest = serde_json::json!({
        "application": "AI Quota Monitor",
        "version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "schemaVersion": schema_version,
        "generatedAt": generated_at.to_rfc3339(),
        "files": get_diagnostic_manifest(),
    });
    let directory = app
        .path()
        .download_dir()
        .map_err(|_| CommandError::storage("无法定位下载目录"))?;
    let path = directory.join(format!(
        "ai-quota-diagnostics-{}.zip",
        generated_at.format("%Y%m%d-%H%M%S")
    ));
    let entries = diagnostic_entries(manifest, health, settings, sanitized_snapshot(&overview))?;
    write_diagnostic_archive(&path, &entries)?;
    Ok(path.to_string_lossy().into_owned())
}

fn diagnostic_entries(
    manifest: serde_json::Value,
    health: Vec<ProviderHealthView>,
    settings: AppSettingsView,
    snapshot: serde_json::Value,
) -> Result<Vec<(&'static str, Vec<u8>)>, CommandError> {
    [
        ("manifest.json", manifest),
        (
            "provider-health.json",
            serde_json::to_value(health)
                .map_err(|_| CommandError::storage("无法序列化供应商诊断"))?,
        ),
        (
            "settings.json",
            serde_json::to_value(settings)
                .map_err(|_| CommandError::storage("无法序列化应用设置"))?,
        ),
        ("latest-snapshot.json", snapshot),
    ]
    .into_iter()
    .map(|(name, value)| {
        serde_json::to_vec_pretty(&value)
            .map(|bytes| (name, bytes))
            .map_err(|_| CommandError::storage("无法生成诊断内容"))
    })
    .collect()
}

fn write_diagnostic_archive(
    path: &Path,
    entries: &[(&'static str, Vec<u8>)],
) -> Result<(), CommandError> {
    let file = std::fs::File::create(path).map_err(|_| CommandError::storage("无法创建诊断包"))?;
    let mut archive = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in entries {
        archive
            .start_file(name, options)
            .map_err(|_| CommandError::storage("无法写入诊断包"))?;
        archive
            .write_all(bytes)
            .map_err(|_| CommandError::storage("无法写入诊断内容"))?;
    }
    archive
        .finish()
        .map_err(|_| CommandError::storage("无法完成诊断包"))?;
    Ok(())
}

#[tauri::command]
pub fn send_test_notification(app: tauri::AppHandle) -> Result<(), CommandError> {
    app.notification()
        .builder()
        .title("AI Quota Monitor")
        .body("Windows 通知已连接；正式告警会按状态代次去重。")
        .show()
        .map_err(|_| CommandError::storage("无法发送 Windows 通知"))
}

fn sanitized_snapshot(overview: &OverviewView) -> serde_json::Value {
    let accounts = overview
        .accounts
        .iter()
        .map(|account| {
            serde_json::json!({
                "provider": account.provider,
                "providerName": account.provider_name,
                "plan": account.plan,
                "state": account.state,
                "freshness": account.freshness,
                "lastSuccessAt": account.last_success_at,
                "errorCategory": account.error_category,
                "windows": account.windows,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "schemaVersion": 1,
        "exportedAt": Utc::now().to_rfc3339(),
        "refreshedAt": overview.refreshed_at,
        "accounts": accounts,
    })
}

#[tauri::command]
pub async fn validate_provider(
    state: State<'_, AppState>,
    input: ValidateProviderInput,
) -> Result<ProviderValidationView, CommandError> {
    validate_provider_name(&input.provider)?;
    let secret = validated_secret(&input.provider, input.secret)?;
    let route = resolve_route(&state.db, input.route).await?;
    let result = fetch_provider(
        &input.provider,
        &route.client,
        &secret,
        input.workspace_id.as_deref(),
    )
    .await
    .map_err(|error| route_error(error, route.explicit))?;
    Ok(validation_view(result))
}

#[tauri::command]
pub async fn validate_existing_credential(
    state: State<'_, AppState>,
    credential_id: String,
    workspace_id: Option<String>,
) -> Result<ProviderValidationView, CommandError> {
    let context = storage::credential_context(&state.db, credential_id.trim()).await?;
    let secret = credential::load(&context.id)?;
    let client = client_for_credential(&context)?;
    let result =
        fetch_provider(&context.provider, &client, &secret, workspace_id.as_deref()).await?;
    Ok(validation_view(result))
}

#[tauri::command]
pub async fn create_provider_account(
    state: State<'_, AppState>,
    input: CreateProviderAccountInput,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    create_provider_account_core(&state.db, input).await
}

pub(crate) async fn create_provider_account_core(
    db: &SqlitePool,
    input: CreateProviderAccountInput,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    validate_provider_name(&input.provider)?;
    let account_label = validated_label(input.account_label, "账号标签")?;
    if let Some(credential_id) = input
        .existing_credential_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let context = storage::credential_context(db, credential_id).await?;
        if context.provider != input.provider {
            return Err(CommandError::validation("已有凭据与所选供应商不匹配"));
        }
        let secret = credential::load(&context.id)?;
        let client = client_for_credential(&context)?;
        let payload = fetch_provider(
            &input.provider,
            &client,
            &secret,
            input.workspace_id.as_deref(),
        )
        .await?;
        let accounts = account_records(&account_label, payload);
        storage::insert_accounts_for_credential(db, &context.id, &input.provider, &accounts)
            .await?;
        return storage::connections(db).await;
    }
    let credential_label = validated_label(input.credential_label, "凭据标签")?;
    let secret = validated_secret(&input.provider, input.secret)?;
    let route = resolve_route(db, input.route).await?;
    let payload = fetch_provider(
        &input.provider,
        &route.client,
        &secret,
        input.workspace_id.as_deref(),
    )
    .await
    .map_err(|error| route_error(error, route.explicit))?;

    let credential_id = Uuid::new_v4().to_string();
    let accounts = account_records(&account_label, payload);
    credential::store(&credential_id, &secret)?;

    let mut stored_proxy_auth = false;
    if let (Some(profile), Some((username, password))) = (&route.new_profile, &route.new_auth) {
        if let Err(error) = credential::store_proxy_auth(&profile.id, username, password) {
            let _ = credential::delete(&credential_id);
            return Err(error);
        }
        stored_proxy_auth = true;
    }

    let inserted = storage::insert_provider_bundle(
        db,
        &input.provider,
        &credential_id,
        &credential_label,
        route.network_profile_id.as_deref(),
        route.new_profile.as_ref(),
        &accounts,
    )
    .await;
    if let Err(error) = inserted {
        let _ = credential::delete(&credential_id);
        if stored_proxy_auth {
            if let Some(profile) = &route.new_profile {
                let _ = credential::delete_proxy_auth(&profile.id);
            }
        }
        return Err(error);
    }
    storage::connections(db).await
}

#[tauri::command]
pub async fn update_credential(
    state: State<'_, AppState>,
    input: UpdateCredentialInput,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    let credential_id = input.credential_id.trim();
    if credential_id.is_empty() {
        return Err(CommandError::validation("请选择要更新的凭据"));
    }
    let context = storage::credential_context(&state.db, credential_id).await?;
    let secret = validated_secret(&context.provider, input.secret)?;
    let client = client_for_credential(&context)?;
    fetch_provider(
        &context.provider,
        &client,
        &secret,
        context.scope_id.as_deref(),
    )
    .await?;
    let old_secret = credential::load(credential_id)?;
    credential::store(credential_id, &secret)?;
    if let Err(error) = storage::mark_credential_updated(&state.db, credential_id).await {
        let _ = credential::store(credential_id, &old_secret);
        return Err(error);
    }
    storage::connections(&state.db).await
}

#[tauri::command]
pub async fn update_account(
    state: State<'_, AppState>,
    input: UpdateAccountInput,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    let label = validated_label(input.label, "账号标签")?;
    storage::update_account(&state.db, &input.id, &label, input.enabled).await?;
    storage::connections(&state.db).await
}

#[tauri::command]
pub async fn delete_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    let outcome = storage::delete_account(&state.db, id.trim()).await?;
    if let Some(credential_id) = outcome.credential_id {
        credential::delete(&credential_id)?;
    }
    storage::connections(&state.db).await
}

#[tauri::command]
pub async fn refresh_all(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<OverviewView, CommandError> {
    let overview = refresh(&app, &state.db, None, true).await?.0;
    let _ = app.emit("overview-updated", &overview);
    Ok(overview)
}

#[tauri::command]
pub async fn refresh_account(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<OverviewView, CommandError> {
    let overview = refresh(&app, &state.db, Some(id.as_str()), true).await?.0;
    let _ = app.emit("overview-updated", &overview);
    Ok(overview)
}

pub(crate) async fn scheduled_refresh(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
) -> Result<Option<OverviewView>, CommandError> {
    let (overview, refreshed) = refresh(app, pool, None, false).await?;
    Ok((refreshed > 0).then_some(overview))
}

async fn refresh(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    account_id: Option<&str>,
    manual: bool,
) -> Result<(OverviewView, usize), CommandError> {
    let targets = storage::refresh_targets(pool, account_id, manual).await?;
    if account_id.is_some() && targets.is_empty() {
        return Err(CommandError::validation(
            "账号已暂停、凭据失效、处于熔断期或不存在",
        ));
    }
    let count = targets.len();
    let pool = pool.clone();
    let provider_limits = Arc::new(HashMap::from([
        ("clinepass".to_string(), Arc::new(Semaphore::new(2))),
        ("opencode-go".to_string(), Arc::new(Semaphore::new(2))),
        ("ollama-cloud".to_string(), Arc::new(Semaphore::new(2))),
    ]));
    let results = stream::iter(targets.into_iter().map(|target| {
        let app = app.clone();
        let pool = pool.clone();
        let semaphore = provider_limits
            .get(&target.provider)
            .cloned()
            .unwrap_or_else(|| Arc::new(Semaphore::new(1)));
        async move {
            let _permit = semaphore
                .acquire_owned()
                .await
                .map_err(|_| CommandError::network("刷新并发控制器已关闭"))?;
            refresh_target(&app, &pool, target).await
        }
    }))
    .buffer_unordered(4)
    .collect::<Vec<_>>()
    .await;
    for result in results {
        result?;
    }
    Ok((storage::overview(&pool).await?, count))
}

async fn refresh_target(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    target: storage::RefreshTarget,
) -> Result<(), CommandError> {
    let explicit = target.network_profile_id.is_some();
    let secret = match credential::load(&target.credential_id) {
        Ok(secret) => secret,
        Err(_) => {
            storage::update_failure(pool, &target, &CommandError::auth(), explicit).await?;
            let events = storage::evaluate_health_alert(pool, &target.id, "auth").await?;
            send_alerts(app, pool, events).await;
            return Ok(());
        }
    };
    let client = match client_for_target(&target) {
        Ok(client) => client,
        Err(error) => {
            storage::update_failure(pool, &target, &error, explicit).await?;
            let category = if explicit && error.code == "network" {
                "proxy"
            } else {
                error.category()
            };
            let events = storage::evaluate_health_alert(pool, &target.id, category).await?;
            send_alerts(app, pool, events).await;
            return Ok(());
        }
    };
    let result: Result<(Option<String>, Vec<crate::domain::QuotaWindowView>), CommandError> =
        match target.provider.as_str() {
            "clinepass" => clinepass::fetch(&client, &secret)
                .await
                .map(|windows| (None, windows)),
            "ollama-cloud" => ollama::fetch(&client, &secret)
                .await
                .map(|quota| (quota.plan, quota.windows)),
            "opencode-go" => match target.scope_id.as_deref() {
                Some(workspace_id) => opencode::fetch_workspace(&client, &secret, workspace_id)
                    .await
                    .map(|windows| (None, windows)),
                None => Err(CommandError::parser("OpenCode Go 账号缺少 Workspace ID")),
            },
            _ => Err(CommandError::parser("未知供应商")),
        };
    match result {
        Ok((plan, windows)) => {
            storage::update_success(
                pool,
                &target.id,
                &target.credential_id,
                plan.as_deref(),
                &windows,
            )
            .await?;
            let mut events = storage::evaluate_quota_alerts(pool, &target.id, &windows).await?;
            events.extend(storage::evaluate_health_alert(pool, &target.id, "normal").await?);
            send_alerts(app, pool, events).await;
            Ok(())
        }
        Err(error) => {
            storage::update_failure(pool, &target, &error, explicit).await?;
            let category = if explicit && error.code == "network" {
                "proxy"
            } else {
                error.category()
            };
            let events = storage::evaluate_health_alert(pool, &target.id, category).await?;
            send_alerts(app, pool, events).await;
            Ok(())
        }
    }
}

async fn send_alerts(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    events: Vec<storage::AlertEvent>,
) {
    for event in events {
        let delivered = app
            .notification()
            .builder()
            .title(event.title.clone())
            .body(event.body.clone())
            .show()
            .is_ok();
        if delivered {
            let _ = storage::mark_alert_notified(pool, &event).await;
        }
    }
}

async fn resolve_route(
    pool: &SqlitePool,
    input: RouteSelectionInput,
) -> Result<ResolvedRoute, CommandError> {
    match input.mode.as_str() {
        "default" => Ok(ResolvedRoute {
            client: network::build_default_client()?,
            network_profile_id: None,
            new_profile: None,
            new_auth: None,
            explicit: false,
        }),
        "existing" => {
            let profile_id = input
                .profile_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| CommandError::validation("请选择固定出口"))?;
            let profile = storage::network_profile_by_id(pool, profile_id).await?;
            let auth = if profile.has_auth {
                Some(credential::load_proxy_auth(&profile.id)?)
            } else {
                None
            };
            let client = network::build_profile_client(&profile, auth.as_ref())?;
            Ok(ResolvedRoute {
                client,
                network_profile_id: Some(profile.id),
                new_profile: None,
                new_auth: None,
                explicit: true,
            })
        }
        "new" => {
            let profile_id = Uuid::new_v4().to_string();
            let (profile, auth) = network::parse_new_profile(
                profile_id.clone(),
                input.label.as_deref().unwrap_or_default(),
                input.proxy_url.as_deref().unwrap_or_default(),
                input.username.as_deref(),
                input.password.as_deref(),
            )?;
            let client = network::build_new_profile_client(&profile, auth.as_ref())?;
            Ok(ResolvedRoute {
                client,
                network_profile_id: Some(profile_id),
                new_profile: Some(profile),
                new_auth: auth,
                explicit: true,
            })
        }
        _ => Err(CommandError::validation("未知网络出口模式")),
    }
}

fn client_for_target(target: &storage::RefreshTarget) -> Result<Client, CommandError> {
    match target.network_profile() {
        Some(profile) => {
            let auth = if profile.has_auth {
                Some(credential::load_proxy_auth(&profile.id)?)
            } else {
                None
            };
            network::build_profile_client(&profile, auth.as_ref())
        }
        None => network::build_default_client(),
    }
}

fn client_for_credential(context: &storage::CredentialContext) -> Result<Client, CommandError> {
    match context.network_profile() {
        Some(profile) => {
            let auth = if profile.has_auth {
                Some(credential::load_proxy_auth(&profile.id)?)
            } else {
                None
            };
            network::build_profile_client(&profile, auth.as_ref())
        }
        None => network::build_default_client(),
    }
}

async fn fetch_provider(
    provider: &str,
    client: &Client,
    secret: &str,
    workspace_id: Option<&str>,
) -> Result<ProviderPayload, CommandError> {
    match provider {
        "clinepass" => clinepass::fetch(client, secret)
            .await
            .map(ProviderPayload::Cline),
        "ollama-cloud" => ollama::fetch(client, secret)
            .await
            .map(ProviderPayload::Ollama),
        "opencode-go" => opencode::fetch_accounts(client, secret, workspace_id)
            .await
            .map(ProviderPayload::OpenCode),
        _ => Err(CommandError::validation("未知供应商")),
    }
}

fn validation_view(payload: ProviderPayload) -> ProviderValidationView {
    match payload {
        ProviderPayload::Cline(windows) => ProviderValidationView {
            windows,
            discovered_account_count: 1,
        },
        ProviderPayload::Ollama(quota) => ProviderValidationView {
            windows: quota.windows,
            discovered_account_count: 1,
        },
        ProviderPayload::OpenCode(accounts) => ProviderValidationView {
            windows: accounts
                .first()
                .map(|account| account.windows.clone())
                .unwrap_or_default(),
            discovered_account_count: accounts.len(),
        },
    }
}

fn account_records(
    account_label: &str,
    payload: ProviderPayload,
) -> Vec<storage::NewAccountRecord> {
    match payload {
        ProviderPayload::Cline(windows) => vec![storage::NewAccountRecord {
            id: Uuid::new_v4().to_string(),
            label: account_label.into(),
            scope_id: None,
            plan: None,
            windows,
        }],
        ProviderPayload::Ollama(quota) => vec![storage::NewAccountRecord {
            id: Uuid::new_v4().to_string(),
            label: account_label.into(),
            scope_id: None,
            plan: quota.plan,
            windows: quota.windows,
        }],
        ProviderPayload::OpenCode(accounts) => {
            let multiple = accounts.len() > 1;
            accounts
                .into_iter()
                .map(|account| storage::NewAccountRecord {
                    id: Uuid::new_v4().to_string(),
                    label: if multiple {
                        format!(
                            "{} · {}",
                            account_label,
                            masked_workspace_suffix(&account.workspace_id)
                        )
                    } else {
                        account_label.into()
                    },
                    scope_id: Some(account.workspace_id),
                    plan: None,
                    windows: account.windows,
                })
                .collect()
        }
    }
}

fn masked_workspace_suffix(workspace_id: &str) -> String {
    let suffix = workspace_id
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    format!("wrk_••••{suffix}")
}

fn route_error(error: CommandError, explicit: bool) -> CommandError {
    if explicit && error.code == "network" {
        CommandError::proxy("固定出口连接失败，未回退默认网络栈")
    } else {
        error
    }
}

fn validated_secret(provider: &str, value: String) -> Result<Zeroizing<String>, CommandError> {
    let value = normalize_credential(provider, value.trim());
    let value = Zeroizing::new(value);
    if value.is_empty() {
        return Err(CommandError::validation("请填写供应商凭据"));
    }
    if value.len() > 2_400 {
        return Err(CommandError::validation(
            "当前凭据超过 Windows Credential Manager 首版存储上限",
        ));
    }
    Ok(value)
}

fn normalize_credential(provider: &str, input: &str) -> String {
    let header_names: &[&str] = match provider {
        "clinepass" => &["authorization"],
        "opencode-go" => &["cookie"],
        "ollama-cloud" => &["authorization", "cookie"],
        _ => &[],
    };
    let from_json = serde_json::from_str::<serde_json::Value>(input)
        .ok()
        .and_then(|value| find_header_value(&value, header_names));
    let from_header_lines = input.lines().find_map(|line| {
        let line = line.trim().trim_matches(|ch| matches!(ch, '\'' | '"'));
        let (name, value) = line.split_once(':')?;
        header_names
            .iter()
            .any(|candidate| name.trim().eq_ignore_ascii_case(candidate))
            .then(|| value.trim().trim_matches(|ch| matches!(ch, '\'' | '"')).to_string())
    });
    let normalized = from_json
        .or(from_header_lines)
        .unwrap_or_else(|| input.trim().to_string());
    if provider == "clinepass" || (provider == "ollama-cloud" && !normalized.contains('=')) {
        normalized
            .strip_prefix("Bearer ")
            .or_else(|| normalized.strip_prefix("bearer "))
            .unwrap_or(&normalized)
            .trim()
            .to_string()
    } else {
        normalized
    }
}

fn find_header_value(value: &serde_json::Value, header_names: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(object) => {
            let direct = object
                .get("name")
                .and_then(serde_json::Value::as_str)
                .filter(|name| {
                    header_names
                        .iter()
                        .any(|candidate| name.eq_ignore_ascii_case(candidate))
                })
                .and_then(|_| object.get("value"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            direct.or_else(|| {
                object
                    .values()
                    .find_map(|nested| find_header_value(nested, header_names))
            })
        }
        serde_json::Value::Array(values) => values
            .iter()
            .find_map(|nested| find_header_value(nested, header_names)),
        _ => None,
    }
}

fn validated_label(value: String, field: &str) -> Result<String, CommandError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(CommandError::validation(format!("请填写{field}")));
    }
    if value.chars().count() > 80 {
        return Err(CommandError::validation(format!(
            "{field}不能超过 80 个字符"
        )));
    }
    Ok(value.to_string())
}

fn validate_provider_name(provider: &str) -> Result<(), CommandError> {
    if matches!(provider, "clinepass" | "opencode-go" | "ollama-cloud") {
        Ok(())
    } else {
        Err(CommandError::validation("未知供应商"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_workspace_without_returning_full_id() {
        let masked = masked_workspace_suffix("wrk_01ABCDEF");
        assert_eq!(masked, "wrk_••••CDEF");
        assert!(!masked.contains("01AB"));
    }

    #[test]
    fn extracts_provider_credentials_from_firefox_request_json() {
        let request = r#"{
          "requestHeaders":{"headers":[
            {"name":"Accept","value":"text/html"},
            {"name":"Cookie","value":"auth=session-value; flag=1"}
          ]}
        }"#;
        assert_eq!(
            normalize_credential("opencode-go", request),
            "auth=session-value; flag=1"
        );
    }

    #[test]
    fn normalizes_authorization_headers_without_damaging_ollama_keys() {
        assert_eq!(
            normalize_credential("clinepass", "Authorization: Bearer cline-key"),
            "cline-key"
        );
        assert_eq!(
            normalize_credential("ollama-cloud", "ollama.key"),
            "ollama.key"
        );
    }

    #[test]
    fn snapshot_export_omits_local_identity_and_credential_fields() {
        let overview = OverviewView {
            accounts: vec![crate::domain::ServiceQuotaView {
                id: "private-account-id".into(),
                provider: "clinepass".into(),
                provider_name: "Cline Pass".into(),
                account_label: "private-account-label".into(),
                plan: Some("Pro".into()),
                state: "ready".into(),
                freshness: "fresh".into(),
                last_success_at: Some("2026-07-31T00:00:00Z".into()),
                error_category: None,
                windows: vec![crate::domain::TonedQuotaWindow {
                    id: "weekly".into(),
                    kind: "weekly".into(),
                    label: "周额度".into(),
                    used_percent: 42.0,
                    resets_at: None,
                    tone: "normal".into(),
                }],
            }],
            refreshed_at: Some("2026-07-31T00:00:00Z".into()),
            source: "tauri",
        };
        let export = sanitized_snapshot(&overview).to_string();
        assert!(!export.contains("private-account-id"));
        assert!(!export.contains("private-account-label"));
        assert!(!export.contains("credential"));
        assert!(export.contains("clinepass"));
        assert!(export.contains("42.0"));
    }

    #[test]
    fn diagnostic_archive_contains_only_declared_redacted_json() {
        use std::io::Read;

        let overview = OverviewView {
            accounts: vec![crate::domain::ServiceQuotaView {
                id: "private-account-id".into(),
                provider: "ollama-cloud".into(),
                provider_name: "Ollama Cloud".into(),
                account_label: "private-account-label".into(),
                plan: Some("Pro".into()),
                state: "ready".into(),
                freshness: "fresh".into(),
                last_success_at: Some("2026-07-31T00:00:00Z".into()),
                error_category: None,
                windows: vec![crate::domain::TonedQuotaWindow {
                    id: "weekly".into(),
                    kind: "weekly".into(),
                    label: "周额度".into(),
                    used_percent: 27.0,
                    resets_at: None,
                    tone: "normal".into(),
                }],
            }],
            refreshed_at: Some("2026-07-31T00:00:00Z".into()),
            source: "tauri",
        };
        let manifest = serde_json::json!({
            "application": "AI Quota Monitor",
            "files": get_diagnostic_manifest(),
        });
        let health = vec![ProviderHealthView {
            provider: "ollama-cloud".into(),
            provider_name: "Ollama Cloud".into(),
            circuit_state: "closed".into(),
            last_success_at: Some("2026-07-31T00:00:00Z".into()),
            next_probe_at: None,
            consecutive_failures: 0,
        }];
        let settings = AppSettingsView {
            refresh_interval_minutes: Some(15),
            adaptive_refresh: true,
            warning_threshold: 70.0,
            high_threshold: 85.0,
            critical_threshold: 95.0,
            history_days: Some(30),
            tray_enabled: true,
            autostart_enabled: false,
            privacy_mode: false,
            notify_auth: true,
            notify_stale: true,
            notify_recovery: false,
        };
        let entries =
            diagnostic_entries(manifest, health, settings, sanitized_snapshot(&overview)).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("diagnostics.zip");
        write_diagnostic_archive(&path, &entries).unwrap();

        let file = std::fs::File::open(path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 4);
        let mut combined = String::new();
        for expected in [
            "manifest.json",
            "provider-health.json",
            "settings.json",
            "latest-snapshot.json",
        ] {
            let mut entry = archive.by_name(expected).unwrap();
            entry.read_to_string(&mut combined).unwrap();
        }
        assert!(!combined.contains("private-account-id"));
        assert!(!combined.contains("private-account-label"));
        for forbidden in [
            "Cookie",
            "Authorization",
            "apiKey",
            "credentialId",
            "proxyUrl",
        ] {
            assert!(!combined.contains(forbidden));
        }
        assert!(combined.contains("Ollama Cloud"));
    }
}
