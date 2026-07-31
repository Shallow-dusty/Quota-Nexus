use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    clinepass, credential,
    domain::{
        AccountConnectionView, CreateClinePassAccountInput, OverviewView, QuotaWindowView,
        ValidateClinePassInput,
    },
    error::CommandError,
    storage,
};

pub struct AppState {
    pub db: SqlitePool,
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
pub async fn validate_clinepass(
    input: ValidateClinePassInput,
) -> Result<Vec<QuotaWindowView>, CommandError> {
    let api_key = validated_secret(input.api_key)?;
    clinepass::fetch(&api_key).await
}

#[tauri::command]
pub async fn create_clinepass_account(
    state: State<'_, AppState>,
    input: CreateClinePassAccountInput,
) -> Result<Vec<AccountConnectionView>, CommandError> {
    let account_label = validated_label(input.account_label, "账号标签")?;
    let credential_label = validated_label(input.credential_label, "凭据标签")?;
    if input.route_mode != "default" {
        return Err(CommandError::validation(
            "首个纵向切片仅支持默认网络栈 / TUN，固定出口将在 NetworkProfile 切片接入",
        ));
    }
    let api_key = validated_secret(input.api_key)?;
    let windows = clinepass::fetch(&api_key).await?;
    let account_id = Uuid::new_v4().to_string();
    let credential_id = Uuid::new_v4().to_string();

    credential::store(&credential_id, &api_key)?;
    let inserted = storage::insert_clinepass_account(
        &state.db,
        &account_id,
        &account_label,
        &credential_id,
        &credential_label,
        &windows,
    )
    .await;
    if let Err(error) = inserted {
        let _ = credential::delete(&credential_id);
        return Err(error);
    }
    storage::connections(&state.db).await
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
    let accounts = storage::enabled_accounts(pool, account_id).await?;
    if account_id.is_some() && accounts.is_empty() {
        return Err(CommandError::validation("找不到可刷新的账号"));
    }

    for (id, provider, credential_id) in accounts {
        if provider != "clinepass" {
            continue;
        }
        let secret = match credential::load(&credential_id) {
            Ok(secret) => secret,
            Err(_) => {
                storage::update_failure(pool, &id, "auth").await?;
                continue;
            }
        };
        let result = clinepass::fetch(&secret).await;
        match result {
            Ok(windows) => {
                storage::update_success(pool, &id, &credential_id, &windows).await?;
            }
            Err(error) => {
                storage::update_failure(pool, &id, error.category()).await?;
            }
        }
    }
    storage::overview(pool).await
}

fn validated_secret(value: String) -> Result<Zeroizing<String>, CommandError> {
    let value = Zeroizing::new(value.trim().to_string());
    if value.is_empty() {
        return Err(CommandError::validation("请填写 Cline Pass API Key"));
    }
    if value.len() > 2_400 {
        return Err(CommandError::validation("Cline Pass API Key 长度异常"));
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
