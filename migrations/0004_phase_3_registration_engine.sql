ALTER TABLE races ADD COLUMN entry_modes_json TEXT NOT NULL DEFAULT '["individual"]';
ALTER TABLE races ADD COLUMN team_min_size INTEGER NOT NULL DEFAULT 2 CHECK (team_min_size >= 2);
ALTER TABLE races ADD COLUMN team_max_size INTEGER NOT NULL DEFAULT 2 CHECK (team_max_size >= team_min_size);

CREATE TABLE teams (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  race_id TEXT NOT NULL REFERENCES races(id),
  category_id TEXT REFERENCES categories(id),
  wave_id TEXT REFERENCES waves(id),
  name TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('team','relay')),
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming','ready','cancelled')),
  captain_registration_id TEXT,
  join_code_hash TEXT NOT NULL,
  join_code_hint TEXT NOT NULL,
  min_size INTEGER NOT NULL CHECK (min_size >= 2),
  max_size INTEGER NOT NULL CHECK (max_size >= min_size),
  organizer_created INTEGER NOT NULL DEFAULT 0 CHECK (organizer_created IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX teams_event_idx ON teams(event_id);
CREATE INDEX teams_race_idx ON teams(race_id);
CREATE UNIQUE INDEX teams_join_code_hash_unique ON teams(join_code_hash);

ALTER TABLE registrations ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'individual' CHECK (entry_type IN ('individual','team','relay'));
ALTER TABLE registrations ADD COLUMN team_id TEXT REFERENCES teams(id);
ALTER TABLE registrations ADD COLUMN registration_reference TEXT;
ALTER TABLE registrations ADD COLUMN idempotency_key TEXT;
ALTER TABLE registrations ADD COLUMN processed_at TEXT;
CREATE UNIQUE INDEX registrations_reference_unique ON registrations(registration_reference);
CREATE UNIQUE INDEX registrations_idempotency_unique ON registrations(idempotency_key);
CREATE INDEX registrations_team_idx ON registrations(team_id);

CREATE TABLE team_members (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain','member')),
  relay_leg TEXT,
  joined_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX team_members_registration_unique ON team_members(registration_id);
CREATE UNIQUE INDEX team_members_team_registration_unique ON team_members(team_id, registration_id);
CREATE INDEX team_members_team_idx ON team_members(team_id);

CREATE TRIGGER team_members_registration_match_before_insert
BEFORE INSERT ON team_members
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM registrations
  WHERE id = NEW.registration_id AND team_id = NEW.team_id
)
BEGIN
  SELECT RAISE(ABORT, 'team_registration_mismatch');
END;

CREATE TRIGGER team_members_capacity_before_insert
BEFORE INSERT ON team_members
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >=
     (SELECT max_size FROM teams WHERE id = NEW.team_id)
BEGIN
  SELECT RAISE(ABORT, 'team_full');
END;

CREATE TRIGGER team_members_after_insert
AFTER INSERT ON team_members
FOR EACH ROW
BEGIN
  UPDATE teams SET status = CASE WHEN (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= min_size THEN 'ready' ELSE 'forming' END,
    updated_at = NEW.joined_at
  WHERE id = NEW.team_id AND status <> 'cancelled';
END;

CREATE TRIGGER team_members_after_delete
AFTER DELETE ON team_members
FOR EACH ROW
BEGIN
  UPDATE teams SET status = CASE WHEN (SELECT COUNT(*) FROM team_members WHERE team_id = OLD.team_id) >= min_size THEN 'ready' ELSE 'forming' END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = OLD.team_id AND status <> 'cancelled';
END;

CREATE TABLE team_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  relay_leg TEXT,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX team_invitations_token_hash_unique ON team_invitations(token_hash);
CREATE INDEX team_invitations_team_idx ON team_invitations(team_id);

CREATE TABLE capacity_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('event','race','category','wave')),
  scope_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX capacity_reservations_registration_scope_unique ON capacity_reservations(registration_id, scope_type);
CREATE INDEX capacity_reservations_scope_idx ON capacity_reservations(scope_type, scope_id);

CREATE TRIGGER capacity_reservations_state_before_insert
BEFORE INSERT ON capacity_reservations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM registrations
  WHERE id = NEW.registration_id
    AND event_id = NEW.event_id
    AND status IN ('submitted','waitlisted')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_registration_state');
END;

CREATE TRIGGER capacity_reservations_limit_before_insert
BEFORE INSERT ON capacity_reservations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM capacity_counters c
  WHERE c.event_id = NEW.event_id
    AND c.scope_type = NEW.scope_type
    AND c.scope_id = NEW.scope_id
    AND (c."limit" IS NULL OR c.confirmed < c."limit")
)
BEGIN
  SELECT RAISE(ABORT, 'capacity_full');
END;

CREATE TRIGGER capacity_reservations_after_insert
AFTER INSERT ON capacity_reservations
FOR EACH ROW
BEGIN
  UPDATE capacity_counters SET confirmed = confirmed + 1, updated_at = NEW.created_at
  WHERE event_id = NEW.event_id AND scope_type = NEW.scope_type AND scope_id = NEW.scope_id;
END;

CREATE TRIGGER capacity_reservations_after_delete
AFTER DELETE ON capacity_reservations
FOR EACH ROW
BEGIN
  UPDATE capacity_counters SET confirmed = MAX(confirmed - 1, 0), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE event_id = OLD.event_id AND scope_type = OLD.scope_type AND scope_id = OLD.scope_id;
END;

CREATE TABLE registration_status_history (
  id TEXT PRIMARY KEY NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','athlete','organizer','guardian')),
  actor_reference TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX registration_status_history_registration_idx ON registration_status_history(registration_id, created_at);

UPDATE registrations
SET registration_reference = '3FS-' || upper(substr(replace(id, '-', ''), -8)),
    idempotency_key = 'legacy-' || id
WHERE registration_reference IS NULL;
