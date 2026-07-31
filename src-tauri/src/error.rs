use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl CommandError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "validation",
            message: message.into(),
        }
    }

    pub fn auth() -> Self {
        Self {
            code: "auth",
            message: "Cline Pass 凭据无效或已失效".into(),
        }
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self {
            code: "network",
            message: message.into(),
        }
    }

    pub fn parser(message: impl Into<String>) -> Self {
        Self {
            code: "parser",
            message: message.into(),
        }
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self {
            code: "storage",
            message: message.into(),
        }
    }

    pub fn category(&self) -> &'static str {
        match self.code {
            "auth" => "auth",
            "parser" => "parser",
            "proxy" => "proxy",
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
