ALTER TABLE provider_accounts ADD COLUMN scope_id TEXT NULL;

CREATE INDEX IF NOT EXISTS provider_accounts_scope_idx
    ON provider_accounts(provider, scope_id);
