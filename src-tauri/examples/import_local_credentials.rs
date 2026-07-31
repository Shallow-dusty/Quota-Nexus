use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
};

use ai_quota_monitor_lib::local_import::{
    import_if_missing, CreateProviderAccountInput, RouteSelectionInput,
};
use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
struct CredentialFile {
    #[serde(default)]
    network_profiles: HashMap<String, NetworkProfile>,
    clinepass: Option<ClineCredential>,
    opencode_go: Option<CookieCredential>,
    ollama_cloud: Option<CookieCredential>,
}

#[derive(Debug, Deserialize)]
struct NetworkProfile {
    proxy_url: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

#[derive(Debug, Deserialize)]
struct ClineCredential {
    api_key: String,
    network_profile: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CookieCredential {
    cookie: String,
    #[serde(default)]
    workspace_id: String,
    network_profile: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = env::var_os("AIQM_IMPORT_DB")
        .map(PathBuf::from)
        .ok_or("AIQM_IMPORT_DB is required")?;
    let primary_path = env::var_os("AIQM_IMPORT_PRIMARY")
        .map(PathBuf::from)
        .ok_or("AIQM_IMPORT_PRIMARY is required")?;
    let second_opencode_path = env::var_os("AIQM_IMPORT_OPENCODE_2").map(PathBuf::from);

    let primary = read_credentials(&primary_path)?;
    let mut requests = Vec::new();
    if let Some(value) = primary.clinepass.as_ref() {
        requests.push(CreateProviderAccountInput {
            provider: "clinepass".into(),
            account_label: "Cline Pass".into(),
            credential_label: "导入 · Cline Pass · 1".into(),
            secret: value.api_key.clone(),
            existing_credential_id: None,
            workspace_id: None,
            route: route(&primary, value.network_profile.as_deref())?,
        });
    }
    if let Some(value) = primary.ollama_cloud.as_ref() {
        requests.push(CreateProviderAccountInput {
            provider: "ollama-cloud".into(),
            account_label: "Ollama Cloud".into(),
            credential_label: "导入 · Ollama Cloud · 1".into(),
            secret: value.cookie.clone(),
            existing_credential_id: None,
            workspace_id: None,
            route: route(&primary, value.network_profile.as_deref())?,
        });
    }
    if let Some(value) = primary.opencode_go.as_ref() {
        requests.push(open_code_request(&primary, value, 1)?);
    }
    if let Some(path) = second_opencode_path {
        let second = read_credentials(&path)?;
        if let Some(value) = second.opencode_go.as_ref() {
            requests.push(open_code_request(&second, value, 2)?);
        }
    }

    for input in requests {
        let provider = input.provider.clone();
        let outcome = import_if_missing(&db_path, input).await?;
        let status = if outcome.skipped {
            "skipped"
        } else {
            "imported"
        };
        println!("{provider}: {status}; accounts={}", outcome.account_count);
    }
    Ok(())
}

fn read_credentials(path: &Path) -> Result<CredentialFile, Box<dyn std::error::Error>> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn open_code_request(
    source: &CredentialFile,
    value: &CookieCredential,
    index: usize,
) -> Result<CreateProviderAccountInput, Box<dyn std::error::Error>> {
    Ok(CreateProviderAccountInput {
        provider: "opencode-go".into(),
        account_label: format!("OpenCode Go · {index}"),
        credential_label: format!("导入 · OpenCode Go · {index}"),
        secret: value.cookie.clone(),
        existing_credential_id: None,
        workspace_id: non_empty(&value.workspace_id),
        route: route(source, value.network_profile.as_deref())?,
    })
}

fn route(
    source: &CredentialFile,
    profile_name: Option<&str>,
) -> Result<RouteSelectionInput, Box<dyn std::error::Error>> {
    let Some(profile_name) = profile_name.filter(|value| !value.trim().is_empty()) else {
        return Ok(RouteSelectionInput {
            mode: "default".into(),
            profile_id: None,
            label: None,
            proxy_url: None,
            username: None,
            password: None,
        });
    };
    let profile = source
        .network_profiles
        .get(profile_name)
        .ok_or_else(|| format!("network profile not found: {profile_name}"))?;
    Ok(RouteSelectionInput {
        mode: "new".into(),
        profile_id: None,
        label: Some(profile_name.to_string()),
        proxy_url: Some(profile.proxy_url.clone()),
        username: non_empty(&profile.username),
        password: non_empty(&profile.password),
    })
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}
