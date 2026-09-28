CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','event_manager','registration_reviewer')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX organization_memberships_org_user_unique ON organization_memberships (organization_id, user_id);
CREATE INDEX organization_memberships_org_idx ON organization_memberships (organization_id);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  race_id TEXT NOT NULL REFERENCES races(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX categories_race_idx ON categories (race_id);

CREATE TABLE waves (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  race_id TEXT NOT NULL REFERENCES races(id),
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX waves_race_idx ON waves (race_id);

CREATE TABLE event_access_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  token_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Primary private link',
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX event_access_tokens_event_idx ON event_access_tokens (event_id);

CREATE TABLE capacity_counters (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('event','race','category','wave')),
  scope_id TEXT NOT NULL,
  "limit" INTEGER CHECK ("limit" IS NULL OR "limit" >= 0),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX capacity_counters_scope_unique ON capacity_counters (scope_type, scope_id);
CREATE INDEX capacity_counters_event_idx ON capacity_counters (event_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at);

INSERT OR IGNORE INTO organizations (id, name, slug, timezone, created_at, updated_at)
VALUES ('org_3fstriders', '3F Striders', '3f-striders', 'Asia/Dubai', datetime('now'), datetime('now'));
