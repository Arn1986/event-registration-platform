import { env } from "cloudflare:workers";
import { decryptSensitive } from "../security/crypto.server";

type FieldSecrets = { FIELD_ENCRYPTION_KEY?: string };
const database = () => env.DB;
function secrets() { return env as Env & FieldSecrets; }

export async function listOrganizerRegistrations(eventId: string, search: string, status: string) {
  const pattern = `%${search.trim()}%`;
  const result = await database().prepare(`SELECT r.id, r.registration_reference AS registrationReference, r.status, r.entry_type AS entryType, r.submitted_at AS submittedAt, p.first_name AS firstName, p.last_name AS lastName, u.email, race.name AS raceName, c.name AS categoryName, w.name AS waveName, t.name AS teamName FROM registrations r JOIN athlete_profiles p ON p.id = r.athlete_profile_id JOIN users u ON u.id = p.user_id JOIN races race ON race.id = r.race_id LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN waves w ON w.id = r.wave_id LEFT JOIN teams t ON t.id = r.team_id WHERE r.event_id = ? AND (? = '' OR r.status = ?) AND (? = '%%' OR r.registration_reference LIKE ? OR p.first_name || ' ' || p.last_name LIKE ? OR u.email LIKE ? OR t.name LIKE ?) ORDER BY r.submitted_at DESC`)
    .bind(eventId, status, status, pattern, pattern, pattern, pattern, pattern).all<{ id: string; registrationReference: string; status: string; entryType: string; submittedAt: string; firstName: string; lastName: string; email: string; raceName: string; categoryName: string | null; waveName: string | null; teamName: string | null }>();
  const metrics = await database().prepare(`SELECT COUNT(*) AS total, SUM(status = 'confirmed') AS confirmed, SUM(status = 'waitlisted') AS waitlisted, SUM(status = 'awaiting_guardian_consent') AS awaitingGuardian FROM registrations WHERE event_id = ?`).bind(eventId).first<{ total: number; confirmed: number; waitlisted: number; awaitingGuardian: number }>();
  return { registrations: result.results, metrics: metrics ?? { total: 0, confirmed: 0, waitlisted: 0, awaitingGuardian: 0 } };
}

export async function getOrganizerRegistration(eventId: string, registrationId: string, includeSensitive: boolean) {
  const registration = await database().prepare(`SELECT r.id, r.registration_reference AS registrationReference, r.status, r.entry_type AS entryType, r.team_id AS teamId, r.race_id AS raceId, r.category_id AS categoryId, r.wave_id AS waveId, r.athlete_snapshot_json AS athleteSnapshotJson, r.submitted_at AS submittedAt, r.confirmed_at AS confirmedAt, p.first_name AS firstName, p.last_name AS lastName, p.medical_notes_encrypted AS medicalNotesEncrypted, u.email, race.name AS raceName, t.name AS teamName FROM registrations r JOIN athlete_profiles p ON p.id = r.athlete_profile_id JOIN users u ON u.id = p.user_id JOIN races race ON race.id = r.race_id LEFT JOIN teams t ON t.id = r.team_id WHERE r.event_id = ? AND r.id = ?`)
    .bind(eventId, registrationId).first<{ id: string; registrationReference: string; status: string; entryType: string; teamId: string | null; raceId: string; categoryId: string | null; waveId: string | null; athleteSnapshotJson: string; submittedAt: string; confirmedAt: string | null; firstName: string; lastName: string; medicalNotesEncrypted: string | null; email: string; raceName: string; teamName: string | null }>();
  if (!registration) return null;
  const [answers, consents, history] = await Promise.all([
    database().prepare(`SELECT f.label, f.sensitive, a.value_json AS valueJson, a.encrypted_value AS encryptedValue FROM registration_answers a JOIN form_fields f ON f.id = a.field_id WHERE a.registration_id = ? ORDER BY f.sort_order`).bind(registrationId).all<{ label: string; sensitive: number; valueJson: string | null; encryptedValue: string | null }>(),
    database().prepare("SELECT actor_type AS actorType, accepted_at AS acceptedAt, waiver_checksum AS waiverChecksum FROM consent_records WHERE registration_id = ? ORDER BY accepted_at").bind(registrationId).all<{ actorType: string; acceptedAt: string; waiverChecksum: string }>(),
    database().prepare("SELECT from_status AS fromStatus, to_status AS toStatus, actor_type AS actorType, actor_reference AS actorReference, reason, created_at AS createdAt FROM registration_status_history WHERE registration_id = ? ORDER BY created_at DESC").bind(registrationId).all<{ fromStatus: string | null; toStatus: string; actorType: string; actorReference: string | null; reason: string | null; createdAt: string }>(),
  ]);
  const encryptionKey = secrets().FIELD_ENCRYPTION_KEY;
  const parsedAnswers = await Promise.all(answers.results.map(async (answer) => ({ label: answer.label, sensitive: Boolean(answer.sensitive), value: answer.sensitive ? (includeSensitive && answer.encryptedValue && encryptionKey ? JSON.parse(await decryptSensitive(answer.encryptedValue, encryptionKey)) : "Restricted") : answer.valueJson ? JSON.parse(answer.valueJson) : "" })));
  const athleteSnapshot = JSON.parse(registration.athleteSnapshotJson) as Record<string, unknown>;
  delete athleteSnapshot.medicalNotesEncrypted;
  const medicalNotes = includeSensitive && registration.medicalNotesEncrypted && encryptionKey ? await decryptSensitive(registration.medicalNotesEncrypted, encryptionKey) : registration.medicalNotesEncrypted ? "Restricted" : "";
  return { ...registration, medicalNotesEncrypted: undefined, medicalNotes, athleteSnapshot, answers: parsedAnswers, consents: consents.results, history: history.results };
}
