ALTER TABLE app_settings ADD COLUMN notify_quota INTEGER NOT NULL DEFAULT 1 CHECK (notify_quota IN (0, 1));
