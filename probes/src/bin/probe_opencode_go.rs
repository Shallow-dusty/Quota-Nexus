//! OpenCode Go 只读探针：验证 _server RPC + Go 用量页契约。
//!
//! 契约起点（MIT，CodexBar OpenCodeGoUsageFetcher.swift）：
//! - workspaces RPC: GET /_server?id=<fn-id>，头 X-Server-Id / X-Server-Instance /
//!   Origin / Referer / Cookie，响应含 wrk_ 前缀 workspace ID；
//! - Go 用量页: GET /workspace/{wrk}/go，页面内嵌 rollingUsage/weeklyUsage/
//!   monthlyUsage 的 usagePercent + resetInSec；
//! - 会话失效: 401/403 或页面含 login / sign in / auth/authorize 等标记。
//!
//! 注意：resetInSec 为相对秒数（重置时刻 = now + resetInSec），属滑动语义，
//! 与 DESIGN.md 状态代次去重的决策一致——不把 resetsAt 当周期身份。

use anyhow::Result;
use clap::Parser;
use regex::Regex;
use serde_json::json;
use std::path::PathBuf;

use aiqm_probes::allowlist::OPENCODE_GO_RULES;
use aiqm_probes::config::{self, CredentialsFile};
use aiqm_probes::fingerprint;
use aiqm_probes::http;
use aiqm_probes::redact::Redactor;
use aiqm_probes::report::{self, Classification, ProbeReport, RequestReport};
use aiqm_probes::{hit_markers, OPENCODE_SIGNED_OUT_MARKERS};

const BASE: &str = "https://opencode.ai";
const SERVER_URL: &str = "https://opencode.ai/_server";
const WORKSPACES_ID: &str = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
                  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

#[derive(Parser)]
#[command(name = "probe_opencode_go", about = "OpenCode Go 只读探针")]
struct Cli {
    #[arg(long, default_value_os_t = config::default_credentials_path())]
    credentials: PathBuf,
    #[arg(long, default_value_os_t = config::default_raw_dir())]
    raw_dir: PathBuf,
    #[arg(long, default_value_os_t = config::default_snapshot_dir())]
    snapshot_dir: PathBuf,
    #[arg(long, help = "无凭据时对 workspaces RPC 发送匿名请求，验证鉴权行为")]
    anonymous: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let creds = CredentialsFile::load(&cli.credentials).ok();
    let client = http::build_client()?;
    let redactor = Redactor::new(creds.as_ref().map(|c| c.secrets()).unwrap_or_default());
    let mut report = ProbeReport::new("opencode-go");
    report
        .notes
        .push("契约起点: CodexBar OpenCodeGoUsageFetcher.swift (MIT)".into());
    report
        .notes
        .push("resetInSec 为相对秒数；resetsAt 由客户端按 now+resetInSec 现算（滑动语义）".into());

    let cred = creds.as_ref().and_then(|c| c.opencode_go.as_ref());
    let cookie = cred
        .map(|c| c.cookie.trim().to_string())
        .filter(|c| !c.is_empty());
    let configured_ws = cred.and_then(|c| c.workspace_id.clone());

    // ---- 请求 1: workspaces RPC ----
    let url1 = format!("{SERVER_URL}?id={WORKSPACES_ID}");
    let mut r1 = RequestReport::new(1, "workspaces-rpc", "GET", &url1, cookie.is_some());
    let authed = match (&cookie, cli.anonymous) {
        (Some(_), _) => true,
        (None, true) => false,
        (None, false) => {
            r1.classification = Classification::Skipped;
            r1.evidence
                .push("未提供 opencode_go.cookie；可用 --anonymous 匿名验证".into());
            report.push(r1);
            report.compute_verdict();
            report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
            return Ok(());
        }
    };

    let mut discovered_ws: Option<String> = None;
    let url1_result = http::send_guarded(
        &client,
        OPENCODE_GO_RULES,
        "GET",
        &url1,
        &server_headers(cookie.as_deref()),
    );
    match url1_result {
        Err(e) => {
            r1.classification = Classification::NetworkError;
            r1.evidence.push(redactor.redact(&format!("{e:#}")));
        }
        Ok(resp) => {
            r1.status = Some(resp.status);
            r1.content_type = resp.content_type.clone();
            r1.redirect_location = resp.location.clone();
            if let Ok(p) = report::persist_raw(&cli.raw_dir, "opencode-go", 1, &resp.body) {
                r1.evidence
                    .push(format!("原始响应(未脱敏): {}", p.display()));
            }
            let markers = hit_markers(&resp.body, &OPENCODE_SIGNED_OUT_MARKERS);
            if resp.status == 401 || resp.status == 403 || !markers.is_empty() {
                r1.classification = if authed {
                    Classification::AuthExpired
                } else {
                    Classification::ExpectedRejection
                };
                r1.evidence
                    .push(format!("HTTP {}，会话失效标记: {:?}", resp.status, markers));
            } else if resp.status == 200 {
                let ids = extract_workspace_ids(&resp.body);
                r1.evidence
                    .push(format!("发现 {} 个 workspace（值已脱敏）", ids.len()));
                r1.extracted = json!({ "workspace_count": ids.len() });
                r1.classification = Classification::Success;
                discovered_ws = ids.into_iter().next();
            } else {
                r1.classification = Classification::Unexpected;
                r1.evidence.push(format!("HTTP {}", resp.status));
            }
        }
    }
    let r1_class = r1.classification;
    report.push(r1);

    // ---- 请求 2: Go 用量页 ----
    let no_configured_ws = configured_ws.is_none();
    let ws = configured_ws.or(discovered_ws);
    let mut r2 = match &ws {
        Some(w) => RequestReport::new(
            2,
            "go-usage-page",
            "GET",
            &format!("{BASE}/workspace/{w}/go"),
            cookie.is_some(),
        ),
        None => {
            let mut r = RequestReport::new(2, "go-usage-page", "GET", "(no workspace)", false);
            r.classification = Classification::Skipped;
            r.evidence
                .push("无可用 workspace（未配置且 RPC 未发现）".into());
            r
        }
    };

    if let (Some(w), Some(c)) = (&ws, &cookie) {
        if r1_class != Classification::Success && no_configured_ws {
            r2.classification = Classification::Skipped;
            r2.evidence.push("workspace 发现失败，且无配置兜底".into());
        } else {
            let url2 = format!("{BASE}/workspace/{w}/go");
            let headers = vec![
                ("Cookie".to_string(), c.clone()),
                ("User-Agent".to_string(), UA.to_string()),
                (
                    "Accept".to_string(),
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8".to_string(),
                ),
            ];
            match http::send_guarded(&client, OPENCODE_GO_RULES, "GET", &url2, &headers) {
                Err(e) => {
                    r2.classification = Classification::NetworkError;
                    r2.evidence.push(redactor.redact(&format!("{e:#}")));
                }
                Ok(resp) => {
                    r2.status = Some(resp.status);
                    r2.content_type = resp.content_type.clone();
                    r2.redirect_location = resp.location.clone();
                    if let Ok(p) = report::persist_raw(&cli.raw_dir, "opencode-go", 2, &resp.body) {
                        r2.evidence
                            .push(format!("原始响应(未脱敏): {}", p.display()));
                    }
                    classify_go_page(&mut r2, &resp);
                }
            }
        }
    } else if r2.classification != Classification::Skipped {
        r2.classification = Classification::Skipped;
        r2.evidence.push("无凭据或无 workspace".into());
    }
    report.push(r2);

    report.compute_verdict();
    report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
    Ok(())
}

fn server_headers(cookie: Option<&str>) -> Vec<(String, String)> {
    let mut h = vec![
        ("X-Server-Id".to_string(), WORKSPACES_ID.to_string()),
        (
            "X-Server-Instance".to_string(),
            format!("server-fn:{}", uuid::Uuid::new_v4()),
        ),
        ("Origin".to_string(), BASE.to_string()),
        ("Referer".to_string(), format!("{BASE}/")),
        ("User-Agent".to_string(), UA.to_string()),
        (
            "Accept".to_string(),
            "text/javascript, application/json;q=0.9, */*;q=0.8".to_string(),
        ),
    ];
    if let Some(c) = cookie {
        h.push(("Cookie".to_string(), c.to_string()));
    }
    h
}

fn extract_workspace_ids(body: &str) -> Vec<String> {
    let re = Regex::new(r"wrk_[A-Za-z0-9]+").expect("常量正则");
    let mut out: Vec<String> = Vec::new();
    for m in re.find_iter(body) {
        let s = m.as_str().to_string();
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

fn classify_go_page(r: &mut RequestReport, resp: &http::CapturedResponse) {
    let markers = hit_markers(&resp.body, &OPENCODE_SIGNED_OUT_MARKERS);
    if resp.status == 401 || resp.status == 403 || !markers.is_empty() {
        r.classification = Classification::AuthExpired;
        r.evidence
            .push(format!("HTTP {}，会话失效标记: {:?}", resp.status, markers));
        return;
    }
    if resp.status != 200 {
        r.classification = Classification::Unexpected;
        r.evidence.push(format!("HTTP {}", resp.status));
        return;
    }

    let rolling = grab_window(&resp.body, "rollingUsage");
    let weekly = grab_window(&resp.body, "weeklyUsage");
    let monthly = grab_window(&resp.body, "monthlyUsage");
    let presence = fingerprint::js_key_presence(
        &resp.body,
        &[
            "rollingUsage",
            "weeklyUsage",
            "monthlyUsage",
            "usagePercent",
            "resetInSec",
            "resetsAt",
            "plan",
            "tier",
            "quota",
            "credits",
            "tokens",
            "balance",
        ],
    );
    r.extracted = json!({
        "rolling_5h": rolling,
        "weekly": weekly,
        "monthly": monthly,
        "key_presence": presence,
        "reset_semantics": "resetInSec 相对秒数（滑动；resetsAt = now + resetInSec 由客户端现算）",
        "percent_magnitude_note": "原始值可能为 0-1 分数或 0-100 百分比，快照记录原值供方向判定",
    });
    r.fingerprint = Some(json!({ "js_key_presence": presence }));

    match rolling {
        Some(_) => {
            r.classification = Classification::Success;
            r.evidence.push(format!(
                "rollingUsage 命中；weekly={} monthly={}",
                weekly.is_some(),
                monthly.is_some()
            ));
        }
        None => {
            r.classification = Classification::ParseError;
            r.evidence
                .push("页面 200 但未命中 rollingUsage 字段".into());
        }
    }
}

/// 提取 `<window>Usage` 内的 usagePercent / resetInSec（兼容带引号 key）。
fn grab_window(body: &str, window: &str) -> Option<serde_json::Value> {
    let pct = Regex::new(&format!(
        r#""?{window}"?[^}}]*?"?usagePercent"?\s*:\s*([0-9]+(?:\.[0-9]+)?)"#
    ))
    .ok()?
    .captures(body)
    .and_then(|c| c.get(1))
    .and_then(|m| m.as_str().parse::<f64>().ok());
    let reset = Regex::new(&format!(
        r#""?{window}"?[^}}]*?"?resetInSec"?\s*:\s*([0-9]+)"#
    ))
    .ok()?
    .captures(body)
    .and_then(|c| c.get(1))
    .and_then(|m| m.as_str().parse::<u64>().ok());
    match (pct, reset) {
        (None, None) => None,
        _ => Some(json!({
            "usage_percent_raw": pct,
            "reset_in_sec": reset,
        })),
    }
}
