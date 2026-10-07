-- Restrict an athlete to at most one active registration per race
UPDATE registrations
SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  SELECT r.id
  FROM registrations r
  WHERE r.status <> 'cancelled'
    AND r.id NOT IN (
      SELECT MIN(r2.id)
      FROM registrations r2
      WHERE r2.status <> 'cancelled'
      GROUP BY r2.athlete_profile_id, r2.race_id
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_athlete_race_active_unique
  ON registrations(athlete_profile_id, race_id)
  WHERE status <> 'cancelled';
