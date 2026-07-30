//! AI Quota Monitor — Phase 0 只读探针共享基础设施。
//!
//! 安全不变量（与 docs/DESIGN.md §4.1 一致）：
//! - 仅允许 allowlist 内的 host / path / method，非 HTTPS 一律拒绝；
//! - 不启用 cookie store，秘密仅按请求手工注入；
//! - 不自动跟随重定向（3xx 仅记录脱敏后的 Location）；
//! - 任何写入 stdout / 报告文件的内容必须经过 Redactor。

pub mod allowlist;
pub mod config;
pub mod fingerprint;
pub mod http;
pub mod redact;
pub mod report;

pub const PROBE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// OpenCode 系产品判定"会话已失效"的页面标记（小写匹配）。
/// 依据：CodexBar OpenCode*UsageFetcher.looksSignedOut。
pub const OPENCODE_SIGNED_OUT_MARKERS: [&str; 5] = [
    "login",
    "sign in",
    "auth/authorize",
    "not associated with an account",
    "actor of type \"public\"",
];

/// Ollama 重定向到登录页/WorkOS 时 Location 中的标记（小写匹配）。
pub const OLLAMA_SIGNIN_LOCATION_MARKERS: [&str; 4] = ["signin", "sign-in", "login", "authkit"];

/// 返回 body 中命中的标记列表（统一小写后匹配）。
pub fn hit_markers(body: &str, markers: &[&str]) -> Vec<String> {
    let lower = body.to_lowercase();
    markers
        .iter()
        .filter(|m| lower.contains(**m))
        .map(|m| m.to_string())
        .collect()
}
