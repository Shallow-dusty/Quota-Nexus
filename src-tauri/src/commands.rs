use reqwest::Client;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    clinepass, credential,
    domain::{
        AccountConnectionView, CreateProviderAccountInput, NetworkProfileView, OverviewView,
        ProviderValidationView, RouteSelectionInput, ValidateProviderInput,
    },
    error::CommandError,
    network::{self, NewNetworkProfile},
    ollama, opencode, storage,
};

pub struct AppState {
    pub db: SqlitePool,
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
pub async fn validate_provider(
    state: State<'_, AppState>,
    input: ValidateProviderInput,
) -> Result<ProviderValidationView, CommandError> {
    validate_provider_name(&input.provider)?;
    let secret = validated_secret(input.secret)?;
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
    let credential_label = validated_label(input.credential_label, "凭据标签")?;
    let secret = validated_secret(input.secret)?;
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
pub async fn refresh_all(state: State<'_, AppState>) -> Result<OverviewView, CommandError> {
    refresh(&state.db, None).await
}

#[tauri::command]
pub async fn refresh_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<OverviewView, CommandError> {
    refresh(&state.db, Some(id.as_str())).await
}

async fn refresh(
    pool: &SqlitePool,
    account_id: Option<&str>,
) -> Result<OverviewView, CommandError> {
    let targets = storage::refresh_targets(pool, account_id).await?;
    if account_id.is_some() && targets.is_empty() {
        return Err(CommandError::validation("找不到可刷新的账号"));
    }

    for target in targets {
        let secret = match credential::load(&target.credential_id) {
            Ok(secret) => secret,
            Err(_) => {
                storage::update_failure(pool, &target.id, "auth").await?;
                continue;
            }
        };
        let explicit = target.network_profile_id.is_some();
        let client = match client_for_target(&target) {
            Ok(client) => client,
            Err(_) => {
                storage::update_failure(pool, &target.id, "proxy").await?;
                continue;
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
            }
            Err(error) => {
                let category = if explicit && error.code == "network" {
                    "proxy"
                } else {
                    error.category()
                };
                storage::update_failure(pool, &target.id, category).await?;
            }
        }
    }
    storage::overview(pool).await
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

fn validated_secret(value: String) -> Result<Zeroizing<String>, CommandError> {
    let value = Zeroizing::new(value.trim().to_string());
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
}
