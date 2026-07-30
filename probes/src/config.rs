//! 探针凭据文件加载与路径约定。
//!
//! 凭据文件为 gitignored 的本地 JSON（默认 probes/credentials.local.json），
//! 仅在运行期读取；探针任何输出都不得包含其内容（见 redact 模块）。

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct CredentialsFile {
    #[serde(default)]
    pub clinepass: Option<ClinePassCredential>,
    #[serde(default)]
    pub opencode_go: Option<OpenCodeGoCredential>,
    #[serde(default)]
    pub ollama_cloud: Option<OllamaCloudCredential>,
}

#[derive(Debug, Deserialize)]
pub struct ClinePassCredential {
    pub api_key: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenCodeGoCredential {
    pub cookie: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OllamaCloudCredential {
    pub cookie: String,
}

impl CredentialsFile {
    pub fn load(path: &Path) -> Result<Self> {
        let raw = std::fs::read_to_string(path)
            .with_context(|| format!("读取凭据文件失败: {}", path.display()))?;
        serde_json::from_str(&raw)
            .with_context(|| format!("解析凭据文件 JSON 失败: {}", path.display()))
    }

    /// 收集所有非空秘密字符串，供 Redactor 做字面量替换。
    pub fn secrets(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(c) = &self.clinepass {
            out.push(c.api_key.clone());
        }
        if let Some(c) = &self.opencode_go {
            out.push(c.cookie.clone());
        }
        if let Some(c) = &self.ollama_cloud {
            out.push(c.cookie.clone());
        }
        out.retain(|s| !s.trim().is_empty());
        out
    }
}

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

/// workspace 根目录（probes/ 的父目录）。
pub fn workspace_root() -> PathBuf {
    manifest_dir()
        .parent()
        .expect("probes/ 应位于 workspace 根目录下")
        .to_path_buf()
}

pub fn default_credentials_path() -> PathBuf {
    manifest_dir().join("credentials.local.json")
}

/// 原始响应目录（gitignored，禁止提交）。
pub fn default_raw_dir() -> PathBuf {
    workspace_root().join("data").join("probe-raw")
}

/// 脱敏快照目录（git 跟踪，可提交）。
pub fn default_snapshot_dir() -> PathBuf {
    workspace_root()
        .join("docs")
        .join("provider-contracts")
        .join("snapshots")
}
