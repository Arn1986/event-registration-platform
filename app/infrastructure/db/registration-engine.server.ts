import { env } from "cloudflare:workers";

import { capacityScopes, type RegistrationStatus } from "../../domain/registration/registration-lifecycle";
import { enqueueRegistrationDelivery } from "../communications/delivery-queue.server";

const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

type EngineRegistration = {
  id: string; eventId: string; raceId: string; categoryId: string | null; waveId: string | null;
  teamId: string | null; status: RegistrationStatus; confirmedAt: string | null;
};

async function loadRegistration(registrationId: string) {
  return database().prepare("SELECT id, event_id AS eventId, race_id AS raceId, category_id AS categoryId, wave_id AS waveId, team_id AS teamId, status, confirmed_at AS confirmedAt FROM registrations WHERE id = ?")
    .bind(registrationId).first<EngineRegistration>();
}

function historyStatement(registrationId: string, from: RegistrationStatus, to: RegistrationStatus, actorType: "system" | "athlete" | "organizer" | "guardian", actorReference: string | null, reason: string | null, timestamp: string) {
  return database().prepare("INSERT INTO registration_status_history (id, registration_id, from_status, to_status, actor_type, actor_reference, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id("status"), registrationId, from, to, actorType, actorReference, reason, timestamp);
}

export async function finalizeRegistration(registrationId: string, actorType: "system" | "organizer" | "guardian" = "system", actorReference: string | null = null) {
  const registration = await loadRegistration(registrationId);
  if (!registration) throw new Error("Registration not found");
  if (registration.status === "confirmed") return { status: "confirmed" as const, changed: false };
  if (registration.status !== "submitted" && registration.status !== "waitlisted") return { status: registration.status, changed: false };
  const timestamp = now();
  const scopes = capacityScopes(registration);
  try {
    await database().batch([
      ...scopes.map((scope) => database().prepare("INSERT INTO capacity_reservations (id, registration_id, event_id, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id("reservation"), registration.id, registration.eventId, scope.type, scope.id, timestamp)),
      database().prepare("UPDATE registrations SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), processed_at = ?, updated_at = ? WHERE id = ? AND status IN ('submitted','waitlisted')")
        .bind(timestamp, timestamp, timestamp, registration.id),
      historyStatement(registration.id, registration.status, "confirmed", actorType, actorReference, registration.status === "waitlisted" ? "waitlist promotion" : "capacity available", timestamp),
    ]);
    await refreshTeamStatusForRegistration(registration.id);
    await safelyDeliver(() => enqueueRegistrationDelivery({ type: "confirmed", registrationId: registration.id }));
    return { status: "confirmed" as const, changed: true };
  } catch (error) {
    const message = String(error);
    if (message.includes("invalid_registration_state") || message.includes("UNIQUE constraint failed: capacity_reservations")) {
      const current = await loadRegistration(registration.id);
      if (!current) throw new Error("Registration not found");
      return { status: current.status, changed: false };
    }
    if (!message.includes("capacity_full")) throw error;
    if (registration.status !== "waitlisted") {
      await database().batch([
        database().prepare("UPDATE registrations SET status = 'waitlisted', processed_at = ?, updated_at = ? WHERE id = ? AND status = 'submitted'").bind(timestamp, timestamp, registration.id),
        historyStatement(registration.id, registration.status, "waitlisted", actorType, actorReference, "one or more capacity levels are full", timestamp),
      ]);
      await safelyDeliver(() => enqueueRegistrationDelivery({ type: "waitlisted", registrationId: registration.id }));
    }
    return { status: "waitlisted" as const, changed: registration.status !== "waitlisted" };
  }
}

export async function cancelRegistration(registrationId: string, actorType: "athlete" | "organizer", actorReference: string, reason = "cancelled") {
  const registration = await loadRegistration(registrationId);
  if (!registration) throw new Error("Registration not found");
  if (registration.status === "cancelled") return { changed: false };
  if (registration.status === "completed") throw new Error("Completed registrations cannot be cancelled.");
  const timestamp = now();
  await database().batch([
    database().prepare("DELETE FROM capacity_reservations WHERE registration_id = ?").bind(registration.id),
    database().prepare("DELETE FROM team_members WHERE registration_id = ?").bind(registration.id),
    database().prepare("UPDATE registrations SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, registration.id),
    historyStatement(registration.id, registration.status, "cancelled", actorType, actorReference, reason, timestamp),
  ]);
  if (registration.teamId) await reassignTeamCaptain(registration.teamId, registration.id);
  await promoteWaitlist(registration.eventId);
  await safelyDeliver(() => enqueueRegistrationDelivery({ type: "cancelled", registrationId: registration.id }));
  return { changed: true };
}

async function reassignTeamCaptain(teamId: string, cancelledRegistrationId: string) {
  const team = await database().prepare("SELECT captain_registration_id AS captainRegistrationId FROM teams WHERE id = ?").bind(teamId).first<{ captainRegistrationId: string | null }>();
  if (!team || team.captainRegistrationId !== cancelledRegistrationId) return;
  const replacement = await database().prepare("SELECT registration_id AS registrationId FROM team_members WHERE team_id = ? ORDER BY joined_at LIMIT 1").bind(teamId).first<{ registrationId: string }>();
  await database().batch([
    database().prepare("UPDATE teams SET captain_registration_id = ?, updated_at = ? WHERE id = ?").bind(replacement?.registrationId ?? null, now(), teamId),
    ...(replacement ? [database().prepare("UPDATE team_members SET role = 'captain' WHERE team_id = ? AND registration_id = ?").bind(teamId, replacement.registrationId)] : []),
  ]);
}

export async function moveToWaitlist(registrationId: string, actorReference: string, reason = "organizer moved to waitlist") {
  const registration = await loadRegistration(registrationId);
  if (!registration) throw new Error("Registration not found");
  if (registration.status === "waitlisted") return;
  if (!(["confirmed", "submitted"] as RegistrationStatus[]).includes(registration.status)) throw new Error("This registration cannot be waitlisted.");
  const timestamp = now();
  await database().batch([
    database().prepare("DELETE FROM capacity_reservations WHERE registration_id = ?").bind(registration.id),
    database().prepare("UPDATE registrations SET status = 'waitlisted', updated_at = ? WHERE id = ?").bind(timestamp, registration.id),
    historyStatement(registration.id, registration.status, "waitlisted", "organizer", actorReference, reason, timestamp),
  ]);
  await promoteWaitlist(registration.eventId, registration.id);
  await safelyDeliver(() => enqueueRegistrationDelivery({ type: "waitlisted", registrationId: registration.id }));
}

export async function promoteWaitlist(eventId: string, excludeRegistrationId?: string) {
  const waitlisted = await database().prepare("SELECT id FROM registrations WHERE event_id = ? AND status = 'waitlisted' AND id <> ? ORDER BY submitted_at, created_at LIMIT 100")
    .bind(eventId, excludeRegistrationId ?? "").all<{ id: string }>();
  let promoted = 0;
  for (const candidate of waitlisted.results) {
    const result = await finalizeRegistration(candidate.id, "system", null);
    if (result.status === "confirmed" && result.changed) promoted += 1;
  }
  return promoted;
}

async function refreshTeamStatusForRegistration(registrationId: string) {
  const team = await database().prepare("SELECT team_id AS teamId FROM registrations WHERE id = ? AND team_id IS NOT NULL").bind(registrationId).first<{ teamId: string }>();
  if (!team) return;
  const counts = await database().prepare("SELECT t.min_size AS minSize, COUNT(CASE WHEN r.status IN ('confirmed','waitlisted','submitted','awaiting_guardian_consent') THEN 1 END) AS members FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id LEFT JOIN registrations r ON r.id = tm.registration_id WHERE t.id = ? GROUP BY t.id")
    .bind(team.teamId).first<{ minSize: number; members: number }>();
  if (!counts) return;
  await database().prepare("UPDATE teams SET status = ?, updated_at = ? WHERE id = ? AND status <> 'cancelled'")
    .bind(counts.members >= counts.minSize ? "ready" : "forming", now(), team.teamId).run();
}

async function safelyDeliver(operation: () => Promise<void>) {
  try { await operation(); }
  catch (error) { console.error("Registration delivery side effect failed", error); }
}
