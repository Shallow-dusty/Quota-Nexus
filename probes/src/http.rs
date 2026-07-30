//! HTTP 客户端与响应捕获。
//!
//! - 不启用 reqwest `cookies` feature：cookie store 在编译期即不存在，
//!   不可能按域名自动附带 Cookie（比运行时关闭更强的保证）；
//! - `redirect(Policy::none())`：不自动跟随重定向，Location 脱敏后仅作证据记录；
//! - 凭据头由调用方按 allowlist 校验后手工注入单个请求。

use crate::allowlist::{self, AllowRule};
use anyhow::{Context, Result};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use std::time::Duration;
use url::Url;

#[derive(Debug)]
pub struct CapturedResponse {
    pub status: u16,
    pub content_type: Option<String>,
    /// 3xx 时的 Location（仅 scheme/host/path，query 与 fragment 已剥离）。
    pub location: Option<String>,
    pub body: String,
}

pub fn build_client() -> Result<Client> {
    Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .context("构建 HTTP 客户端失败")
}

/// 先过 allowlist 再发请求；headers 中的秘密值只出现在本请求内。
pub fn send_guarded(
    client: &Client,
    rules: &[AllowRule],
    method: &str,
    url: &str,
    headers: &[(String, String)],
) -> Result<CapturedResponse> {
    let parsed = Url::parse(url).with_context(|| format!("非法 URL: {url}"))?;
    allowlist::enforce(rules, method, &parsed)?;

    let mut req = client.request(
        method
            .parse()
            .with_context(|| format!("非法 method: {method}"))?,
        parsed,
    );
    for (k, v) in headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let resp = req.send().context("发送请求失败（网络/TLS/代理层）")?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let location = headers
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(sanitize_location);
    let body = resp.text().context("读取响应体失败")?;
    Ok(CapturedResponse {
        status,
        content_type,
        location,
        body,
    })
}

/// Location 脱敏：剥离 query/fragment（可能携带会话票据）。
fn sanitize_location(loc: &str) -> String {
    if let Ok(u) = Url::parse(loc) {
        return format!(
            "{}://{}{}",
            u.scheme(),
            u.host_str().unwrap_or(""),
            u.path()
        );
    }
    // 相对路径（如 /signin?next=...）：只保留路径段
    loc.split(['?', '#']).next().unwrap_or(loc).to_string()
}
