use reqwest::{Client, StatusCode};
use serde::Deserialize;
use zeroize::Zeroizing;

use crate::{domain::QuotaWindowView, error::CommandError};

const USAGE_URL: &str = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";

#[derive(Debug, Deserialize)]
struct UsageResponse {
    success: bool,
    data: UsageData,
}

#[derive(Debug, Deserialize)]
struct UsageData {
    limits: Vec<UsageLimit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageLimit {
    #[serde(rename = "type")]
    kind: String,
    percent_used: f64,
    resets_at: Option<String>,
}

pub async fn fetch(client: &Client, api_key: &str) -> Result<Vec<QuotaWindowView>, CommandError> {
    let authorization = Zeroizing::new(format!("Bearer {api_key}"));
    let response = client
        .get(USAGE_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::AUTHORIZATION, authorization.as_str())
        .send()
        .await
        .map_err(|_| CommandError::network("无法连接 Cline Pass 额度服务，请检查当前 TUN/网络"))?;

    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        return Err(crate::network::rate_limit_error(response.headers()));
    }
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(CommandError::auth());
    }
    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "Cline Pass 额度服务返回 HTTP {}",
            response.status().as_u16()
        )));
    }

    let payload = response
        .json::<UsageResponse>()
        .await
        .map_err(|_| CommandError::parser("Cline Pass 响应格式已变化"))?;
    normalize(payload)
}

fn normalize(payload: UsageResponse) -> Result<Vec<QuotaWindowView>, CommandError> {
    if !payload.success || payload.data.limits.is_empty() {
        return Err(CommandError::parser("Cline Pass 未返回可用额度窗口"));
    }

    payload
        .data
        .limits
        .into_iter()
        .map(|limit| {
            if !(0.0..=100.0).contains(&limit.percent_used) {
                return Err(CommandError::parser("Cline Pass 返回了越界使用率"));
            }
            if let Some(resets_at) = &limit.resets_at {
                chrono::DateTime::parse_from_rfc3339(resets_at)
                    .map_err(|_| CommandError::parser("Cline Pass 返回了无效重置时间"))?;
            }
            let (kind, label) = match limit.kind.as_str() {
                "five_hour" => ("rolling_5h", "5 小时"),
                "weekly" => ("weekly", "周额度"),
                "monthly" => ("monthly", "月额度"),
                _ => ("unknown", "未知窗口"),
            };
            Ok(QuotaWindowView {
                id: limit.kind,
                kind: kind.into(),
                label: label.into(),
                used_percent: limit.percent_used,
                resets_at: limit.resets_at,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_verified_contract() {
        let payload: UsageResponse = serde_json::from_str(
            r#"{"success":true,"data":{"limits":[
                {"type":"five_hour","percentUsed":12.5,"resetsAt":"2026-08-01T00:00:00Z"},
                {"type":"weekly","percentUsed":44,"resetsAt":null},
                {"type":"monthly","percentUsed":99,"resetsAt":"2026-09-01T00:00:00Z"}
            ]}}"#,
        )
        .unwrap();
        let windows = normalize(payload).unwrap();
        assert_eq!(windows.len(), 3);
        assert_eq!(windows[0].kind, "rolling_5h");
        assert_eq!(windows[1].resets_at, None);
        assert_eq!(windows[2].used_percent, 99.0);
    }

    #[test]
    fn rejects_out_of_range_percent() {
        let payload: UsageResponse = serde_json::from_str(
            r#"{"success":true,"data":{"limits":[
                {"type":"weekly","percentUsed":101,"resetsAt":null}
            ]}}"#,
        )
        .unwrap();
        assert_eq!(normalize(payload).unwrap_err().code, "parser");
    }

    #[test]
    fn rejects_invalid_reset_timestamp() {
        let payload: UsageResponse = serde_json::from_str(
            r#"{"success":true,"data":{"limits":[
                {"type":"weekly","percentUsed":45,"resetsAt":"not-a-timestamp"}
            ]}}"#,
        )
        .unwrap();
        assert_eq!(normalize(payload).unwrap_err().code, "parser");
    }

    #[tokio::test]
    #[ignore = "requires AIQM_CLINEPASS_API_KEY and real network access"]
    async fn live_contract_uses_desktop_adapter() {
        let secret = std::env::var("AIQM_CLINEPASS_API_KEY").expect("missing live credential");
        let client = crate::network::build_default_client().unwrap();
        let windows = fetch(&client, &secret).await.unwrap();
        assert!(!windows.is_empty());
    }
}
