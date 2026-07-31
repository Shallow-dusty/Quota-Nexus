use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindowView {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub used_percent: f64,
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceQuotaView {
    pub id: String,
    pub provider: String,
    pub provider_name: String,
    pub account_label: String,
    pub plan: Option<String>,
    pub state: String,
    pub freshness: String,
    pub last_success_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_category: Option<String>,
    pub windows: Vec<QuotaWindowView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewView {
    pub accounts: Vec<ServiceQuotaView>,
    pub refreshed_at: Option<String>,
    pub source: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountConnectionView {
    pub id: String,
    pub provider: String,
    pub provider_name: String,
    pub account_label: String,
    pub plan: Option<String>,
    pub credential_label: String,
    pub credential_id: String,
    pub shared_account_count: i64,
    pub route_mode_label: String,
    pub state: String,
    pub freshness: String,
    pub last_success_at: Option<String>,
    pub next_refresh_at: Option<String>,
    pub next_attempt_at: Option<String>,
    pub effective_refresh_minutes: Option<i64>,
    pub consecutive_failures: i64,
    pub auth_paused: bool,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_category: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthView {
    pub provider: String,
    pub provider_name: String,
    pub circuit_state: String,
    pub last_success_at: Option<String>,
    pub next_probe_at: Option<String>,
    pub consecutive_failures: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsView {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfileView {
    pub id: String,
    pub label: String,
    pub endpoint_label: String,
    pub has_auth: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialOptionView {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub shared_account_count: i64,
    pub route_mode_label: String,
    pub last_validated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPointView {
    pub account_id: String,
    pub provider: String,
    pub account_label: String,
    pub window_kind: String,
    pub window_label: String,
    pub used_percent: f64,
    pub observed_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNetworkProfileInput {
    pub id: String,
    pub label: String,
    pub proxy_url: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub clear_auth: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderValidationView {
    pub windows: Vec<QuotaWindowView>,
    pub discovered_account_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteSelectionInput {
    pub mode: String,
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateProviderInput {
    pub provider: String,
    pub secret: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub route: RouteSelectionInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProviderAccountInput {
    pub provider: String,
    pub account_label: String,
    pub credential_label: String,
    pub secret: String,
    #[serde(default)]
    pub existing_credential_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub route: RouteSelectionInput,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCredentialInput {
    pub credential_id: String,
    pub secret: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAccountInput {
    pub id: String,
    pub label: String,
    pub enabled: bool,
}
