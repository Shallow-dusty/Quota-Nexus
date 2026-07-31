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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateClinePassInput {
    pub api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClinePassAccountInput {
    pub account_label: String,
    pub credential_label: String,
    pub api_key: String,
    pub route_mode: String,
}
