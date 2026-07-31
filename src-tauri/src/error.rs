use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_seconds: Option<u64>,
}

impl CommandError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "validation",
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    pub fn auth() -> Self {
        Self {
            code: "auth",
            message: "供应商凭据无效或已失效".into(),
            retry_after_seconds: None,
        }
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self {
            code: "network",
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    pub fn parser(message: impl Into<String>) -> Self {
        Self {
            code: "parser",
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    pub fn proxy(message: impl Into<String>) -> Self {
        Self {
            code: "proxy",
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self {
            code: "storage",
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    pub fn rate_limit(retry_after_seconds: Option<u64>) -> Self {
        Self {
            code: "rate_limit",
            message: "供应商请求频率受限，将按计划稍后重试".into(),
            retry_after_seconds,
        }
    }

    pub fn category(&self) -> &'static str {
        match self.code {
            "auth" => "auth",
            "parser" => "parser",
            "proxy" => "proxy",
            "rate_limit" => "network",
            _ => "network",
        }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CommandError {}
