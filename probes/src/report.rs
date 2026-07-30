//! 探针报告：结构化记录每次请求的分类、证据与指纹。
//!
//! 输出两路：
//! - 原始响应体 → `data/probe-raw/`（gitignored，禁止提交）；
//! - 脱敏报告 JSON → `docs/provider-contracts/snapshots/`（可提交）。

use crate::redact::Redactor;
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use time::macros::format_description;
use time::OffsetDateTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Classification {
    Success,
    AuthExpired,
    /// 匿名探针按预期被拒（401/403/登录重定向）：证明端点可达且鉴权生效。
    ExpectedRejection,
    NetworkError,
    ParseError,
    Unexpected,
    Skipped,
}

#[derive(Debug, Serialize)]
pub struct RequestReport {
    pub seq: usize,
    pub purpose: String,
    pub method: String,
    pub host: String,
    pub path: String,
    pub query: String,
    pub authenticated: bool,
    pub status: Option<u16>,
    pub content_type: Option<String>,
    pub redirect_location: Option<String>,
    pub classification: Classification,
    pub evidence: Vec<String>,
    pub fingerprint: Option<Value>,
    pub extracted: Value,
}

impl RequestReport {
    pub fn new(seq: usize, purpose: &str, method: &str, url: &str, authenticated: bool) -> Self {
        let parsed = url::Url::parse(url).ok();
        Self {
            seq,
            purpose: purpose.to_string(),
            method: method.to_string(),
            host: parsed
                .as_ref()
                .and_then(|u| u.host_str().map(String::from))
                .unwrap_or_default(),
            path: parsed
                .as_ref()
                .map(|u| u.path().to_string())
                .unwrap_or_default(),
            // query 可能携带 wrk_ 等标识，统一只记录是否存在
            query: parsed
                .as_ref()
                .map(|u| {
                    if u.query().is_some() {
                        "present(redacted)".to_string()
                    } else {
                        "none".to_string()
                    }
                })
                .unwrap_or_default(),
            authenticated,
            status: None,
            content_type: None,
            redirect_location: None,
            classification: Classification::Skipped,
            evidence: Vec::new(),
            fingerprint: None,
            extracted: json!({}),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ProbeReport {
    pub provider: String,
    pub probe_version: String,
    pub started_at_utc: String,
    pub proxy_env_detected: Vec<String>,
    pub requests: Vec<RequestReport>,
    pub verdict: String,
    pub notes: Vec<String>,
}

impl ProbeReport {
    pub fn new(provider: &str) -> Self {
        let proxy_env = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]
            .iter()
            .filter(|k| std::env::var_os(k).is_some())
            .map(|k| k.to_string())
            .collect();
        Self {
            provider: provider.to_string(),
            probe_version: crate::PROBE_VERSION.to_string(),
            started_at_utc: now_rfc3339(),
            proxy_env_detected: proxy_env,
            requests: Vec::new(),
            verdict: "pending".to_string(),
            notes: Vec::new(),
        }
    }

    pub fn push(&mut self, r: RequestReport) {
        self.requests.push(r);
    }

    pub fn compute_verdict(&mut self) {
        let has = |c: Classification| self.requests.iter().any(|r| r.classification == c);
        self.verdict = if has(Classification::ParseError) {
            "parse_error"
        } else if has(Classification::AuthExpired) {
            "auth_expired"
        } else if has(Classification::NetworkError) || has(Classification::Unexpected) {
            "network_or_unexpected"
        } else if has(Classification::ExpectedRejection) {
            "endpoint_reachable_auth_required"
        } else if self
            .requests
            .iter()
            .all(|r| r.classification == Classification::Skipped)
        {
            "skipped"
        } else if has(Classification::Success) {
            "success"
        } else {
            "network_or_unexpected"
        }
        .to_string();
    }

    /// 写脱敏快照并打印人类可读摘要。返回快照路径。
    pub fn finalize_and_write(&self, snapshot_dir: &Path, redactor: &Redactor) -> Result<PathBuf> {
        std::fs::create_dir_all(snapshot_dir)
            .with_context(|| format!("创建快照目录失败: {}", snapshot_dir.display()))?;
        let file = snapshot_dir.join(format!("{}-{}.json", self.provider, file_stamp()));
        let mut json_text = serde_json::to_string_pretty(self).context("序列化报告失败")?;
        json_text = redactor.redact(&json_text);
        json_text = redactor.redact_workspace_ids(&json_text);
        std::fs::write(&file, &json_text)
            .with_context(|| format!("写入快照失败: {}", file.display()))?;

        println!("\n===== 探针摘要 [{}] =====", self.provider);
        for r in &self.requests {
            println!(
                "  #{} [{}] {} {}{} → {}",
                r.seq,
                r.purpose,
                r.method,
                r.host,
                r.path,
                r.status
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "(no response)".into()),
            );
            println!(
                "      分类: {:?}（认证携带: {}）",
                r.classification, r.authenticated
            );
            for e in &r.evidence {
                println!(
                    "      证据: {}",
                    redactor.redact_workspace_ids(&redactor.redact(e))
                );
            }
        }
        println!("  结论: {}", self.verdict);
        println!("  脱敏快照: {}", file.display());
        Ok(file)
    }
}

/// 写原始响应体到 gitignored 目录；返回写入路径（供 evidence 引用）。
pub fn persist_raw(raw_dir: &Path, provider: &str, seq: usize, body: &str) -> Result<PathBuf> {
    let dir = raw_dir.join(provider);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("创建原始响应目录失败: {}", dir.display()))?;
    let warning = dir.join("DO-NOT-COMMIT.txt");
    if !warning.exists() {
        std::fs::write(
            &warning,
            "本目录包含未脱敏的探针原始响应，可能包含账号身份信息。\n\
             禁止提交 Git，禁止外发。整理 fixture 时必须另行脱敏。\n",
        )
        .ok();
    }
    let file = dir.join(format!("{}-seq{}.txt", file_stamp(), seq));
    std::fs::write(&file, body).with_context(|| format!("写入原始响应失败: {}", file.display()))?;
    Ok(file)
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown".into())
}

fn file_stamp() -> String {
    let fmt = format_description!("[year][month][day]T[hour][minute][second]Z");
    OffsetDateTime::now_utc()
        .format(&fmt)
        .unwrap_or_else(|_| "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::{Classification, ProbeReport, RequestReport};

    fn request(seq: usize, classification: Classification) -> RequestReport {
        let mut request = RequestReport::new(seq, "test", "GET", "https://example.com/", true);
        request.classification = classification;
        request
    }

    #[test]
    fn partial_success_does_not_hide_auth_failure() {
        let mut report = ProbeReport::new("test");
        report.push(request(1, Classification::Success));
        report.push(request(2, Classification::AuthExpired));
        report.compute_verdict();
        assert_eq!(report.verdict, "auth_expired");
    }

    #[test]
    fn partial_success_does_not_hide_parse_failure() {
        let mut report = ProbeReport::new("test");
        report.push(request(1, Classification::Success));
        report.push(request(2, Classification::ParseError));
        report.compute_verdict();
        assert_eq!(report.verdict, "parse_error");
    }

    #[test]
    fn all_success_remains_success() {
        let mut report = ProbeReport::new("test");
        report.push(request(1, Classification::Success));
        report.push(request(2, Classification::Success));
        report.compute_verdict();
        assert_eq!(report.verdict, "success");
    }
}
