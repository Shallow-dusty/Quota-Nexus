//! 请求 allowlist：host + path 前缀 + method 三级显式校验（DESIGN.md §4.1）。

use anyhow::{bail, Result};
use url::Url;

#[derive(Debug, Clone, Copy)]
pub struct AllowRule {
    pub host: &'static str,
    pub path_prefix: &'static str,
    pub methods: &'static [&'static str],
}

pub const CLINEPASS_RULES: &[AllowRule] = &[AllowRule {
    host: "api.cline.bot",
    path_prefix: "/api/v1/users/me/plan/usage-limits",
    methods: &["GET"],
}];

pub const OPENCODE_GO_RULES: &[AllowRule] = &[
    AllowRule {
        host: "opencode.ai",
        path_prefix: "/_server",
        methods: &["GET"],
    },
    AllowRule {
        host: "opencode.ai",
        path_prefix: "/workspace/",
        methods: &["GET"],
    },
];

pub const OLLAMA_CLOUD_RULES: &[AllowRule] = &[AllowRule {
    host: "ollama.com",
    path_prefix: "/settings",
    methods: &["GET"],
}];

/// 请求发送前的硬校验；不通过则 panic 级失败（探针不应发出任何越界请求）。
pub fn enforce(rules: &[AllowRule], method: &str, url: &Url) -> Result<()> {
    if url.scheme() != "https" {
        bail!("拒绝非 HTTPS 请求: {url}");
    }
    let host = url.host_str().unwrap_or("");
    let path = url.path();
    for rule in rules {
        if rule.host == host
            && path.starts_with(rule.path_prefix)
            && rule.methods.iter().any(|m| m.eq_ignore_ascii_case(method))
        {
            return Ok(());
        }
    }
    bail!("allowlist 拒绝: {method} {host}{path}")
}
