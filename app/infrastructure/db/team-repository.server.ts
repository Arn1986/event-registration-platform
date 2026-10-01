import { env } from "cloudflare:workers";

import { sendTeamInviteEmail } from "../email/email-provider.server";
import { randomToken, sha256 } from "../security/crypto.server";

const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export type TeamRecord = {
  id: string; eventId: string; raceId: string; categoryId: string | null; waveId: string | null; name: string; entryType: "team" | "relay";
  status: "forming" | "ready" | "cancelled"; captainRegistrationId: string | null; joinCodeHint: string; minSize: number; maxSize: number;
  eventName: string; eventSlug: string; raceName: string; memberCount: number;
};

function generateJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createTeam(input: { eventId: string; raceId: string; categoryId?: string; waveId?: string; name: string; entryType: "team" | "relay"; organizerCreated: boolean }) {
  const race = await database().prepare(`SELECT event_id AS eventId, entry_modes_json AS entryModesJson, team_min_size AS teamMinSize, team_max_size AS teamMaxSize,
    CASE WHEN ? IS NULL THEN 1 ELSE EXISTS(SELECT 1 FROM categories WHERE id = ? AND race_id = races.id) END AS categoryValid,
    CASE WHEN ? IS NULL THEN 1 ELSE EXISTS(SELECT 1 FROM waves WHERE id = ? AND race_id = races.id) END AS waveValid
    FROM races WHERE id = ? AND event_id = ?`)
    .bind(input.categoryId ?? null, input.categoryId ?? null, input.waveId ?? null, input.waveId ?? null, input.raceId, input.eventId)
    .first<{ eventId: string; entryModesJson: string; teamMinSize: number; teamMaxSize: number; categoryValid: number; waveValid: number }>();
  if (!race || !race.categoryValid || !race.waveValid || !(JSON.parse(race.entryModesJson) as string[]).includes(input.entryType)) throw new Error("This race does not allow the selected team entry.");
  const rawCode = generateJoinCode(); const timestamp = now(); const teamId = id("team");
  await database().prepare("INSERT INTO teams (id, event_id, race_id, category_id, wave_id, name, entry_type, status, captain_registration_id, join_code_hash, join_code_hint, min_size, max_size, organizer_created, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'forming', NULL, ?, ?, ?, ?, ?, ?, ?)")
    .bind(teamId, input.eventId, input.raceId, input.categoryId ?? null, input.waveId ?? null, input.name.trim(), input.entryType, await sha256(rawCode), rawCode.slice(-4), race.teamMinSize, race.teamMaxSize, input.organizerCreated ? 1 : 0, timestamp, timestamp).run();
  return { teamId, joinCode: rawCode };
}

async function teamById(teamId: string) {
  return database().prepare(`SELECT t.id, t.event_id AS eventId, t.race_id AS raceId, t.category_id AS categoryId, t.wave_id AS waveId, t.name, t.entry_type AS entryType, t.status, t.captain_registration_id AS captainRegistrationId, t.join_code_hint AS joinCodeHint, t.min_size AS minSize, t.max_size AS maxSize, e.name AS eventName, e.slug AS eventSlug, r.name AS raceName, COUNT(tm.id) AS memberCount FROM teams t JOIN events e ON e.id = t.event_id JOIN races r ON r.id = t.race_id LEFT JOIN team_members tm ON tm.team_id = t.id WHERE t.id = ? GROUP BY t.id`)
    .bind(teamId).first<TeamRecord>();
}

export async function resolveJoinCode(rawCode: string) {
  const hash = await sha256(rawCode.trim().toUpperCase());
  const team = await database().prepare("SELECT id FROM teams WHERE join_code_hash = ? AND status <> 'cancelled'").bind(hash).first<{ id: string }>();
  if (!team) return null;
  const record = await teamById(team.id);
  return record && record.memberCount < record.maxSize ? record : null;
}

export async function resolveInvitation(rawToken: string) {
  const invitation = await database().prepare(`SELECT i.id AS invitationId, i.email, i.relay_leg AS relayLeg, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt, i.revoked_at AS revokedAt, t.id AS teamId FROM team_invitations i JOIN teams t ON t.id = i.team_id WHERE i.token_hash = ? AND t.status <> 'cancelled'`)
    .bind(await sha256(rawToken)).first<{ invitationId: string; email: string; relayLeg: string | null; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; teamId: string }>();
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now()) return null;
  const team = await teamById(invitation.teamId);
  return team && team.memberCount < team.maxSize ? { ...invitation, team } : null;
}

export async function markInvitationAccepted(invitationId: string) {
  await database().prepare("UPDATE team_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").bind(now(), invitationId).run();
}

export async function setTeamCaptain(teamId: string, registrationId: string) {
  await database().prepare("UPDATE teams SET captain_registration_id = ?, updated_at = ? WHERE id = ? AND captain_registration_id IS NULL")
    .bind(registrationId, now(), teamId).run();
}

export async function deleteEmptyTeam(teamId: string) {
  await database().prepare("DELETE FROM teams WHERE id = ? AND NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = ?)").bind(teamId, teamId).run();
}

export async function rotateTeamJoinCode(teamId: string, expectedEventId?: string) {
  if (expectedEventId) {
    const team = await teamById(teamId);
    if (!team || team.eventId !== expectedEventId) throw new Error("Team not found");
  }
  const rawCode = generateJoinCode();
  await database().prepare("UPDATE teams SET join_code_hash = ?, join_code_hint = ?, updated_at = ? WHERE id = ? AND status <> 'cancelled'")
    .bind(await sha256(rawCode), rawCode.slice(-4), now(), teamId).run();
  return rawCode;
}

export async function getTeamForAthlete(teamId: string, userId: string) {
  const team = await database().prepare(`SELECT t.id, t.event_id AS eventId, t.race_id AS raceId, t.name, t.entry_type AS entryType, t.status, t.captain_registration_id AS captainRegistrationId, t.join_code_hint AS joinCodeHint, t.min_size AS minSize, t.max_size AS maxSize, e.name AS eventName, e.slug AS eventSlug, r.name AS raceName, captain.athlete_profile_id = p.id AS isCaptain FROM teams t JOIN events e ON e.id = t.event_id JOIN races r ON r.id = t.race_id JOIN team_members mine ON mine.team_id = t.id JOIN registrations myreg ON myreg.id = mine.registration_id JOIN athlete_profiles p ON p.id = myreg.athlete_profile_id LEFT JOIN registrations captain ON captain.id = t.captain_registration_id WHERE t.id = ? AND p.user_id = ? LIMIT 1`)
    .bind(teamId, userId).first<Omit<TeamRecord, "categoryId" | "waveId" | "memberCount"> & { isCaptain: number }>();
  if (!team) return null;
  const [members, invitations] = await Promise.all([
    database().prepare(`SELECT tm.id, tm.role, tm.relay_leg AS relayLeg, r.id AS registrationId, r.registration_reference AS registrationReference, r.status, p.first_name AS firstName, p.last_name AS lastName, u.email FROM team_members tm JOIN registrations r ON r.id = tm.registration_id JOIN athlete_profiles p ON p.id = r.athlete_profile_id JOIN users u ON u.id = p.user_id WHERE tm.team_id = ? ORDER BY CASE tm.role WHEN 'captain' THEN 0 ELSE 1 END, tm.joined_at`).bind(teamId).all<{ id: string; role: string; relayLeg: string | null; registrationId: string; registrationReference: string; status: string; firstName: string; lastName: string; email: string }>(),
    database().prepare("SELECT id, email, relay_leg AS relayLeg, expires_at AS expiresAt, accepted_at AS acceptedAt, revoked_at AS revokedAt FROM team_invitations WHERE team_id = ? ORDER BY created_at DESC").bind(teamId).all<{ id: string; email: string; relayLeg: string | null; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }>(),
  ]);
  return { ...team, isCaptain: Boolean(team.isCaptain), members: members.results, invitations: invitations.results };
}

export async function createTeamInvitation(teamId: string, email: string, relayLeg: string | undefined, appOrigin: string, expectedEventId?: string) {
  const team = await teamById(teamId);
  if (!team || (expectedEventId && team.eventId !== expectedEventId) || team.status === "cancelled" || team.memberCount >= team.maxSize) throw new Error("This team cannot accept more members.");
  const token = randomToken(24); const invitationId = id("invite"); const timestamp = now(); const normalizedEmail = email.trim().toLowerCase();
  await database().prepare("INSERT INTO team_invitations (id, team_id, email, token_hash, relay_leg, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(invitationId, teamId, normalizedEmail, await sha256(token), relayLeg || null, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), timestamp).run();
  const inviteUrl = `${appOrigin}/teams/invitations/${token}`;
  try {
    await sendTeamInviteEmail(normalizedEmail, team.name, team.eventName, inviteUrl, `team-invite/${invitationId}`);
  } catch (error) {
    await database().prepare("UPDATE team_invitations SET revoked_at = ? WHERE id = ?").bind(now(), invitationId).run();
    throw error;
  }
  return inviteUrl;
}

export async function listOrganizerTeams(eventId: string) {
  const result = await database().prepare(`SELECT t.id, t.name, t.entry_type AS entryType, t.status, t.join_code_hint AS joinCodeHint, t.min_size AS minSize, t.max_size AS maxSize, r.name AS raceName, COUNT(tm.id) AS memberCount FROM teams t JOIN races r ON r.id = t.race_id LEFT JOIN team_members tm ON tm.team_id = t.id WHERE t.event_id = ? GROUP BY t.id ORDER BY t.created_at DESC`)
    .bind(eventId).all<{ id: string; name: string; entryType: string; status: string; joinCodeHint: string; minSize: number; maxSize: number; raceName: string; memberCount: number }>();
  return result.results;
}

export async function addRegistrationToTeamByReference(teamId: string, registrationReference: string, expectedEventId?: string) {
  const team = await teamById(teamId); if (!team) throw new Error("Team not found");
  if (expectedEventId && team.eventId !== expectedEventId) throw new Error("Team not found");
  const registration = await database().prepare("SELECT id, event_id AS eventId, race_id AS raceId, category_id AS categoryId, wave_id AS waveId, team_id AS teamId FROM registrations WHERE registration_reference = ? AND status IN ('awaiting_guardian_consent','submitted','confirmed','waitlisted')")
    .bind(registrationReference.trim().toUpperCase()).first<{ id: string; eventId: string; raceId: string; categoryId: string | null; waveId: string | null; teamId: string | null }>();
  if (!registration || registration.eventId !== team.eventId || registration.raceId !== team.raceId) throw new Error("Registration is not eligible for this team.");
  if (registration.categoryId !== team.categoryId || registration.waveId !== team.waveId) throw new Error("Registration category and wave must match the team.");
  if (registration.teamId) throw new Error("Registration already belongs to a team.");
  const timestamp = now();
  await database().batch([
    database().prepare("UPDATE registrations SET team_id = ?, entry_type = ?, updated_at = ? WHERE id = ? AND team_id IS NULL").bind(teamId, team.entryType, timestamp, registration.id),
    database().prepare("INSERT INTO team_members (id, team_id, registration_id, role, joined_at, created_at) VALUES (?, ?, ?, 'member', ?, ?)").bind(id("member"), teamId, registration.id, timestamp, timestamp),
  ]);
}
