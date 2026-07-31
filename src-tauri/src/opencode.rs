use chrono::{Duration, Utc};
use regex::Regex;
use reqwest::{Client, StatusCode};
use uuid::Uuid;

use crate::{domain::QuotaWindowView, error::CommandError};

const BASE_URL: &str = "https://opencode.ai";
const WORKSPACES_URL: &str = "https://opencode.ai/_server";
const WORKSPACES_ID: &str = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                          AppleWebKit/537.36 (KHTML, like Gecko) \
                          Chrome/143.0.0.0 Safari/537.36";

#[derive(Debug, Clone)]
pub struct WorkspaceQuota {
    pub workspace_id: String,
    pub windows: Vec<QuotaWindowView>,
}

pub async fn fetch_accounts(
    client: &Client,
    cookie: &str,
    configured_workspace: Option<&str>,
) -> Result<Vec<WorkspaceQuota>, CommandError> {
    let workspace_ids = match configured_workspace
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(workspace) => {
            validate_workspace_id(workspace)?;
            vec![workspace.to_string()]
        }
        None => discover_workspaces(client, cookie).await?,
    };
    let mut accounts = Vec::with_capacity(workspace_ids.len());
    for workspace_id in workspace_ids {
        let windows = fetch_workspace(client, cookie, &workspace_id).await?;
        accounts.push(WorkspaceQuota {
            workspace_id,
            windows,
        });
    }
    Ok(accounts)
}

pub async fn discover_workspaces(
    client: &Client,
    cookie: &str,
) -> Result<Vec<String>, CommandError> {
    let response = client
        .get(format!("{WORKSPACES_URL}?id={WORKSPACES_ID}"))
        .header("X-Server-Id", WORKSPACES_ID)
        .header("X-Server-Instance", format!("server-fn:{}", Uuid::new_v4()))
        .header(reqwest::header::ORIGIN, BASE_URL)
        .header(reqwest::header::REFERER, format!("{BASE_URL}/"))
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(
            reqwest::header::ACCEPT,
            "text/javascript, application/json;q=0.9, */*;q=0.8",
        )
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
        .map_err(|_| CommandError::network("无法连接 OpenCode Go Workspace 服务"))?;

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
            "OpenCode Go Workspace 服务返回 HTTP {}",
            response.status().as_u16()
        )));
    }
    let body = response
        .text()
        .await
        .map_err(|_| CommandError::parser("无法读取 OpenCode Go Workspace 响应"))?;
    if has_signed_out_marker(&body) {
        return Err(CommandError::auth());
    }
    let regex = Regex::new(r"wrk_[A-Za-z0-9]+").expect("constant regex");
    let mut ids = Vec::new();
    for value in regex.find_iter(&body) {
        let value = value.as_str().to_string();
        if !ids.contains(&value) {
            ids.push(value);
        }
    }
    if ids.is_empty() {
        return Err(CommandError::parser("OpenCode Go 未返回可用 Workspace"));
    }
    Ok(ids)
}

pub async fn fetch_workspace(
    client: &Client,
    cookie: &str,
    workspace_id: &str,
) -> Result<Vec<QuotaWindowView>, CommandError> {
    validate_workspace_id(workspace_id)?;
    let url = format!("{BASE_URL}/workspace/{workspace_id}/go");
    let response = client
        .get(url)
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
        .map_err(|_| CommandError::network("无法连接 OpenCode Go 用量页"))?;
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
            "OpenCode Go 用量页返回 HTTP {}",
            response.status().as_u16()
        )));
    }
    let body = response
        .text()
        .await
        .map_err(|_| CommandError::parser("无法读取 OpenCode Go 用量页"))?;
    if has_signed_out_marker(&body) {
        return Err(CommandError::auth());
    }
    parse_usage(&body)
}

fn parse_usage(body: &str) -> Result<Vec<QuotaWindowView>, CommandError> {
    let now = Utc::now();
    let candidates = [
        ("rollingUsage", "rolling_5h", "5 小时"),
        ("weeklyUsage", "weekly", "周额度"),
        ("monthlyUsage", "monthly", "月额度"),
    ];
    let mut windows = Vec::new();
    for (source, kind, label) in candidates {
        if let Some((raw_percent, reset_seconds)) = grab_window(body, source) {
            let used_percent = if raw_percent <= 1.0 {
                raw_percent * 100.0
            } else {
                raw_percent
            };
            if !(0.0..=100.0).contains(&used_percent) {
                return Err(CommandError::parser("OpenCode Go 返回了越界使用率"));
            }
            let resets_at = reset_seconds
                .and_then(|seconds| i64::try_from(seconds).ok())
                .and_then(|seconds| now.checked_add_signed(Duration::seconds(seconds)))
                .map(|value| value.to_rfc3339());
            windows.push(QuotaWindowView {
                id: kind.into(),
                kind: kind.into(),
                label: label.into(),
                used_percent,
                resets_at,
            });
        }
    }
    if !windows.iter().any(|window| window.kind == "rolling_5h") {
        return Err(CommandError::parser("OpenCode Go 页面未找到 rollingUsage"));
    }
    Ok(windows)
}

fn grab_window(body: &str, window: &str) -> Option<(f64, Option<u64>)> {
    let percent = Regex::new(&format!(
        r#""?{window}"?[^}}]*?"?usagePercent"?\s*:\s*([0-9]+(?:\.[0-9]+)?)"#
    ))
    .ok()?
    .captures(body)
    .and_then(|captures| captures.get(1))
    .and_then(|value| value.as_str().parse().ok())?;
    let reset = Regex::new(&format!(
        r#""?{window}"?[^}}]*?"?resetInSec"?\s*:\s*([0-9]+)"#
    ))
    .ok()?
    .captures(body)
    .and_then(|captures| captures.get(1))
    .and_then(|value| value.as_str().parse().ok());
    Some((percent, reset))
}

fn validate_workspace_id(value: &str) -> Result<(), CommandError> {
    let regex = Regex::new(r"^wrk_[A-Za-z0-9]+$").expect("constant regex");
    if regex.is_match(value) {
        Ok(())
    } else {
        Err(CommandError::validation("Workspace ID 格式无效"))
    }
}

fn has_signed_out_marker(body: &str) -> bool {
    let lower = body.to_ascii_lowercase();
    [
        "auth/authorize",
        "not associated with an account",
        "actor of type \"public\"",
        ">sign in<",
        ">log in<",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_verified_windows_and_fraction_compatibility() {
        let body = r#"
          {"rollingUsage":{"usagePercent":0.25,"resetInSec":1800},
           "weeklyUsage":{"usagePercent":84,"resetInSec":86400},
           "monthlyUsage":{"usagePercent":42,"resetInSec":172800}}
        "#;
        let windows = parse_usage(body).unwrap();
        assert_eq!(windows.len(), 3);
        assert_eq!(windows[0].used_percent, 25.0);
        assert_eq!(windows[1].used_percent, 84.0);
        assert!(windows[0].resets_at.is_some());
    }

    #[test]
    fn rejects_missing_rolling_window() {
        assert_eq!(
            parse_usage(r#"{"weeklyUsage":{"usagePercent":42}}"#)
                .unwrap_err()
                .code,
            "parser"
        );
    }

    #[test]
    fn validates_workspace_shape() {
        assert!(validate_workspace_id("wrk_01ABCxyz").is_ok());
        assert!(validate_workspace_id("../settings").is_err());
    }

    #[tokio::test]
    #[ignore = "requires AIQM_OPENCODE_COOKIE and real network access"]
    async fn live_contract_uses_desktop_adapter() {
        let secret = std::env::var("AIQM_OPENCODE_COOKIE").expect("missing live credential");
        let workspace = std::env::var("AIQM_OPENCODE_WORKSPACE").ok();
        let client = crate::network::build_default_client().unwrap();
        let accounts = fetch_accounts(&client, &secret, workspace.as_deref())
            .await
            .unwrap();
        assert!(!accounts.is_empty());
        assert!(accounts.iter().all(|account| !account.windows.is_empty()));
    }
}
