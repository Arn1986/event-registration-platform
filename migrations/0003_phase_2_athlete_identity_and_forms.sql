CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions(token_hash);
CREATE INDEX sessions_user_idx ON sessions(user_id);

ALTER TABLE athlete_profiles ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE athlete_profiles ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE athlete_profiles ADD COLUMN medical_notes_encrypted TEXT;

CREATE TABLE form_versions (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  title TEXT NOT NULL DEFAULT 'Registration questions',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX form_versions_event_version_unique ON form_versions(event_id, version);
CREATE INDEX form_versions_event_status_idx ON form_versions(event_id, status);

CREATE TABLE form_fields (
  id TEXT PRIMARY KEY NOT NULL,
  form_version_id TEXT NOT NULL REFERENCES form_versions(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  help_text TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('short_text','long_text','number','date','single_select','multi_select','checkbox')),
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  options_json TEXT NOT NULL DEFAULT '[]',
  validation_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX form_fields_version_key_unique ON form_fields(form_version_id, key);
CREATE INDEX form_fields_version_sort_idx ON form_fields(form_version_id, sort_order);

CREATE TABLE waiver_versions (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX waiver_versions_event_version_unique ON waiver_versions(event_id, version);
CREATE INDEX waiver_versions_event_status_idx ON waiver_versions(event_id, status);

ALTER TABLE registrations ADD COLUMN category_id TEXT REFERENCES categories(id);
ALTER TABLE registrations ADD COLUMN wave_id TEXT REFERENCES waves(id);
ALTER TABLE registrations ADD COLUMN form_version_id TEXT REFERENCES form_versions(id);
ALTER TABLE registrations ADD COLUMN waiver_version_id TEXT REFERENCES waiver_versions(id);

CREATE TABLE registration_answers (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  field_id TEXT NOT NULL REFERENCES form_fields(id),
  value_json TEXT,
  encrypted_value TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX registration_answers_registration_field_unique ON registration_answers(registration_id, field_id);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  waiver_version_id TEXT NOT NULL REFERENCES waiver_versions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('athlete','guardian')),
  waiver_checksum TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);
CREATE INDEX consent_records_registration_idx ON consent_records(registration_id);

ALTER TABLE auth_challenges ADD COLUMN request_ip_hash TEXT;

CREATE TABLE guardian_consents (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  guardian_name TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  relationship TEXT NOT NULL,
  challenge_id TEXT REFERENCES auth_challenges(id),
  consented_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX guardian_consents_registration_unique ON guardian_consents(registration_id);
