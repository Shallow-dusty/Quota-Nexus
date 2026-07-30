//! HTTP 客户端与响应捕获。
//!
//! - 不启用 reqwest `cookies` feature：cookie store 在编译期即不存在，
//!   不可能按域名自动附带 Cookie（比运行时关闭更强的保证）；
//! - `redirect(Policy::none())`：不自动跟随重定向，Location 脱敏后仅作证据记录；
//! - 凭据头由调用方按 allowlist 校验后手工注入单个请求。

use crate::allowlist::{self, AllowRule};
use crate::config::NetworkRoute;
use crate::redact::Redactor;
use anyhow::{Context, Result};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use reqwest::Proxy;
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

pub fn build_client(route: &NetworkRoute) -> Result<Client> {
    build_client_with_timeout(route, Duration::from_secs(20))
}

fn build_client_with_timeout(route: &NetworkRoute, timeout: Duration) -> Result<Client> {
    // 禁用 reqwest 自动代理发现，保证路由只有两种：
    // 1) 普通 socket（可被本机 TUN 捕获）；2) 明确指定的固定代理。
    // reqwest 0.13.4 中 no_proxy() 会清空代理并关闭自动发现；随后 proxy()
    // 只加入这一条显式规则。规则命中后 connector 直接返回代理连接结果，失败不走
    // direct 分支。此不回退不变量另有 localhost 单测覆盖。
    let mut builder = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .timeout(timeout);
    if let NetworkRoute::ExplicitProxy {
        proxy_url,
        username,
        password,
    } = route
    {
        let mut proxy = Proxy::all(proxy_url)
            .map_err(|_| anyhow::anyhow!("显式代理配置无效（URL/协议未回显）"))?;
        if let Some(username) = username {
            proxy = proxy.basic_auth(username, password.as_deref().unwrap_or_default());
        }
        builder = builder.proxy(proxy);
    }
    builder.build().context("构建 HTTP 客户端失败")
}

/// 将请求错误转换为可进入终端/快照的安全证据。
///
/// 显式代理错误链可能含经过规范化的代理 URI，字面量 Redactor 未必能覆盖其所有
/// 表达形式，因此这里不输出底层错误；默认路由仍保留经脱敏的诊断链。
pub fn safe_request_error(
    route: &NetworkRoute,
    error: &anyhow::Error,
    redactor: &Redactor,
) -> String {
    match route {
        NetworkRoute::ExplicitProxy { .. } => {
            "发送请求失败（显式固定代理连接/认证/TLS 或上游网络错误；未回退默认路由）".to_string()
        }
        NetworkRoute::Default => redactor.redact(&format!("{error:#}")),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread::{self, JoinHandle};
    use std::time::Instant;

    fn spawn_endpoint() -> (String, Arc<AtomicBool>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind endpoint");
        listener
            .set_nonblocking(true)
            .expect("nonblocking endpoint");
        let address = listener.local_addr().expect("endpoint address");
        let hit = Arc::new(AtomicBool::new(false));
        let thread_hit = Arc::clone(&hit);
        let handle = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        thread_hit.store(true, Ordering::SeqCst);
                        let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
                        let mut request = [0_u8; 1024];
                        let _ = stream.read(&mut request);
                        let _ = stream
                            .write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                        return;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => return,
                }
            }
        });
        (format!("http://{address}/quota"), hit, handle)
    }

    fn spawn_rejecting_proxy() -> (String, Arc<AtomicBool>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind proxy");
        listener.set_nonblocking(true).expect("nonblocking proxy");
        let address = listener.local_addr().expect("proxy address");
        let hit = Arc::new(AtomicBool::new(false));
        let thread_hit = Arc::clone(&hit);
        let handle = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((stream, _)) => {
                        thread_hit.store(true, Ordering::SeqCst);
                        let _ = stream.shutdown(std::net::Shutdown::Both);
                        return;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => return,
                }
            }
        });
        (format!("http://{address}"), hit, handle)
    }

    #[test]
    fn default_route_reaches_direct_endpoint() {
        let (target, target_hit, target_handle) = spawn_endpoint();
        let client = build_client_with_timeout(&NetworkRoute::Default, Duration::from_secs(2))
            .expect("default client");
        let status = client.get(target).send().expect("direct request").status();
        target_handle.join().expect("endpoint thread");
        assert_eq!(status.as_u16(), 204);
        assert!(target_hit.load(Ordering::SeqCst));
    }

    #[test]
    fn explicit_proxy_failure_never_falls_back_to_direct() {
        let (target, target_hit, target_handle) = spawn_endpoint();
        let (proxy_url, proxy_hit, proxy_handle) = spawn_rejecting_proxy();
        let route = NetworkRoute::ExplicitProxy {
            proxy_url,
            username: None,
            password: None,
        };
        let client =
            build_client_with_timeout(&route, Duration::from_secs(2)).expect("proxy client");

        let result = client.get(target).send();
        proxy_handle.join().expect("proxy thread");
        target_handle.join().expect("endpoint thread");

        assert!(result.is_err(), "代理失败后不得 direct fallback");
        assert!(proxy_hit.load(Ordering::SeqCst), "请求必须命中显式代理");
        assert!(
            !target_hit.load(Ordering::SeqCst),
            "代理失败后目标端点不得收到 direct 请求"
        );
    }

    #[test]
    fn explicit_proxy_cannot_bypass_provider_allowlist() {
        let (proxy_url, proxy_hit, proxy_handle) = spawn_rejecting_proxy();
        let route = NetworkRoute::ExplicitProxy {
            proxy_url,
            username: None,
            password: None,
        };
        let client =
            build_client_with_timeout(&route, Duration::from_secs(2)).expect("proxy client");
        let error = send_guarded(
            &client,
            crate::allowlist::CLINEPASS_RULES,
            "GET",
            "https://example.invalid/not-allowlisted",
            &[],
        )
        .unwrap_err();
        proxy_handle.join().expect("proxy thread");

        assert!(error.to_string().contains("allowlist 拒绝"));
        assert!(
            !proxy_hit.load(Ordering::SeqCst),
            "allowlist 拒绝后不得连接代理"
        );
    }

    #[test]
    fn all_supported_proxy_schemes_build_with_auth() {
        for proxy_url in [
            "http://127.0.0.1:8080",
            "https://127.0.0.1:8443",
            "socks5://127.0.0.1:1080",
            "socks5h://127.0.0.1:1080",
        ] {
            let route = NetworkRoute::ExplicitProxy {
                proxy_url: proxy_url.into(),
                username: Some("proxy-user".into()),
                password: Some("proxy-pass".into()),
            };
            build_client_with_timeout(&route, Duration::from_secs(2))
                .unwrap_or_else(|_| panic!("supported proxy scheme failed to build"));
        }
    }

    #[test]
    fn explicit_proxy_error_evidence_never_contains_route_secrets() {
        let route = NetworkRoute::ExplicitProxy {
            proxy_url: "http://private-proxy.example:8080".into(),
            username: Some("proxy-user".into()),
            password: Some("proxy-pass".into()),
        };
        let error = anyhow::anyhow!(
            "failed via http://private-proxy.example:8080 as proxy-user/proxy-pass"
        );
        let safe = safe_request_error(&route, &error, &Redactor::new(vec![]));
        assert!(safe.contains("未回退默认路由"));
        assert!(!safe.contains("private-proxy"));
        assert!(!safe.contains("proxy-user"));
        assert!(!safe.contains("proxy-pass"));
    }

    #[test]
    fn invalid_proxy_build_error_does_not_echo_input() {
        let route = NetworkRoute::ExplicitProxy {
            proxy_url: "http://[private-value".into(),
            username: Some("proxy-user".into()),
            password: Some("proxy-pass".into()),
        };
        let message = build_client(&route).unwrap_err().to_string();
        assert!(message.contains("显式代理配置无效"));
        assert!(!message.contains("private-value"));
        assert!(!message.contains("proxy-user"));
        assert!(!message.contains("proxy-pass"));
    }

    #[test]
    fn location_sanitization_removes_query_and_fragment() {
        assert_eq!(
            sanitize_location("https://login.example/signin?ticket=secret#fragment"),
            "https://login.example/signin"
        );
        assert_eq!(sanitize_location("/signin?next=%2Fsettings"), "/signin");
    }
}
