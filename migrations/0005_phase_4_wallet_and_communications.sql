ALTER TABLE registrations ADD COLUMN bib_number TEXT;
ALTER TABLE registrations ADD COLUMN bib_assigned_at TEXT;
CREATE UNIQUE INDEX registrations_event_bib_unique
  ON registrations(event_id, bib_number)
  WHERE bib_number IS NOT NULL;

ALTER TABLE wallet_passes ADD COLUMN apple_object_key TEXT;
ALTER TABLE wallet_passes ADD COLUMN google_save_url TEXT;
ALTER TABLE wallet_passes ADD COLUMN pass_spec_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE wallet_passes ADD COLUMN last_error TEXT;
ALTER TABLE wallet_passes ADD COLUMN issued_at TEXT;
ALTER TABLE wallet_passes ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_passes DROP COLUMN share_url;

CREATE TABLE communication_logs (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('confirmation','waitlist','cancellation','event_update','wallet_delivery')),
  channel TEXT NOT NULL CHECK (channel IN ('email','wallet')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  external_id TEXT,
  error_message TEXT,
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE UNIQUE INDEX communication_logs_dedupe_unique ON communication_logs(dedupe_key);
CREATE INDEX communication_logs_registration_idx ON communication_logs(registration_id, created_at);
