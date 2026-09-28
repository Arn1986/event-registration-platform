import { env } from "cloudflare:workers";
import type { OrganizerRole } from "../../domain/auth/rbac";

export const ORGANIZATION_ID = "org_3fstriders";
const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const nullableNumber = (value: number | undefined) => value ?? null;

export type EventRecord = {
  id: string; slug: string; name: string; summary: string; status: "draft" | "published" | "closed" | "cancelled" | "completed";
  visibility: "public" | "private"; startsAt: string; timezone: string; venueName: string; capacity: number | null; raceCount?: number;
};
export type RaceRecord = { id: string; eventId: string; name: string; discipline: string; distanceValue: number; distanceUnit: "m" | "km"; startsAt: string; capacity: number | null };
export type CategoryRecord = { id: string; eventId: string; raceId: string; name: string; description: string; capacity: number | null };
export type WaveRecord = { id: string; eventId: string; raceId: string; name: string; startsAt: string; capacity: number | null };

async function audit(action: string, targetType: string, targetId: string, actorEmail: string, metadata: Record<string, unknown> = {}) {
  await database().prepare("INSERT INTO audit_logs (id, organization_id, actor_user_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)")
    .bind(id("audit"), ORGANIZATION_ID, action, targetType, targetId, JSON.stringify({ actorEmail, ...metadata }), now()).run();
}

export async function listEvents() {
  const result = await database().prepare(`SELECT e.id, e.slug, e.name, e.summary, e.status, e.visibility, e.starts_at AS startsAt, e.timezone, e.venue_name AS venueName, e.capacity, COUNT(r.id) AS raceCount FROM events e LEFT JOIN races r ON r.event_id = e.id WHERE e.organization_id = ? GROUP BY e.id ORDER BY e.starts_at DESC`).bind(ORGANIZATION_ID).all<EventRecord>();
  return result.results;
}

export async function listPublishedEvents() {
  const result = await database().prepare(`SELECT id, slug, name, summary, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE organization_id = ? AND status = 'published' AND visibility = 'public' ORDER BY starts_at`).bind(ORGANIZATION_ID).all<EventRecord>();
  return result.results;
}

export async function getPublishedEventBySlug(slug: string) {
  const event = await database().prepare(`SELECT id, slug, name, summary, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE organization_id = ? AND slug = ? AND status = 'published'`).bind(ORGANIZATION_ID, slug).first<EventRecord>();
  if (!event) return null;
  const races = await database().prepare(`SELECT id, event_id AS eventId, name, discipline, distance_value AS distanceValue, distance_unit AS distanceUnit, starts_at AS startsAt, capacity FROM races WHERE event_id = ? ORDER BY starts_at`).bind(event.id).all<RaceRecord>();
  return { event, races: races.results };
}

export async function validatePrivateEventAccess(eventId: string, rawToken: string | null) {
  if (!rawToken) return false;
  const tokenHash = await sha256(rawToken);
  const access = await database().prepare(`SELECT id FROM event_access_tokens WHERE event_id = ? AND token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).bind(eventId, tokenHash, now()).first<{ id: string }>();
  return Boolean(access);
}

export async function getEvent(eventId: string) {
  const event = await database().prepare(`SELECT id, slug, name, summary, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE id = ? AND organization_id = ?`).bind(eventId, ORGANIZATION_ID).first<EventRecord>();
  if (!event) return null;
  const [races, categories, waves] = await Promise.all([
    database().prepare(`SELECT id, event_id AS eventId, name, discipline, distance_value AS distanceValue, distance_unit AS distanceUnit, starts_at AS startsAt, capacity FROM races WHERE event_id = ? ORDER BY starts_at`).bind(eventId).all<RaceRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, description, capacity FROM categories WHERE event_id = ? ORDER BY sort_order, name`).bind(eventId).all<CategoryRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, starts_at AS startsAt, capacity FROM waves WHERE event_id = ? ORDER BY sort_order, starts_at`).bind(eventId).all<WaveRecord>(),
  ]);
  return { event, races: races.results, categories: categories.results, waves: waves.results };
}

export async function createEvent(input: { name: string; slug: string; summary: string; startsAt: string; venueName: string; visibility: "public" | "private"; capacity?: number }, actorEmail: string) {
  const eventId = id("event"); const timestamp = now();
  await database().batch([
    database().prepare(`INSERT INTO events (id, organization_id, slug, name, summary, status, visibility, starts_at, timezone, venue_name, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'Asia/Dubai', ?, ?, ?, ?)`).bind(eventId, ORGANIZATION_ID, input.slug, input.name, input.summary, input.visibility, input.startsAt, input.venueName, nullableNumber(input.capacity), timestamp, timestamp),
    database().prepare(`INSERT INTO capacity_counters (id, event_id, scope_type, scope_id, "limit", confirmed, updated_at) VALUES (?, ?, 'event', ?, ?, 0, ?)`).bind(id("capacity"), eventId, eventId, nullableNumber(input.capacity), timestamp),
  ]);
  await audit("event.created", "event", eventId, actorEmail);
  return eventId;
}

export async function updateEvent(eventId: string, input: { name: string; slug: string; summary: string; startsAt: string; venueName: string; visibility: "public" | "private"; capacity?: number }, actorEmail: string) {
  const timestamp = now();
  await database().batch([
    database().prepare(`UPDATE events SET slug = ?, name = ?, summary = ?, visibility = ?, starts_at = ?, venue_name = ?, capacity = ?, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(input.slug, input.name, input.summary, input.visibility, input.startsAt, input.venueName, nullableNumber(input.capacity), timestamp, eventId, ORGANIZATION_ID),
    database().prepare(`UPDATE capacity_counters SET "limit" = ?, updated_at = ? WHERE scope_type = 'event' AND scope_id = ?`).bind(nullableNumber(input.capacity), timestamp, eventId),
  ]);
  await audit("event.updated", "event", eventId, actorEmail);
}

export async function setEventStatus(eventId: string, status: EventRecord["status"], actorEmail: string) {
  await database().prepare(`UPDATE events SET status = ?, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(status, now(), eventId, ORGANIZATION_ID).run();
  await audit(`event.${status}`, "event", eventId, actorEmail);
}

export async function addRace(eventId: string, input: { name: string; discipline: string; distanceValue: number; distanceUnit: "m" | "km"; startsAt: string; capacity?: number }, actorEmail: string) {
  const raceId = id("race"); const timestamp = now();
  await database().batch([
    database().prepare(`INSERT INTO races (id, event_id, name, discipline, distance_value, distance_unit, starts_at, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(raceId, eventId, input.name, input.discipline, input.distanceValue, input.distanceUnit, input.startsAt, nullableNumber(input.capacity), timestamp, timestamp),
    database().prepare(`INSERT INTO capacity_counters (id, event_id, scope_type, scope_id, "limit", confirmed, updated_at) VALUES (?, ?, 'race', ?, ?, 0, ?)`).bind(id("capacity"), eventId, raceId, nullableNumber(input.capacity), timestamp),
  ]);
  await audit("race.created", "race", raceId, actorEmail, { eventId });
}

export async function addCategory(eventId: string, input: { raceId: string; name: string; description: string; capacity?: number }, actorEmail: string) {
  const categoryId = id("category"); const timestamp = now();
  await database().batch([
    database().prepare(`INSERT INTO categories (id, event_id, race_id, name, description, capacity, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(categoryId, eventId, input.raceId, input.name, input.description, nullableNumber(input.capacity), timestamp, timestamp),
    database().prepare(`INSERT INTO capacity_counters (id, event_id, scope_type, scope_id, "limit", confirmed, updated_at) VALUES (?, ?, 'category', ?, ?, 0, ?)`).bind(id("capacity"), eventId, categoryId, nullableNumber(input.capacity), timestamp),
  ]);
  await audit("category.created", "category", categoryId, actorEmail, { eventId, raceId: input.raceId });
}

export async function addWave(eventId: string, input: { raceId: string; name: string; startsAt: string; capacity?: number }, actorEmail: string) {
  const waveId = id("wave"); const timestamp = now();
  await database().batch([
    database().prepare(`INSERT INTO waves (id, event_id, race_id, name, starts_at, capacity, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(waveId, eventId, input.raceId, input.name, input.startsAt, nullableNumber(input.capacity), timestamp, timestamp),
    database().prepare(`INSERT INTO capacity_counters (id, event_id, scope_type, scope_id, "limit", confirmed, updated_at) VALUES (?, ?, 'wave', ?, ?, 0, ?)`).bind(id("capacity"), eventId, waveId, nullableNumber(input.capacity), timestamp),
  ]);
  await audit("wave.created", "wave", waveId, actorEmail, { eventId, raceId: input.raceId });
}

export async function rotatePrivateLink(eventId: string, actorEmail: string) {
  const rawToken = bytesToToken(crypto.getRandomValues(new Uint8Array(24)));
  const tokenHash = await sha256(rawToken); const timestamp = now();
  await database().batch([
    database().prepare(`UPDATE event_access_tokens SET revoked_at = ? WHERE event_id = ? AND revoked_at IS NULL`).bind(timestamp, eventId),
    database().prepare(`INSERT INTO event_access_tokens (id, event_id, token_hash, label, created_at) VALUES (?, ?, ?, 'Primary private link', ?)`).bind(id("access"), eventId, tokenHash, timestamp),
  ]);
  await audit("event.private_link_rotated", "event", eventId, actorEmail);
  return rawToken;
}

function bytesToToken(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string) { return bytesToToken(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export async function listStaff() {
  const result = await database().prepare(`SELECT m.id, u.email, m.role, m.status, m.created_at AS createdAt FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? ORDER BY u.email`).bind(ORGANIZATION_ID).all<{ id: string; email: string; role: OrganizerRole; status: string; createdAt: string }>();
  return result.results;
}

export async function inviteStaff(email: string, role: OrganizerRole, actorEmail: string) {
  const normalizedEmail = email.trim().toLowerCase(); const timestamp = now();
  let user = await database().prepare(`SELECT id FROM users WHERE email = ?`).bind(normalizedEmail).first<{ id: string }>();
  if (!user) {
    user = { id: id("user") };
    await database().prepare(`INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)`).bind(user.id, normalizedEmail, timestamp, timestamp).run();
  }
  await database().prepare(`INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'invited', ?, ?) ON CONFLICT (organization_id, user_id) DO UPDATE SET role = excluded.role, status = 'invited', updated_at = excluded.updated_at`).bind(id("membership"), ORGANIZATION_ID, user.id, role, timestamp, timestamp).run();
  await audit("staff.invited", "user", user.id, actorEmail, { email: normalizedEmail, role });
}
