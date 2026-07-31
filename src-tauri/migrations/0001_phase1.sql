PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS network_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    transport TEXT NOT NULL CHECK (transport IN ('http', 'https', 'socks5', 'socks5h')),
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    has_auth INTEGER NOT NULL DEFAULT 0 CHECK (has_auth IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('clinepass', 'opencode-go', 'ollama-cloud')),
    label TEXT NOT NULL,
    network_profile_id TEXT NULL REFERENCES network_profiles(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    last_validated_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS provider_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('clinepass', 'opencode-go', 'ollama-cloud')),
    label TEXT NOT NULL,
    plan TEXT NULL,
    credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    last_success_at TEXT NULL,
    last_error_category TEXT NULL CHECK (
        last_error_category IS NULL OR
        last_error_category IN ('auth', 'network', 'parser', 'proxy')
    )
);

CREATE INDEX IF NOT EXISTS provider_accounts_credential_idx
    ON provider_accounts(credential_id);

CREATE TABLE IF NOT EXISTS quota_snapshots (
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    window_kind TEXT NOT NULL,
    window_label TEXT NOT NULL,
    used_percent REAL NOT NULL CHECK (used_percent BETWEEN 0 AND 100),
    resets_at TEXT NULL,
    observed_at TEXT NOT NULL,
    PRIMARY KEY (account_id, window_kind)
);
