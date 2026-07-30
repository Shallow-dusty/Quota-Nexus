//! Ollama Cloud 只读探针：验证 settings 页契约。
//!
//! 契约起点（MIT，CodexBar docs/ollama.md + OllamaUsageParser）：
//! - GET https://ollama.com/settings，Cookie 认证（wos-session / __Secure-session
//!   等；探针不挑选 cookie 名，完整发送用户提供的 header）；
//! - 解析 Cloud Usage 区块：套餐徽章（Free/Pro/Max）、Session/Weekly 百分比、
//!   "Resets in …" 元素的 data-time 时间戳；
//! - 重定向到 /signin 或 WorkOS AuthKit → 认证失效（不得误报解析错误）。

use anyhow::Result;
use clap::Parser;
use regex::Regex;
use serde_json::json;
use std::path::PathBuf;

use aiqm_probes::allowlist::OLLAMA_CLOUD_RULES;
use aiqm_probes::config::{self, CredentialsFile};
use aiqm_probes::fingerprint;
use aiqm_probes::http;
use aiqm_probes::redact::Redactor;
use aiqm_probes::report::{self, Classification, ProbeReport, RequestReport};
use aiqm_probes::{hit_markers, OLLAMA_SIGNIN_LOCATION_MARKERS};

const URL: &str = "https://ollama.com/settings";
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
                  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

#[derive(Parser)]
#[command(name = "probe_ollama_cloud", about = "Ollama Cloud 只读探针")]
struct Cli {
    #[arg(long, default_value_os_t = config::default_credentials_path())]
    credentials: PathBuf,
    #[arg(long, default_value_os_t = config::default_raw_dir())]
    raw_dir: PathBuf,
    #[arg(long, default_value_os_t = config::default_snapshot_dir())]
    snapshot_dir: PathBuf,
    #[arg(long, help = "无凭据时发送匿名请求，验证登录重定向行为")]
    anonymous: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let creds = CredentialsFile::load(&cli.credentials).ok();
    let client = http::build_client()?;
    let redactor = Redactor::new(creds.as_ref().map(|c| c.secrets()).unwrap_or_default());
    let mut report = ProbeReport::new("ollama-cloud");
    report
        .notes
        .push("契约起点: CodexBar docs/ollama.md / OllamaUsageParser (MIT)".into());
    report
        .notes
        .push("不依赖单一 cookie 名：完整发送用户提供的 Cookie header".into());

    let cookie = creds
        .as_ref()
        .and_then(|c| c.ollama_cloud.as_ref())
        .map(|c| c.cookie.trim().to_string())
        .filter(|c| !c.is_empty());

    let mut rr = RequestReport::new(1, "settings-page", "GET", URL, cookie.is_some());
    let authed = match (&cookie, cli.anonymous) {
        (Some(_), _) => true,
        (None, true) => false,
        (None, false) => {
            rr.classification = Classification::Skipped;
            rr.evidence
                .push("未提供 ollama_cloud.cookie；可用 --anonymous 匿名验证".into());
            report.push(rr);
            report.compute_verdict();
            report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
            return Ok(());
        }
    };

    let mut headers = vec![
        ("User-Agent".to_string(), UA.to_string()),
        (
            "Accept".to_string(),
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8".to_string(),
        ),
    ];
    if authed {
        headers.push(("Cookie".to_string(), cookie.clone().unwrap_or_default()));
    }

    match http::send_guarded(&client, OLLAMA_CLOUD_RULES, "GET", URL, &headers) {
        Err(e) => {
            rr.classification = Classification::NetworkError;
            rr.evidence.push(redactor.redact(&format!("{e:#}")));
        }
        Ok(resp) => {
            rr.status = Some(resp.status);
            rr.content_type = resp.content_type.clone();
            rr.redirect_location = resp.location.clone();
            if let Ok(p) = report::persist_raw(&cli.raw_dir, "ollama-cloud", 1, &resp.body) {
                rr.evidence
                    .push(format!("原始响应(未脱敏): {}", p.display()));
            }
            classify(&mut rr, &resp, authed);
        }
    }

    report.push(rr);
    report.compute_verdict();
    report.finalize_and_write(&cli.snapshot_dir, &redactor)?;
    Ok(())
}

fn classify(r: &mut RequestReport, resp: &http::CapturedResponse, authed: bool) {
    // 3xx：登录重定向是认证失效的权威信号（CodexBar 文档），不得误报解析错误
    if (300..400).contains(&resp.status) {
        let loc = resp.location.clone().unwrap_or_default();
        let hits = hit_markers(&loc, &OLLAMA_SIGNIN_LOCATION_MARKERS);
        r.classification = if !hits.is_empty() {
            if authed {
                Classification::AuthExpired
            } else {
                Classification::ExpectedRejection
            }
        } else {
            Classification::Unexpected
        };
        r.evidence
            .push(format!("HTTP {} → Location: {}", resp.status, loc));
        return;
    }
    if resp.status == 401 || resp.status == 403 {
        r.classification = if authed {
            Classification::AuthExpired
        } else {
            Classification::ExpectedRejection
        };
        r.evidence.push(format!("HTTP {}", resp.status));
        return;
    }
    if resp.status != 200 {
        r.classification = Classification::Unexpected;
        r.evidence.push(format!("HTTP {}", resp.status));
        return;
    }

    let body_markers = hit_markers(&resp.body, &["sign in", "signin", "log in"]);
    let evidence = fingerprint::html_usage_evidence(&resp.body, &Redactor::new(vec![]));
    r.fingerprint = Some(evidence.clone());

    let session_pct = grab_pct(&resp.body, "session");
    let weekly_pct = grab_pct(&resp.body, "weekly");
    let data_times = grab_data_times(&resp.body);
    r.extracted = json!({
        "plan_tokens_found": evidence.get("plan_tokens_found").cloned().unwrap_or(json!([])),
        "has_cloud_usage_marker": evidence.get("has_cloud_usage_marker").cloned().unwrap_or(json!(false)),
        "session_percent_raw": session_pct,
        "weekly_percent_raw": weekly_pct,
        "data_time_values": data_times,
        "signin_body_markers": body_markers,
        "reset_semantics": "data-time 属性（ISO 时间戳，绝对语义，待复核）",
    });

    if !body_markers.is_empty() {
        r.classification = if authed {
            Classification::AuthExpired
        } else {
            Classification::ExpectedRejection
        };
        r.evidence
            .push(format!("页面含登录标记: {:?}", body_markers));
        return;
    }
    let has_usage = evidence
        .get("has_cloud_usage_marker")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if has_usage || session_pct.is_some() || weekly_pct.is_some() {
        r.classification = Classification::Success;
        r.evidence.push(format!(
            "Cloud Usage 标记={has_usage}，session%={:?}，weekly%={:?}，data-time {} 处",
            session_pct,
            weekly_pct,
            data_times.len()
        ));
    } else {
        r.classification = Classification::ParseError;
        r.evidence
            .push("页面 200 但未命中 Cloud Usage / 百分比元素".into());
    }
}

fn grab_pct(body: &str, window: &str) -> Option<f64> {
    let re = Regex::new(&format!(
        r"(?i){window}[^\d%]{{0,40}}?(\d{{1,3}}(?:\.\d+)?)\s*%"
    ))
    .ok()?;
    re.captures(body)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<f64>().ok())
}

fn grab_data_times(body: &str) -> Vec<String> {
    let re = Regex::new(r#"data-time="([^"]+)""#).expect("常量正则");
    re.captures_iter(body)
        .take(6)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect()
}
