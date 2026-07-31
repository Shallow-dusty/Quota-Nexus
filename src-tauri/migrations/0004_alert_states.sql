CREATE TABLE IF NOT EXISTS alert_states (
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    period_key TEXT NULL,
    generation INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'normal',
    last_notified_at TEXT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (account_id, alert_key)
);

CREATE INDEX IF NOT EXISTS alert_states_updated_idx
    ON alert_states(updated_at DESC);
