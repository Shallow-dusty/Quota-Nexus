use regex::Regex;
use reqwest::{Client, StatusCode};

use crate::{domain::QuotaWindowView, error::CommandError};

const SETTINGS_URL: &str = "https://ollama.com/settings";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                          AppleWebKit/537.36 (KHTML, like Gecko) \
                          Chrome/143.0.0.0 Safari/537.36";

#[derive(Debug, Clone)]
pub struct OllamaQuota {
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindowView>,
}

pub async fn fetch(client: &Client, cookie: &str) -> Result<OllamaQuota, CommandError> {
    let response = client
        .get(SETTINGS_URL)
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
        .map_err(|_| CommandError::network("无法连接 Ollama Cloud，请检查当前网络出口"))?;

    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        return Err(crate::network::rate_limit_error(response.headers()));
    }
    if response.status().is_redirection() {
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if location.contains("signin")
            || location.contains("authorize")
            || location.contains("authkit")
        {
            return Err(CommandError::auth());
        }
        return Err(CommandError::network(format!(
            "Ollama Cloud 返回 HTTP {}",
            response.status().as_u16()
        )));
    }
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(CommandError::auth());
    }
    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "Ollama Cloud 返回 HTTP {}",
            response.status().as_u16()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|_| CommandError::parser("无法读取 Ollama Cloud 设置页"))?;
    parse(&body)
}

fn parse(body: &str) -> Result<OllamaQuota, CommandError> {
    let lower = body.to_ascii_lowercase();
    if lower.contains(">sign in<") || lower.contains(">log in<") {
        return Err(CommandError::auth());
    }

    let session = grab_percent(body, "session");
    let weekly = grab_percent(body, "weekly");
    if session.is_none() && weekly.is_none() {
        return Err(CommandError::parser("Ollama Cloud 页面未找到额度窗口"));
    }
    let reset_times = grab_reset_times(body)?;
    let mut windows = Vec::new();
    if let Some(percent) = session {
        windows.push(window(
            "session",
            "session",
            "Session",
            percent,
            reset_times.first().cloned(),
        )?);
    }
    if let Some(percent) = weekly {
        windows.push(window(
            "weekly",
            "weekly",
            "Weekly",
            percent,
            reset_times.get(1).cloned(),
        )?);
    }

    Ok(OllamaQuota {
        plan: grab_plan(body),
        windows,
    })
}

fn window(
    id: &str,
    kind: &str,
    label: &str,
    percent: f64,
    resets_at: Option<String>,
) -> Result<QuotaWindowView, CommandError> {
    if !(0.0..=100.0).contains(&percent) {
        return Err(CommandError::parser("Ollama Cloud 返回了越界使用率"));
    }
    Ok(QuotaWindowView {
        id: id.into(),
        kind: kind.into(),
        label: label.into(),
        used_percent: percent,
        resets_at,
    })
}

fn grab_percent(body: &str, window: &str) -> Option<f64> {
    Regex::new(&format!(
        r"(?i){window}[^\d%]{{0,80}}?(\d{{1,3}}(?:\.\d+)?)\s*%\s*(?:used)?"
    ))
    .ok()?
    .captures(body)
    .and_then(|captures| captures.get(1))
    .and_then(|value| value.as_str().parse().ok())
}

fn grab_reset_times(body: &str) -> Result<Vec<String>, CommandError> {
    let regex = Regex::new(r#"data-time="([^"]+)""#).expect("constant regex");
    regex
        .captures_iter(body)
        .take(2)
        .filter_map(|captures| captures.get(1))
        .map(|value| {
            let value = value.as_str();
            chrono::DateTime::parse_from_rfc3339(value)
                .map(|_| value.to_string())
                .map_err(|_| CommandError::parser("Ollama Cloud 返回了无效重置时间"))
        })
        .collect()
}

fn grab_plan(body: &str) -> Option<String> {
    Regex::new(r"(?i)>\s*(Free|Pro|Max)\s*<")
        .ok()?
        .captures(body)
        .and_then(|captures| captures.get(1))
        .map(|value| {
            let raw = value.as_str();
            let mut chars = raw.chars();
            match chars.next() {
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_ascii_lowercase()
                }
                None => raw.to_string(),
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_verified_usage_shape() {
        let body = r#"
            <span>Pro</span>
            <section>Session usage <b>0.6% used</b>
              <time data-time="2026-08-01T10:00:00Z">Resets in 2h</time>
            </section>
            <section>Weekly usage <b>48.3% used</b>
              <time data-time="2026-08-04T10:00:00Z">Resets in 3d</time>
            </section>
        "#;
        let result = parse(body).unwrap();
        assert_eq!(result.plan.as_deref(), Some("Pro"));
        assert_eq!(result.windows.len(), 2);
        assert_eq!(result.windows[0].used_percent, 0.6);
        assert_eq!(result.windows[1].used_percent, 48.3);
    }

    #[test]
    fn rejects_signed_out_page() {
        assert_eq!(
            parse("<main><a>Sign in</a></main>").unwrap_err().code,
            "auth"
        );
    }

    #[tokio::test]
    #[ignore = "requires AIQM_OLLAMA_COOKIE and real network access"]
    async fn live_contract_uses_desktop_adapter() {
        let secret = std::env::var("AIQM_OLLAMA_COOKIE").expect("missing live credential");
        let client = crate::network::build_default_client().unwrap();
        let quota = fetch(&client, &secret).await.unwrap();
        assert!(!quota.windows.is_empty());
    }
}
