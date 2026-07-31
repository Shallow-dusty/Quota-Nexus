use keyring::Entry;
use zeroize::Zeroizing;

use crate::error::CommandError;

const SERVICE_PREFIX: &str = "AIQuotaMonitor/Credential";

fn entry(id: &str) -> Result<Entry, CommandError> {
    Entry::new(&format!("{SERVICE_PREFIX}/{id}"), "provider-secret")
        .map_err(|_| CommandError::storage("无法访问 Windows Credential Manager"))
}

pub fn store(id: &str, secret: &str) -> Result<(), CommandError> {
    entry(id)?
        .set_password(secret)
        .map_err(|_| CommandError::storage("凭据写入 Windows Credential Manager 失败"))
}

pub fn load(id: &str) -> Result<Zeroizing<String>, CommandError> {
    let secret = entry(id)?
        .get_password()
        .map_err(|_| CommandError::storage("Windows Credential Manager 中找不到该凭据"))?;
    Ok(Zeroizing::new(secret))
}

pub fn delete(id: &str) -> Result<(), CommandError> {
    entry(id)?
        .delete_credential()
        .map_err(|_| CommandError::storage("清理 Windows Credential Manager 凭据失败"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "writes and removes one temporary Windows Credential Manager entry"]
    fn windows_credential_round_trip() {
        let id = format!("integration-test-{}", uuid::Uuid::new_v4());
        let value = format!("test-only-{}", uuid::Uuid::new_v4());
        store(&id, &value).unwrap();
        let loaded = load(&id).unwrap();
        assert_eq!(loaded.as_str(), value);
        drop(loaded);
        delete(&id).unwrap();
        assert!(load(&id).is_err());
    }
}
