import { env } from "cloudflare:workers";

import type { PublishedField } from "../../domain/forms/form-validation";
import type { EntryType } from "../../domain/teams/team-rules";
import type { AthleteIdentity } from "../auth/athlete-auth.server";
import { decryptSensitive, encryptSensitive } from "../security/crypto.server";
import type { WaiverRecord } from "./form-repository.server";

type FieldSecrets = { FIELD_ENCRYPTION_KEY?: string };
const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function secrets() { return env as Env & FieldSecrets; }

export type AthleteProfileInput = {
  firstName: string; lastName: string; dateOfBirth: string; phone: string; nationality: string; clubName: string;
  emergencyContactName: string; emergencyContactPhone: string; medicalNotes: string;
};

export async function getAthleteProfile(userId: string) {
  const profile = await database().prepare(`SELECT id, first_name AS firstName, last_name AS lastName, date_of_birth AS dateOfBirth, phone, nationality, club_name AS clubName, emergency_contact_name AS emergencyContactName, emergency_contact_phone AS emergencyContactPhone, medical_notes_encrypted AS medicalNotesEncrypted FROM athlete_profiles WHERE user_id = ?`)
    .bind(userId).first<{ id: string; firstName: string; lastName: string; dateOfBirth: string; phone: string | null; nationality: string | null; clubName: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; medicalNotesEncrypted: string | null }>();
  if (!profile) return null;
  let medicalNotes = "";
  const encryptionKey = secrets().FIELD_ENCRYPTION_KEY;
  if (profile.medicalNotesEncrypted && encryptionKey) medicalNotes = await decryptSensitive(profile.medicalNotesEncrypted, encryptionKey);
  return { ...profile, phone: profile.phone ?? "", nationality: profile.nationality ?? "", clubName: profile.clubName ?? "", emergencyContactName: profile.emergencyContactName ?? "", emergencyContactPhone: profile.emergencyContactPhone ?? "", medicalNotes };
}

async function upsertProfile(identity: AthleteIdentity, input: AthleteProfileInput) {
  const encryptionKey = secrets().FIELD_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("FIELD_ENCRYPTION_KEY is not configured");
  const timestamp = now();
  const encryptedMedicalNotes = input.medicalNotes ? await encryptSensitive(input.medicalNotes, encryptionKey) : null;
  const profileId = identity.profileId ?? id("athlete");
  await database().prepare(`INSERT INTO athlete_profiles (id, user_id, first_name, last_name, date_of_birth, phone, nationality, club_name, emergency_contact_name, emergency_contact_phone, medical_notes_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name, date_of_birth = excluded.date_of_birth, phone = excluded.phone, nationality = excluded.nationality, club_name = excluded.club_name, emergency_contact_name = excluded.emergency_contact_name, emergency_contact_phone = excluded.emergency_contact_phone, medical_notes_encrypted = excluded.medical_notes_encrypted, updated_at = excluded.updated_at`)
    .bind(profileId, identity.userId, input.firstName, input.lastName, input.dateOfBirth, input.phone, input.nationality, input.clubName || null, input.emergencyContactName, input.emergencyContactPhone, encryptedMedicalNotes, timestamp, timestamp).run();
  return { profileId, encryptedMedicalNotes };
}

export async function saveRegistrationSubmission(input: {
  identity: AthleteIdentity; eventId: string; raceId: string; categoryId?: string; waveId?: string;
  formVersionId: string; waiver: WaiverRecord; athlete: AthleteProfileInput; isMinor: boolean;
  answers: Array<{ field: PublishedField; values: string[] }>;
  guardian?: { name: string; email: string; relationship: string };
  entryType: EntryType; idempotencyKey: string; teamId?: string; teamRole?: "captain" | "member"; relayLeg?: string;
}) {
  const existing = await database().prepare("SELECT r.id AS registrationId, r.status, r.registration_reference AS registrationReference, g.guardian_email AS guardianEmail FROM registrations r LEFT JOIN guardian_consents g ON g.registration_id = r.id WHERE r.idempotency_key = ?")
    .bind(input.idempotencyKey).first<{ registrationId: string; status: string; registrationReference: string; guardianEmail: string | null }>();
  if (existing) return { ...existing, guardianEmail: existing.guardianEmail ?? undefined, existing: true as const };
  const selection = await database().prepare(`SELECT e.id AS eventId, r.id AS raceId,
    CASE WHEN ? IS NULL THEN 1 ELSE EXISTS(SELECT 1 FROM categories c WHERE c.id = ? AND c.race_id = r.id) END AS categoryValid,
    CASE WHEN ? IS NULL THEN 1 ELSE EXISTS(SELECT 1 FROM waves w WHERE w.id = ? AND w.race_id = r.id) END AS waveValid
    FROM events e JOIN races r ON r.event_id = e.id WHERE e.id = ? AND r.id = ? AND e.status = 'published'`)
    .bind(input.categoryId ?? null, input.categoryId ?? null, input.waveId ?? null, input.waveId ?? null, input.eventId, input.raceId)
    .first<{ eventId: string; raceId: string; categoryValid: number; waveValid: number }>();
  if (!selection || !selection.categoryValid || !selection.waveValid) throw new Error("The selected race details are no longer available.");
  if (input.isMinor && !input.guardian) throw new Error("Guardian details are required for athletes under 18.");

  const { profileId, encryptedMedicalNotes } = await upsertProfile(input.identity, input.athlete);
  const registrationId = id("registration"); const timestamp = now();
  const status = input.isMinor ? "awaiting_guardian_consent" : "submitted";
  const registrationReference = `3FS-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const snapshot = {
    firstName: input.athlete.firstName, lastName: input.athlete.lastName, dateOfBirth: input.athlete.dateOfBirth,
    phone: input.athlete.phone, nationality: input.athlete.nationality, clubName: input.athlete.clubName,
    emergencyContactName: input.athlete.emergencyContactName, emergencyContactPhone: input.athlete.emergencyContactPhone,
    medicalNotesEncrypted: encryptedMedicalNotes,
  };
  const statements = [
    database().prepare(`INSERT INTO registrations (id, event_id, race_id, athlete_profile_id, category_id, wave_id, form_version_id, waiver_version_id, entry_type, team_id, registration_reference, idempotency_key, status, athlete_snapshot_json, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(registrationId, input.eventId, input.raceId, profileId, input.categoryId ?? null, input.waveId ?? null, input.formVersionId, input.waiver.id, input.entryType, input.teamId ?? null, registrationReference, input.idempotencyKey, status, JSON.stringify(snapshot), timestamp, timestamp, timestamp),
    database().prepare("INSERT INTO consent_records (id, registration_id, waiver_version_id, user_id, actor_type, waiver_checksum, accepted_at) VALUES (?, ?, ?, ?, 'athlete', ?, ?)")
      .bind(id("consent"), registrationId, input.waiver.id, input.identity.userId, input.waiver.checksum, timestamp),
    database().prepare("INSERT INTO registration_status_history (id, registration_id, from_status, to_status, actor_type, actor_reference, reason, created_at) VALUES (?, ?, NULL, ?, 'athlete', ?, 'registration submitted', ?)")
      .bind(id("status"), registrationId, status, input.identity.email, timestamp),
  ];
  const encryptionKey = secrets().FIELD_ENCRYPTION_KEY!;
  for (const answer of input.answers) {
    const serialized = JSON.stringify(answer.field.type === "multi_select" ? answer.values : (answer.values[0] ?? ""));
    statements.push(database().prepare("INSERT INTO registration_answers (id, registration_id, field_id, value_json, encrypted_value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id("answer"), registrationId, answer.field.id, answer.field.sensitive ? null : serialized, answer.field.sensitive ? await encryptSensitive(serialized, encryptionKey) : null, timestamp));
  }
  if (input.guardian) statements.push(database().prepare("INSERT INTO guardian_consents (id, registration_id, guardian_name, guardian_email, relationship, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id("guardian"), registrationId, input.guardian.name, input.guardian.email, input.guardian.relationship, timestamp, timestamp));
  if (input.teamId && input.teamRole) statements.push(database().prepare("INSERT INTO team_members (id, team_id, registration_id, role, relay_leg, joined_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id("member"), input.teamId, registrationId, input.teamRole, input.relayLeg ?? null, timestamp, timestamp));
  await database().batch(statements);
  return { registrationId, registrationReference, status, guardianEmail: input.guardian?.email, existing: false as const };
}

export async function attachGuardianChallenge(registrationId: string, challengeId: string) {
  await database().prepare("UPDATE guardian_consents SET challenge_id = ?, updated_at = ? WHERE registration_id = ?").bind(challengeId, now(), registrationId).run();
}

export async function recordGuardianConsent(registrationId: string, guardianEmail: string, challengeId: string) {
  const record = await database().prepare(`SELECT g.id, g.guardian_email AS guardianEmail, g.challenge_id AS challengeId, g.consented_at AS consentedAt, r.waiver_version_id AS waiverVersionId, w.checksum AS waiverChecksum FROM guardian_consents g JOIN registrations r ON r.id = g.registration_id JOIN waiver_versions w ON w.id = r.waiver_version_id WHERE g.registration_id = ?`)
    .bind(registrationId).first<{ id: string; guardianEmail: string; challengeId: string | null; consentedAt: string | null; waiverVersionId: string; waiverChecksum: string }>();
  if (!record || record.guardianEmail !== guardianEmail || record.challengeId !== challengeId) return false;
  if (record.consentedAt) return true;
  const timestamp = now();
  let user = await database().prepare("SELECT id FROM users WHERE email = ?").bind(guardianEmail).first<{ id: string }>();
  if (!user) {
    user = { id: id("user") };
    await database().prepare("INSERT INTO users (id, email, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, guardianEmail, timestamp, timestamp, timestamp).run();
  }
  await database().batch([
    database().prepare("UPDATE guardian_consents SET consented_at = ?, updated_at = ? WHERE id = ? AND consented_at IS NULL").bind(timestamp, timestamp, record.id),
    database().prepare("UPDATE registrations SET status = 'submitted', updated_at = ? WHERE id = ? AND status = 'awaiting_guardian_consent'").bind(timestamp, registrationId),
    database().prepare("INSERT INTO consent_records (id, registration_id, waiver_version_id, user_id, actor_type, waiver_checksum, accepted_at) VALUES (?, ?, ?, ?, 'guardian', ?, ?)").bind(id("consent"), registrationId, record.waiverVersionId, user.id, record.waiverChecksum, timestamp),
    database().prepare("INSERT INTO registration_status_history (id, registration_id, from_status, to_status, actor_type, actor_reference, reason, created_at) VALUES (?, ?, 'awaiting_guardian_consent', 'submitted', 'guardian', ?, 'guardian consent verified', ?)").bind(id("status"), registrationId, guardianEmail, timestamp),
  ]);
  return true;
}

export async function listAthleteRegistrations(userId: string) {
  const result = await database().prepare(`SELECT r.id, r.status, r.entry_type AS entryType, r.registration_reference AS registrationReference, r.team_id AS teamId, t.name AS teamName, r.created_at AS createdAt, e.name AS eventName, e.slug AS eventSlug, e.starts_at AS eventStartsAt, e.venue_name AS venueName, race.name AS raceName, c.name AS categoryName, w.name AS waveName FROM registrations r JOIN athlete_profiles p ON p.id = r.athlete_profile_id JOIN events e ON e.id = r.event_id JOIN races race ON race.id = r.race_id LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN waves w ON w.id = r.wave_id LEFT JOIN teams t ON t.id = r.team_id WHERE p.user_id = ? ORDER BY e.starts_at DESC`)
    .bind(userId).all<{ id: string; status: string; entryType: EntryType; registrationReference: string; teamId: string | null; teamName: string | null; createdAt: string; eventName: string; eventSlug: string; eventStartsAt: string; venueName: string; raceName: string; categoryName: string | null; waveName: string | null }>();
  return result.results;
}

export async function getAthleteRegistration(userId: string, registrationId: string) {
  return database().prepare(`SELECT r.id, r.status, r.entry_type AS entryType, r.registration_reference AS registrationReference, r.team_id AS teamId, t.name AS teamName, r.created_at AS createdAt, e.name AS eventName, e.slug AS eventSlug, e.starts_at AS eventStartsAt, e.venue_name AS venueName, race.name AS raceName, c.name AS categoryName, w.name AS waveName, g.guardian_email AS guardianEmail, g.consented_at AS guardianConsentedAt FROM registrations r JOIN athlete_profiles p ON p.id = r.athlete_profile_id JOIN events e ON e.id = r.event_id JOIN races race ON race.id = r.race_id LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN waves w ON w.id = r.wave_id LEFT JOIN guardian_consents g ON g.registration_id = r.id LEFT JOIN teams t ON t.id = r.team_id WHERE p.user_id = ? AND r.id = ?`)
    .bind(userId, registrationId).first<{ id: string; status: string; entryType: EntryType; registrationReference: string; teamId: string | null; teamName: string | null; createdAt: string; eventName: string; eventSlug: string; eventStartsAt: string; venueName: string; raceName: string; categoryName: string | null; waveName: string | null; guardianEmail: string | null; guardianConsentedAt: string | null }>();
}

export async function getGuardianConsentSummary(registrationId: string) {
  return database().prepare(`SELECT g.guardian_name AS guardianName, g.guardian_email AS guardianEmail, g.relationship, g.consented_at AS consentedAt, e.name AS eventName, w.title AS waiverTitle, w.content AS waiverContent FROM guardian_consents g JOIN registrations r ON r.id = g.registration_id JOIN events e ON e.id = r.event_id JOIN waiver_versions w ON w.id = r.waiver_version_id WHERE g.registration_id = ?`)
    .bind(registrationId).first<{ guardianName: string; guardianEmail: string; relationship: string; consentedAt: string | null; eventName: string; waiverTitle: string; waiverContent: string }>();
}
