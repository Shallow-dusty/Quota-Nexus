//! ClinePass 只读探针：验证 GET /api/v1/users/me/plan/usage-limits 契约。
//!
//! 契约起点（MIT，CodexBar ClinePassUsageFetcher.swift）：
//! - Authorization: Bearer <api_key>；Accept: application/json
//! - 响应 { success, data: { limits: [{ type: five_hour|weekly|monthly,
//!   percentUsed: number, resetsAt: ISO8601|null }] } }
//! - 401/403 → 认证失效
//!
//! 探针职责是**验证**以上假设并记录证据，而非盲目信任。

use anyhow::Result;
use clap::Parser;
use serde_json::json;
use std::path::PathBuf;

use aiqm_probes::allowlist::CLINEPASS_RULES;
use aiqm_probes::config::{self, CredentialsFile, NetworkRoute};
use aiqm_probes::fingerprint;
use aiqm_probes::http;
use aiqm_probes::redact::Redactor;
use aiqm_probes::report::{self, Classification, ProbeReport, RequestReport};

const URL: &str = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";

#[derive(Parser)]
#[command(name = "probe_clinepass", about = "ClinePass 只读探针")]
struct Cli {
    #[arg(long, default_value_os_t = config::default_credentials_path())]
    credentials: PathBuf,
    #[arg(long, default_value_os_t = config::default_raw_dir())]
    raw_dir: PathBuf,
    #[arg(long, default_value_os_t = config::default_snapshot_dir())]
    snapshot_dir: PathBuf,
    #[arg(long, help = "无凭据时发送匿名请求，验证端点可达性与鉴权行为")]
    anonymous: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let creds = CredentialsFile::load_optional(&cli.credentials)?;
    let redactor = Redactor::new(creds.as_ref().map(|c| c.secrets()).unwrap_or_default());
    let credential = creds.as_ref().and_then(|c| c.clinepass.as_ref());
    let route = match (&creds, credential) {
        (Some(file), Some(credential)) => file.route_for(credential.network_profile.as_deref())?,
        _ => NetworkRoute::Default,
    };
    let client = http::build_client(&route)?;
    let mut report = ProbeReport::new("clinepass");
    report
        .notes
        .push("契约起点: CodexBar ClinePassUsageFetcher.swift (MIT)".into());
    report
        .notes
        .push(format!("network_route={}", route.report_mode()));

    let api_key = credential
        .map(|c| c.api_key.trim().to_string())
        .filter(|k| !k.is_empty());

    let mut rr = RequestReport::new(1, "usage-limits", "GET", URL, api_key.is_some());
    let authed = match (&api_key, cli.anonymous) {
        (Some(_), _) => true,
        (None, true) => false,
        (None, false) => {
            rr.classification = Classification::Skipped;
            rr.evidence
                .push("未提供 clinepass.api_key；可用 --anonymous 匿名验证端点".into());
            report.push(rr);
            report.compute_verdict();
            report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
            return Ok(());
        }
    };

    let mut headers = vec![("Accept".to_string(), "application/json".to_string())];
    if authed {
        headers.push((
            "Authorization".to_string(),
            format!("Bearer {}", api_key.as_deref().unwrap_or_default()),
        ));
    }

    match http::send_guarded(&client, CLINEPASS_RULES, "GET", URL, &headers) {
        Err(e) => {
            rr.classification = Classification::NetworkError;
            rr.evidence
                .push(http::safe_request_error(&route, &e, &redactor));
        }
        Ok(resp) => {
            rr.status = Some(resp.status);
            rr.content_type = resp.content_type.clone();
            rr.redirect_location = resp.location.clone();
            if let Ok(p) = report::persist_raw(&cli.raw_dir, "clinepass", 1, &resp.body) {
                rr.evidence
                    .push(format!("原始响应(未脱敏): {}", p.display()));
            }
            match resp.status {
                200 => classify_ok(&mut rr, &resp.body),
                401 | 403 => {
                    rr.classification = if authed {
                        Classification::AuthExpired
                    } else {
                        Classification::ExpectedRejection
                    };
                    rr.evidence.push(format!("HTTP {}", resp.status));
                }
                other => {
                    rr.classification = Classification::Unexpected;
                    rr.evidence.push(format!("HTTP {other}"));
                }
            }
        }
    }

    report.push(rr);
    report.compute_verdict();
    report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
    Ok(())
}

fn classify_ok(r: &mut RequestReport, body: &str) {
    let value: serde_json::Value = match serde_json::from_str(body) {
        Err(e) => {
            r.classification = Classification::ParseError;
            r.evidence.push(format!("JSON 解析失败: {e}"));
            return;
        }
        Ok(v) => v,
    };
    r.fingerprint = Some(fingerprint::json_fingerprint(&value, 0));

    let success = value
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);
    let mut windows = Vec::new();
    if let Some(limits) = value.pointer("/data/limits").and_then(|l| l.as_array()) {
        for lim in limits {
            windows.push(json!({
                "type": lim.get("type").and_then(|t| t.as_str()),
                "percent_used": lim.get("percentUsed").and_then(|p| p.as_f64()),
                "resets_at_present": lim.get("resetsAt").map(|v| !v.is_null()),
            }));
        }
    }
    let absolute_candidates = fingerprint::scan_absolute_amount_fields(&value);
    r.extracted = json!({
        "success_field": success,
        "windows": windows,
        "absolute_amount_field_candidates": absolute_candidates,
        "reset_semantics": "resetsAt 绝对 ISO8601 时间戳（可空）",
        "percent_direction": "percentUsed = 0–100 已用百分比（真实账号实测）",
    });

    if success && !windows.is_empty() {
        r.classification = Classification::Success;
        r.evidence
            .push(format!("success=true，{} 个额度窗口", windows.len()));
    } else {
        r.classification = Classification::ParseError;
        r.evidence
            .push(format!("success={success}，窗口数 {}", windows.len()));
    }
}
