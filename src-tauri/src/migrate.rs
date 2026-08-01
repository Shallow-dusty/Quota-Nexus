//! 旧版（AI Quota Monitor，identifier `com.aiquotamonitor.desktop`）一次性迁移。
//!
//! 三层数据全部搬迁：SQLite 业务库、WCM 秘密条目、数据库文件名。
//! 全部 best-effort：失败仅跳过，不阻断启动；旧条目残留无害。

use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

use crate::credential::{NETWORK_SERVICE_PREFIX, SERVICE_PREFIX};

pub const DB_NAME: &str = "quota-nexus.sqlite3";
pub const LEGACY_DB_NAME: &str = "ai-quota-monitor.sqlite3";
pub const LEGACY_IDENTIFIER: &str = "com.aiquotamonitor.desktop";

const LEGACY_SERVICE_PREFIX: &str = "AIQuotaMonitor/Credential";
const LEGACY_NETWORK_SERVICE_PREFIX: &str = "AIQuotaMonitor/NetworkProfile";

/// 旧 identifier 的数据目录（与现目录同一父级，通常是 %APPDATA%）。
pub fn legacy_data_dir(new_dir: &Path) -> Option<PathBuf> {
    new_dir.parent().map(|parent| parent.join(LEGACY_IDENTIFIER))
}

/// 把旧数据目录中的 SQLite 三件套（db/-wal/-shm）移动到新目录并改为新文件名。
/// 返回是否发生了迁移。EBWebView 等由 WebView2 在新目录自行重建，不搬运。
pub fn migrate_legacy_data_dir(new_dir: &Path, legacy_dir: &Path) -> bool {
    let new_db = new_dir.join(DB_NAME);
    let legacy_db = legacy_dir.join(LEGACY_DB_NAME);
    if new_db.exists() || !legacy_db.exists() {
        return false;
    }
    for suffix in ["", "-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", legacy_db.display()));
        if !from.exists() {
            continue;
        }
        let to = PathBuf::from(format!("{}{suffix}", new_db.display()));
        // rename 优先（同卷零拷贝），跨卷失败时退化为 copy + remove
        if std::fs::rename(&from, &to).is_err()
            && std::fs::copy(&from, &to).is_ok()
        {
            let _ = std::fs::remove_file(&from);
        }
    }
    true
}

/// 按迁移后 SQLite 中的 ID 清单，把 WCM 条目从旧服务名搬到新服务名并删除旧条目。
/// keyring 不支持枚举，因此 ID 只能来自数据库；返回成功迁移的条目数。
pub async fn migrate_legacy_wcm(pool: &SqlitePool) -> usize {
    let credential_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM credentials")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
    let profile_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM network_profiles")
            .fetch_all(pool)
            .await
            .unwrap_or_default();

    let mut migrated = 0;
    for id in &credential_ids {
        migrated += move_entry(LEGACY_SERVICE_PREFIX, SERVICE_PREFIX, id, "provider-secret");
    }
    for id in &profile_ids {
        migrated += move_entry(
            LEGACY_NETWORK_SERVICE_PREFIX,
            NETWORK_SERVICE_PREFIX,
            id,
            "proxy-auth",
        );
    }
    migrated
}

fn move_entry(old_prefix: &str, new_prefix: &str, id: &str, username: &str) -> usize {
    let secret = keyring::Entry::new(&format!("{old_prefix}/{id}"), username)
        .and_then(|entry| entry.get_password());
    let Ok(secret) = secret else {
        return 0;
    };
    let written = keyring::Entry::new(&format!("{new_prefix}/{id}"), username)
        .and_then(|entry| entry.set_password(&secret));
    if written.is_err() {
        return 0;
    }
    let _ = keyring::Entry::new(&format!("{old_prefix}/{id}"), username)
        .and_then(|entry| entry.delete_credential());
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_db_triplet_and_renames_file() {
        let temp = tempfile::tempdir().unwrap();
        let new_dir = temp.path().join("com.quotanexus.desktop");
        let legacy_dir = temp.path().join(LEGACY_IDENTIFIER);
        std::fs::create_dir_all(&new_dir).unwrap();
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(legacy_dir.join(LEGACY_DB_NAME), b"db").unwrap();
        std::fs::write(format!("{}-wal", legacy_dir.join(LEGACY_DB_NAME).display()), b"wal")
            .unwrap();

        assert!(migrate_legacy_data_dir(&new_dir, &legacy_dir));
        assert_eq!(std::fs::read(new_dir.join(DB_NAME)).unwrap(), b"db");
        assert_eq!(
            std::fs::read(format!("{}-wal", new_dir.join(DB_NAME).display())).unwrap(),
            b"wal"
        );
        assert!(!legacy_dir.join(LEGACY_DB_NAME).exists());
    }

    #[test]
    fn skips_when_new_db_already_exists() {
        let temp = tempfile::tempdir().unwrap();
        let new_dir = temp.path().join("com.quotanexus.desktop");
        let legacy_dir = temp.path().join(LEGACY_IDENTIFIER);
        std::fs::create_dir_all(&new_dir).unwrap();
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(new_dir.join(DB_NAME), b"new").unwrap();
        std::fs::write(legacy_dir.join(LEGACY_DB_NAME), b"old").unwrap();

        assert!(!migrate_legacy_data_dir(&new_dir, &legacy_dir));
        assert_eq!(std::fs::read(new_dir.join(DB_NAME)).unwrap(), b"new");
        // 未迁移时旧库原样保留
        assert!(legacy_dir.join(LEGACY_DB_NAME).exists());
    }
}
