//! 探针凭据文件加载与路径约定。
//!
//! 凭据文件为 gitignored 的本地 JSON（默认 probes/credentials.local.json），
//! 仅在运行期读取；探针任何输出都不得包含其内容（见 redact 模块）。

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use url::Url;

#[derive(Deserialize)]
pub struct CredentialsFile {
    /// 命名的固定网络出口。缺省时请求走进程默认路由（本机由 TUN 接管）。
    #[serde(default)]
    pub network_profiles: HashMap<String, ProxyProfile>,
    #[serde(default)]
    pub clinepass: Option<ClinePassCredential>,
    #[serde(default)]
    pub opencode_go: Option<OpenCodeGoCredential>,
    #[serde(default)]
    pub ollama_cloud: Option<OllamaCloudCredential>,
}

#[derive(Deserialize)]
pub struct ClinePassCredential {
    pub api_key: String,
    #[serde(default)]
    pub network_profile: Option<String>,
}

#[derive(Deserialize)]
pub struct OpenCodeGoCredential {
    pub cookie: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub network_profile: Option<String>,
}

#[derive(Deserialize)]
pub struct OllamaCloudCredential {
    pub cookie: String,
    #[serde(default)]
    pub network_profile: Option<String>,
}

#[derive(Deserialize)]
pub struct ProxyProfile {
    pub proxy_url: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Default)]
pub enum NetworkRoute {
    /// 不读取 HTTP(S)_PROXY / Windows 系统代理；普通 socket 仍会被本机 TUN 捕获。
    #[default]
    Default,
    /// 所有 HTTP/HTTPS 请求固定走此代理；失败时不回退到 Default。
    ExplicitProxy {
        proxy_url: String,
        username: Option<String>,
        password: Option<String>,
    },
}

impl CredentialsFile {
    pub fn load(path: &Path) -> Result<Self> {
        let raw = std::fs::read_to_string(path)
            .with_context(|| format!("读取凭据文件失败: {}", path.display()))?;
        serde_json::from_str(&raw)
            .with_context(|| format!("解析凭据文件 JSON 失败: {}", path.display()))
    }

    pub fn load_optional(path: &Path) -> Result<Option<Self>> {
        if !path.exists() {
            return Ok(None);
        }
        Self::load(path).map(Some)
    }

    /// 将 Credential 上的网络配置解析为确定路由。
    ///
    /// 显式代理 URL 禁止内嵌用户名/密码；认证字段单独读取，避免 URL 出现在错误链时
    /// 顺带泄露代理秘密。
    pub fn route_for(&self, profile_name: Option<&str>) -> Result<NetworkRoute> {
        let Some(name) = profile_name.map(str::trim).filter(|s| !s.is_empty()) else {
            return Ok(NetworkRoute::Default);
        };
        let profile = self
            .network_profiles
            .get(name)
            .context("未找到 Credential 所引用的 network_profile")?;
        let parsed = Url::parse(profile.proxy_url.trim())
            .map_err(|_| anyhow::anyhow!("network_profile 的 proxy_url 无效"))?;
        if !matches!(parsed.scheme(), "http" | "https" | "socks5" | "socks5h") {
            bail!("network_profile 协议不受支持；仅允许 http/https/socks5/socks5h");
        }
        if parsed.host_str().is_none() {
            bail!("network_profile 的 proxy_url 缺少主机");
        }
        if (!parsed.path().is_empty() && parsed.path() != "/")
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            bail!("network_profile 的 proxy_url 只能包含 scheme/host/port");
        }
        if !parsed.username().is_empty() || parsed.password().is_some() {
            bail!("network_profile 不允许在 proxy_url 内嵌认证信息");
        }
        if profile.password.as_deref().is_some_and(|v| !v.is_empty())
            && profile
                .username
                .as_deref()
                .is_none_or(|v| v.trim().is_empty())
        {
            bail!("network_profile 配置了 password 但没有 username");
        }
        Ok(NetworkRoute::ExplicitProxy {
            proxy_url: profile.proxy_url.trim().to_string(),
            username: profile
                .username
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string),
            password: profile.password.clone().filter(|v| !v.is_empty()),
        })
    }

    /// 收集所有非空秘密字符串，供 Redactor 做字面量替换。
    pub fn secrets(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(c) = &self.clinepass {
            out.push(c.api_key.clone());
        }
        if let Some(c) = &self.opencode_go {
            out.push(c.cookie.clone());
        }
        if let Some(c) = &self.ollama_cloud {
            out.push(c.cookie.clone());
        }
        for profile in self.network_profiles.values() {
            // 代理端点虽不是认证秘密，也不应进入可提交快照或错误输出。
            out.push(profile.proxy_url.clone());
            if let Some(username) = &profile.username {
                out.push(username.clone());
            }
            if let Some(password) = &profile.password {
                out.push(password.clone());
            }
        }
        out.retain(|s| !s.trim().is_empty());
        out
    }
}

impl NetworkRoute {
    pub fn report_mode(&self) -> &'static str {
        match self {
            Self::Default => "default_tun_or_process_route",
            Self::ExplicitProxy { .. } => "explicit_fixed_proxy",
        }
    }
}

/// 代理端点和认证信息属于秘密；即使未来误用 `{:?}`，也只暴露路由模式。
impl fmt::Debug for NetworkRoute {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("NetworkRoute")
            .field("mode", &self.report_mode())
            .finish()
    }
}

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

/// workspace 根目录（probes/ 的父目录）。
pub fn workspace_root() -> PathBuf {
    manifest_dir()
        .parent()
        .expect("probes/ 应位于 workspace 根目录下")
        .to_path_buf()
}

pub fn default_credentials_path() -> PathBuf {
    manifest_dir().join("credentials.local.json")
}

/// 原始响应目录（gitignored，禁止提交）。
pub fn default_raw_dir() -> PathBuf {
    workspace_root().join("data").join("probe-raw")
}

/// 脱敏快照目录（git 跟踪，可提交）。
pub fn default_snapshot_dir() -> PathBuf {
    workspace_root()
        .join("docs")
        .join("provider-contracts")
        .join("snapshots")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> CredentialsFile {
        serde_json::from_str(raw).expect("test config")
    }

    #[test]
    fn missing_profile_uses_default_route() {
        let file = parse(r#"{"network_profiles": {}}"#);
        assert!(matches!(
            file.route_for(None).unwrap(),
            NetworkRoute::Default
        ));
    }

    #[test]
    fn resolves_explicit_socks_route_without_echoing_details() {
        let file = parse(
            r#"{
                "network_profiles": {
                    "browser-a": {
                        "proxy_url": "socks5h://127.0.0.1:1080",
                        "username": "local-user",
                        "password": "local-pass"
                    }
                }
            }"#,
        );
        let route = file.route_for(Some("browser-a")).unwrap();
        assert_eq!(route.report_mode(), "explicit_fixed_proxy");
    }

    #[test]
    fn rejects_credentials_embedded_in_proxy_url() {
        let file = parse(
            r#"{
                "network_profiles": {
                    "bad": {"proxy_url": "http://user:secret@127.0.0.1:8080"}
                }
            }"#,
        );
        let message = file.route_for(Some("bad")).unwrap_err().to_string();
        assert!(!message.contains("user"));
        assert!(!message.contains("secret"));
        assert!(message.contains("不允许"));
    }

    #[test]
    fn unknown_profile_fails_closed() {
        let file = parse(r#"{"network_profiles": {}}"#);
        let message = file.route_for(Some("missing")).unwrap_err().to_string();
        assert!(message.contains("未找到"));
        assert!(!message.contains("missing"));
    }

    #[test]
    fn rejects_unsupported_proxy_scheme_without_echoing_endpoint() {
        let file = parse(
            r#"{
                "network_profiles": {
                    "bad": {"proxy_url": "ftp://proxy-secret.example:21"}
                }
            }"#,
        );
        let message = file.route_for(Some("bad")).unwrap_err().to_string();
        assert!(message.contains("协议不受支持"));
        assert!(!message.contains("proxy-secret"));
    }

    #[test]
    fn rejects_password_without_username() {
        let file = parse(
            r#"{
                "network_profiles": {
                    "bad": {
                        "proxy_url": "http://127.0.0.1:8080",
                        "password": "secret-pass"
                    }
                }
            }"#,
        );
        let message = file.route_for(Some("bad")).unwrap_err().to_string();
        assert!(message.contains("没有 username"));
        assert!(!message.contains("secret-pass"));
    }

    #[test]
    fn route_debug_never_contains_proxy_details() {
        let route = NetworkRoute::ExplicitProxy {
            proxy_url: "socks5h://private.example:1080".into(),
            username: Some("proxy-user".into()),
            password: Some("proxy-pass".into()),
        };
        let debug = format!("{route:?}");
        assert_eq!(debug, "NetworkRoute { mode: \"explicit_fixed_proxy\" }");
        assert!(!debug.contains("private.example"));
        assert!(!debug.contains("proxy-user"));
        assert!(!debug.contains("proxy-pass"));
    }

    #[test]
    fn rejects_proxy_url_path_query_and_fragment_without_echoing_them() {
        let file = parse(
            r#"{
                "network_profiles": {
                    "bad": {
                        "proxy_url": "https://proxy.example:8443/private?token=secret#fragment"
                    }
                }
            }"#,
        );
        let message = file.route_for(Some("bad")).unwrap_err().to_string();
        assert!(message.contains("只能包含 scheme/host/port"));
        assert!(!message.contains("private"));
        assert!(!message.contains("secret"));
    }

    #[test]
    fn malformed_existing_credentials_file_is_not_treated_as_missing() {
        let path = std::env::temp_dir().join(format!(
            "aiqm-malformed-credentials-{}.json",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&path, r#"{"network_profiles": "not-an-object"}"#)
            .expect("write malformed config");
        let error = CredentialsFile::load_optional(&path)
            .err()
            .expect("existing malformed file must fail");
        std::fs::remove_file(&path).expect("remove malformed config");
        assert!(error.to_string().contains("解析凭据文件 JSON 失败"));
    }
}
