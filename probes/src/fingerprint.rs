//! 响应结构指纹与证据提取：只保留结构信息，不保留值。
//!
//! - JSON：保留 key 树与值类型（<string>/<number>/...），值本身不进入指纹；
//! - HTML：提取与额度解析相关的证据（title、含 % 元素、data-time 元素、
//!   套餐枚举 token），文本内容一律脱敏；
//! - 绝对用量扫描（P-023 取证）：记录疑似绝对用量字段的路径，不断言语义。

use serde_json::{json, Value};

const MAX_DEPTH: usize = 6;

/// JSON 结构指纹：key 保留，值替换为类型标记。
pub fn json_fingerprint(value: &Value, depth: usize) -> Value {
    if depth >= MAX_DEPTH {
        return Value::String("…".into());
    }
    match value {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                out.insert(k.clone(), json_fingerprint(v, depth + 1));
            }
            Value::Object(out)
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                json!([])
            } else {
                json!([
                    json_fingerprint(&arr[0], depth + 1),
                    format!("..共 {} 项", arr.len())
                ])
            }
        }
        Value::String(_) => Value::String("<string>".into()),
        Value::Number(_) => Value::String("<number>".into()),
        Value::Bool(_) => Value::String("<bool>".into()),
        Value::Null => Value::String("<null>".into()),
    }
}

/// P-023 绝对用量取证：扫描 JSON 中疑似"绝对用量"的数值字段路径。
/// 只记录路径（不含值），语义由人工在 provider-contracts 中确认。
pub fn scan_absolute_amount_fields(value: &Value) -> Vec<String> {
    const CANDIDATE_KEYS: [&str; 12] = [
        "used",
        "limit",
        "total",
        "quota",
        "credits",
        "tokens",
        "remaining",
        "allowance",
        "consumed",
        "cap",
        "balance",
        "count",
    ];
    let mut hits = Vec::new();
    walk(value, "", &CANDIDATE_KEYS, &mut hits);
    hits
}

fn walk(value: &Value, path: &str, keys: &[&str], hits: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                let child = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{path}.{k}")
                };
                let lk = k.to_lowercase();
                if v.is_number() && keys.iter().any(|c| lk.contains(c)) {
                    hits.push(child.clone());
                }
                walk(v, &child, keys, hits);
            }
        }
        Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate().take(3) {
                walk(v, &format!("{path}[{i}]"), keys, hits);
            }
        }
        _ => {}
    }
}

/// 对非 JSON 的 JS 序列化文本（SolidStart server-fn 响应或内嵌页面数据）
/// 做关键词存在性扫描。只记录"出现/未出现"，不记录上下文值。
pub fn js_key_presence(text: &str, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter(|k| text.contains(**k))
        .map(|k| k.to_string())
        .collect()
}

/// Ollama settings 页证据提取：
/// - title；
/// - 含 "%" 的元素文本（脱敏后，用于定位 Session/Weekly 百分比）；
/// - 带 data-time 属性的元素（重置时间证据，值本身是时间戳，可保留）；
/// - 命中的套餐枚举 token（Free/Pro/Max）。
pub fn html_usage_evidence(html: &str, redact: &crate::redact::Redactor) -> Value {
    let document = scraper::Html::parse_document(html);

    let title = document
        .select(&scraper::Selector::parse("title").unwrap())
        .next()
        .map(|t| redact.redact(&t.text().collect::<String>()));

    let percent_re = regex::Regex::new(r"(?i)(session|weekly|cloud usage|usage)").unwrap();
    let mut percent_elements = Vec::new();
    for el in document.select(&scraper::Selector::parse("*").unwrap()) {
        let own_text: String = el.text().collect::<String>().trim().to_string();
        if own_text.len() > 120 || !own_text.contains('%') {
            continue;
        }
        if percent_re.is_match(&own_text) {
            percent_elements.push(json!({
                "tag": el.value().name(),
                "text": redact.redact(&own_text),
            }));
        }
        if percent_elements.len() >= 12 {
            break;
        }
    }

    let mut data_time_elements = Vec::new();
    for el in document.select(&scraper::Selector::parse("[data-time]").unwrap()) {
        let text: String = el.text().collect::<String>().trim().to_string();
        data_time_elements.push(json!({
            "tag": el.value().name(),
            "data-time": el.value().attr("data-time"),
            "text": redact.redact(&text),
        }));
        if data_time_elements.len() >= 12 {
            break;
        }
    }

    let plan_tokens: Vec<&str> = ["Free", "Pro", "Max"]
        .iter()
        .filter(|t| html.contains(**t))
        .copied()
        .collect();

    json!({
        "title": title,
        "percent_elements": percent_elements,
        "data_time_elements": data_time_elements,
        "plan_tokens_found": plan_tokens,
        "has_cloud_usage_marker": html.contains("Cloud Usage"),
    })
}
