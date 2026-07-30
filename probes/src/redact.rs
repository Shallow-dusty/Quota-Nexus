//! 输出脱敏：所有写入 stdout / 快照文件的内容必须过 Redactor。

/// 对凭据文件中的秘密做字面量替换；长秘密优先，避免子串遮蔽。
pub struct Redactor {
    secrets: Vec<String>,
}

impl Redactor {
    pub fn new(mut secrets: Vec<String>) -> Self {
        // 过短的字符串会造成大面积误伤，不参与替换
        secrets.retain(|s| s.len() >= 4);
        secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
        Self { secrets }
    }

    pub fn redact(&self, input: &str) -> String {
        let mut out = input.to_string();
        for s in &self.secrets {
            out = out.replace(s.as_str(), "***REDACTED***");
        }
        out
    }

    /// workspace ID 等外部标识：保留形态信息（wrk_ 前缀）但不保留可识别值。
    pub fn redact_workspace_ids(&self, input: &str) -> String {
        let re = regex::Regex::new(r"wrk_[A-Za-z0-9]+").expect("常量正则");
        re.replace_all(input, "wrk_***").to_string()
    }
}
