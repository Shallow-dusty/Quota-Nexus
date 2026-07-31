ALTER TABLE provider_accounts ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_accounts ADD COLUMN next_attempt_at TEXT NULL;
ALTER TABLE provider_accounts ADD COLUMN next_refresh_at TEXT NULL;
ALTER TABLE provider_accounts ADD COLUMN auth_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_accounts ADD COLUMN effective_refresh_minutes INTEGER NULL;
ALTER TABLE provider_accounts ADD COLUMN updated_at TEXT NULL;

UPDATE provider_accounts
SET updated_at = created_at,
    effective_refresh_minutes = 15,
    next_refresh_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

CREATE UNIQUE INDEX IF NOT EXISTS provider_accounts_credential_scope_unique
    ON provider_accounts(credential_id, COALESCE(scope_id, ''));

CREATE TABLE IF NOT EXISTS quota_history (
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    window_kind TEXT NOT NULL,
    window_label TEXT NOT NULL,
    used_percent REAL NOT NULL CHECK (used_percent BETWEEN 0 AND 100),
    resets_at TEXT NULL,
    observed_at TEXT NOT NULL,
    PRIMARY KEY (account_id, window_kind, observed_at)
);

CREATE INDEX IF NOT EXISTS quota_history_account_time_idx
    ON quota_history(account_id, observed_at DESC);

INSERT OR IGNORE INTO quota_history
    (account_id, window_kind, window_label, used_percent, resets_at, observed_at)
SELECT account_id, window_kind, window_label, used_percent, resets_at, observed_at
FROM quota_snapshots;

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    refresh_interval_minutes INTEGER NULL CHECK (
        refresh_interval_minutes IS NULL OR refresh_interval_minutes IN (5, 15, 30)
    ),
    adaptive_refresh INTEGER NOT NULL DEFAULT 1 CHECK (adaptive_refresh IN (0, 1)),
    warning_threshold REAL NOT NULL DEFAULT 70 CHECK (warning_threshold BETWEEN 0 AND 100),
    high_threshold REAL NOT NULL DEFAULT 85 CHECK (high_threshold BETWEEN 0 AND 100),
    critical_threshold REAL NOT NULL DEFAULT 95 CHECK (critical_threshold BETWEEN 0 AND 100),
    history_days INTEGER NULL DEFAULT 30 CHECK (
        history_days IS NULL OR history_days IN (7, 30, 90)
    ),
    tray_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tray_enabled IN (0, 1)),
    autostart_enabled INTEGER NOT NULL DEFAULT 0 CHECK (autostart_enabled IN (0, 1)),
    privacy_mode INTEGER NOT NULL DEFAULT 0 CHECK (privacy_mode IN (0, 1)),
    notify_auth INTEGER NOT NULL DEFAULT 1 CHECK (notify_auth IN (0, 1)),
    notify_stale INTEGER NOT NULL DEFAULT 1 CHECK (notify_stale IN (0, 1)),
    notify_recovery INTEGER NOT NULL DEFAULT 0 CHECK (notify_recovery IN (0, 1)),
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (
    id, refresh_interval_minutes, adaptive_refresh, warning_threshold,
    high_threshold, critical_threshold, history_days, tray_enabled,
    autostart_enabled, privacy_mode, notify_auth, notify_stale,
    notify_recovery, updated_at
) VALUES (
    1, 15, 1, 70, 85, 95, 30, 1, 0, 0, 1, 1, 0,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE IF NOT EXISTS provider_health (
    provider TEXT PRIMARY KEY NOT NULL CHECK (
        provider IN ('clinepass', 'opencode-go', 'ollama-cloud')
    ),
    circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (
        circuit_state IN ('closed', 'open', 'half-open')
    ),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_success_at TEXT NULL,
    next_probe_at TEXT NULL,
    last_error_category TEXT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO provider_health (provider, updated_at)
VALUES
    ('clinepass', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('opencode-go', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('ollama-cloud', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
