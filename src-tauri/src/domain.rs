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
    pub shared_account_count: i64,
    pub route_mode_label: String,
    pub state: String,
    pub freshness: String,
    pub last_success_at: Option<String>,
    pub next_refresh_at: Option<String>,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_category: Option<String>,
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
    pub workspace_id: Option<String>,
    pub route: RouteSelectionInput,
}
