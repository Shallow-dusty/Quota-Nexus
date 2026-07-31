use std::time::{Duration, SystemTime};

use reqwest::{header::HeaderMap, redirect::Policy, Client, Proxy};
use url::Url;

use crate::{credential::ProxyAuth, error::CommandError, storage::NetworkProfileRecord};

#[derive(Debug, Clone)]
pub struct NewNetworkProfile {
    pub id: String,
    pub label: String,
    pub transport: String,
    pub host: String,
    pub port: u16,
    pub has_auth: bool,
}

impl NewNetworkProfile {
    pub fn endpoint(&self) -> String {
        format!("{}://{}:{}", self.transport, self.host, self.port)
    }
}

pub fn parse_new_profile(
    id: String,
    label: &str,
    proxy_url: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<(NewNetworkProfile, Option<(String, String)>), CommandError> {
    let label = label.trim();
    if label.is_empty() {
        return Err(CommandError::validation("请填写固定出口标签"));
    }
    let parsed =
        Url::parse(proxy_url.trim()).map_err(|_| CommandError::validation("代理 URL 无效"))?;
    if !matches!(parsed.scheme(), "http" | "https" | "socks5" | "socks5h") {
        return Err(CommandError::validation(
            "代理仅支持 http、https、socks5 或 socks5h",
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(CommandError::validation(
            "代理用户名和密码请填写在独立字段中",
        ));
    }
    if (!parsed.path().is_empty() && parsed.path() != "/")
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(CommandError::validation(
            "代理 URL 只能包含 scheme、host 和 port",
        ));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| CommandError::validation("代理 URL 缺少 host"))?
        .to_string();
    let port = parsed
        .port()
        .ok_or_else(|| CommandError::validation("代理 URL 必须显式填写 port"))?;
    let username = username.map(str::trim).filter(|value| !value.is_empty());
    let password = password.filter(|value| !value.is_empty());
    if password.is_some() && username.is_none() {
        return Err(CommandError::validation("填写代理密码时必须同时填写用户名"));
    }
    let auth = username.map(|user| (user.to_string(), password.unwrap_or("").to_string()));
    Ok((
        NewNetworkProfile {
            id,
            label: label.to_string(),
            transport: parsed.scheme().to_string(),
            host,
            port,
            has_auth: auth.is_some(),
        },
        auth,
    ))
}

pub fn build_default_client() -> Result<Client, CommandError> {
    build(None, None)
}

pub fn build_profile_client(
    profile: &NetworkProfileRecord,
    auth: Option<&ProxyAuth>,
) -> Result<Client, CommandError> {
    let endpoint = format!("{}://{}:{}", profile.transport, profile.host, profile.port);
    build(Some(&endpoint), auth)
}

pub fn build_new_profile_client(
    profile: &NewNetworkProfile,
    auth: Option<&(String, String)>,
) -> Result<Client, CommandError> {
    let owned_auth = auth.map(|(username, password)| ProxyAuth {
        username: zeroize::Zeroizing::new(username.clone()),
        password: zeroize::Zeroizing::new(password.clone()),
    });
    build(Some(&profile.endpoint()), owned_auth.as_ref())
}

fn build(endpoint: Option<&str>, auth: Option<&ProxyAuth>) -> Result<Client, CommandError> {
    let mut builder = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20));
    if let Some(endpoint) = endpoint {
        let mut proxy =
            Proxy::all(endpoint).map_err(|_| CommandError::proxy("固定出口配置无效"))?;
        if let Some(auth) = auth {
            proxy = proxy.basic_auth(&auth.username, &auth.password);
        }
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|_| CommandError::network("无法初始化额度查询网络客户端"))
}

pub fn rate_limit_error(headers: &HeaderMap) -> CommandError {
    let retry_after_seconds = headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.parse::<u64>().ok().or_else(|| {
                httpdate::parse_http_date(value)
                    .ok()
                    .and_then(|when| when.duration_since(SystemTime::now()).ok())
                    .map(|duration| duration.as_secs())
            })
        });
    CommandError::rate_limit(retry_after_seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_proxy() {
        let (profile, auth) = parse_new_profile(
            "profile-1".into(),
            "登录出口",
            "socks5h://127.0.0.1:1080",
            Some("user"),
            Some("password"),
        )
        .unwrap();
        assert_eq!(profile.transport, "socks5h");
        assert_eq!(profile.port, 1080);
        assert!(profile.has_auth);
        assert_eq!(auth.unwrap().0, "user");
    }

    #[test]
    fn rejects_embedded_credentials_and_paths() {
        assert!(parse_new_profile(
            "profile-1".into(),
            "bad",
            "http://user:password@127.0.0.1:8080",
            None,
            None,
        )
        .is_err());
        assert!(parse_new_profile(
            "profile-1".into(),
            "bad",
            "http://127.0.0.1:8080/private",
            None,
            None,
        )
        .is_err());
    }
}
