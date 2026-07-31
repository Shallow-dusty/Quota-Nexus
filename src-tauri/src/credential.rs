use keyring::Entry;
use zeroize::Zeroizing;

use crate::error::CommandError;

const SERVICE_PREFIX: &str = "AIQuotaMonitor/Credential";
const NETWORK_SERVICE_PREFIX: &str = "AIQuotaMonitor/NetworkProfile";

fn entry(prefix: &str, id: &str, username: &str) -> Result<Entry, CommandError> {
    Entry::new(&format!("{prefix}/{id}"), username)
        .map_err(|_| CommandError::storage("无法访问 Windows Credential Manager"))
}

pub fn store(id: &str, secret: &str) -> Result<(), CommandError> {
    entry(SERVICE_PREFIX, id, "provider-secret")?
        .set_password(secret)
        .map_err(|_| CommandError::storage("凭据写入 Windows Credential Manager 失败"))
}

pub fn load(id: &str) -> Result<Zeroizing<String>, CommandError> {
    let secret = entry(SERVICE_PREFIX, id, "provider-secret")?
        .get_password()
        .map_err(|_| CommandError::storage("Windows Credential Manager 中找不到该凭据"))?;
    Ok(Zeroizing::new(secret))
}

pub fn delete(id: &str) -> Result<(), CommandError> {
    entry(SERVICE_PREFIX, id, "provider-secret")?
        .delete_credential()
        .map_err(|_| CommandError::storage("清理 Windows Credential Manager 凭据失败"))
}

#[derive(Debug)]
pub struct ProxyAuth {
    pub username: Zeroizing<String>,
    pub password: Zeroizing<String>,
}

pub fn store_proxy_auth(id: &str, username: &str, password: &str) -> Result<(), CommandError> {
    let encoded = Zeroizing::new(
        serde_json::to_string(&(username, password))
            .map_err(|_| CommandError::storage("无法序列化代理认证"))?,
    );
    entry(NETWORK_SERVICE_PREFIX, id, "proxy-auth")?
        .set_password(&encoded)
        .map_err(|_| CommandError::storage("代理认证写入 Windows Credential Manager 失败"))
}

pub fn load_proxy_auth(id: &str) -> Result<ProxyAuth, CommandError> {
    let encoded = Zeroizing::new(
        entry(NETWORK_SERVICE_PREFIX, id, "proxy-auth")?
            .get_password()
            .map_err(|_| CommandError::proxy("Windows Credential Manager 中找不到代理认证"))?,
    );
    let (username, password): (String, String) =
        serde_json::from_str(&encoded).map_err(|_| CommandError::proxy("代理认证格式无效"))?;
    Ok(ProxyAuth {
        username: Zeroizing::new(username),
        password: Zeroizing::new(password),
    })
}

pub fn delete_proxy_auth(id: &str) -> Result<(), CommandError> {
    entry(NETWORK_SERVICE_PREFIX, id, "proxy-auth")?
        .delete_credential()
        .map_err(|_| CommandError::storage("清理代理认证失败"))
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

    #[test]
    #[ignore = "writes and removes one temporary Windows Credential Manager entry"]
    fn windows_proxy_auth_round_trip() {
        let id = format!("proxy-integration-test-{}", uuid::Uuid::new_v4());
        store_proxy_auth(&id, "test-user", "test-password").unwrap();
        let loaded = load_proxy_auth(&id).unwrap();
        assert_eq!(loaded.username.as_str(), "test-user");
        assert_eq!(loaded.password.as_str(), "test-password");
        drop(loaded);
        delete_proxy_auth(&id).unwrap();
        assert!(load_proxy_auth(&id).is_err());
    }
}
