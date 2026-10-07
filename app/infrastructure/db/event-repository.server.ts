import { env } from "cloudflare:workers";
import type { OrganizerRole } from "../../domain/auth/rbac";

export const ORGANIZATION_ID = "org_3fstriders";
const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const nullableNumber = (value: number | undefined) => value ?? null;

export type EventRecord = {
  id: string; slug: string; name: string; summary: string; imageUrl?: string | null; status: "draft" | "published" | "closed" | "cancelled" | "completed";
  visibility: "public" | "private"; startsAt: string; timezone: string; venueName: string; capacity: number | null; raceCount?: number;
};
export type RaceRecord = { id: string; eventId: string; name: string; discipline: string; distanceValue: number; distanceUnit: "m" | "km"; startsAt: string; capacity: number | null; entryModesJson: string; teamMinSize: number; teamMaxSize: number };
export type CategoryRecord = { id: string; eventId: string; raceId: string; name: string; description: string; capacity: number | null };
export type WaveRecord = { id: string; eventId: string; raceId: string; name: string; startsAt: string; capacity: number | null };

export type HeroSlideRecord = {
  id: string;
  organizationId: string;
  imageUrl: string;
  title: string | null;
  caption: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

async function audit(action: string, targetType: string, targetId: string, actorEmail: string, metadata: Record<string, unknown> = {}) {
  await database().prepare("INSERT INTO audit_logs (id, organization_id, actor_user_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)")
    .bind(id("audit"), ORGANIZATION_ID, action, targetType, targetId, JSON.stringify({ actorEmail, ...metadata }), now()).run();
}

export async function listEvents() {
  const result = await database().prepare(`SELECT e.id, e.slug, e.name, e.summary, e.image_url AS imageUrl, e.status, e.visibility, e.starts_at AS startsAt, e.timezone, e.venue_name AS venueName, e.capacity, COUNT(r.id) AS raceCount FROM events e LEFT JOIN races r ON r.event_id = e.id WHERE e.organization_id = ? GROUP BY e.id ORDER BY e.starts_at DESC`).bind(ORGANIZATION_ID).all<EventRecord>();
  return result.results;
}

export async function listPublishedEvents() {
  const result = await database().prepare(`SELECT id, slug, name, summary, image_url AS imageUrl, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE organization_id = ? AND status = 'published' AND visibility = 'public' ORDER BY starts_at`).bind(ORGANIZATION_ID).all<EventRecord>();
  return result.results;
}

export async function getPublishedEventBySlug(slug: string) {
  const event = await database().prepare(`SELECT id, slug, name, summary, image_url AS imageUrl, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE organization_id = ? AND slug = ? AND status = 'published'`).bind(ORGANIZATION_ID, slug).first<EventRecord>();
  if (!event) return null;
  const [races, categories, waves] = await Promise.all([
    database().prepare(`SELECT id, event_id AS eventId, name, discipline, distance_value AS distanceValue, distance_unit AS distanceUnit, starts_at AS startsAt, capacity, entry_modes_json AS entryModesJson, team_min_size AS teamMinSize, team_max_size AS teamMaxSize FROM races WHERE event_id = ? ORDER BY starts_at`).bind(event.id).all<RaceRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, description, capacity FROM categories WHERE event_id = ? ORDER BY sort_order, name`).bind(event.id).all<CategoryRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, starts_at AS startsAt, capacity FROM waves WHERE event_id = ? ORDER BY sort_order, starts_at`).bind(event.id).all<WaveRecord>(),
  ]);
  return { event, races: races.results, categories: categories.results, waves: waves.results };
}

export async function validatePrivateEventAccess(eventId: string, rawToken: string | null) {
  if (!rawToken) return false;
  const tokenHash = await sha256(rawToken);
  const access = await database().prepare(`SELECT id FROM event_access_tokens WHERE event_id = ? AND token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).bind(eventId, tokenHash, now()).first<{ id: string }>();
  return Boolean(access);
}

export async function getEvent(eventId: string) {
  const event = await database().prepare(`SELECT id, slug, name, summary, image_url AS imageUrl, status, visibility, starts_at AS startsAt, timezone, venue_name AS venueName, capacity FROM events WHERE id = ? AND organization_id = ?`).bind(eventId, ORGANIZATION_ID).first<EventRecord>();
  if (!event) return null;
  const [races, categories, waves] = await Promise.all([
    database().prepare(`SELECT id, event_id AS eventId, name, discipline, distance_value AS distanceValue, distance_unit AS distanceUnit, starts_at AS startsAt, capacity, entry_modes_json AS entryModesJson, team_min_size AS teamMinSize, team_max_size AS teamMaxSize FROM races WHERE event_id = ? ORDER BY starts_at`).bind(eventId).all<RaceRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, description, capacity FROM categories WHERE event_id = ? ORDER BY sort_order, name`).bind(eventId).all<CategoryRecord>(),
    database().prepare(`SELECT id, event_id AS eventId, race_id AS raceId, name, starts_at AS startsAt, capacity FROM waves WHERE event_id = ? ORDER BY sort_order, starts_at`).bind(eventId).all<WaveRecord>(),
  ]);
  return { event, races: races.results, categories: categories.results, waves: waves.results };
}

export async function createEvent(input: { name: string; slug: string; summary: string; imageUrl?: string; startsAt: string; venueName: string; visibility: "public" | "private"; capacity?: number }, actorEmail: string) {
  const eventId = id("event"); const timestamp = now();
  await database().batch([
    database().prepare(`INSERT INTO events (id, organization_id, slug, name, summary, image_url, status, visibility, starts_at, timezone, venue_name, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 'Asia/Dubai', ?, ?, ?, ?)`).bind(eventId, ORGANIZATION_ID, input.slug, input.name, input.summary, input.imageUrl ?? null, input.visibility, input.startsAt, input.venueName, nullableNumber(input.capacity), timestamp, timestamp),
    database().prepare(`INSERT INTO capacity_counters (id, event_id, scope_type, scope_id, "limit", confirmed, updated_at) VALUES (?, ?, 'event', ?, ?, 0, ?)`).bind(id("capacity"), eventId, eventId, nullableNumber(input.capacity), timestamp),
  ]);
  await audit("event.created", "event", eventId, actorEmail);
  return eventId;
}

export async function updateEvent(eventId: string, input: { name: string; slug: string; summary: string; imageUrl?: string; startsAt: string; venueName: string; visibility: "public" | "private"; capacity?: number }, actorEmail: string) {
  const timestamp = now();
  await database().batch([
    database().prepare(`UPDATE events SET slug = ?, name = ?, summary = ?, image_url = ?, visibility = ?, starts_at = ?, venue_name = ?, capacity = ?, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(input.slug, input.name, input.summary, input.imageUrl ?? null, input.visibility, input.startsAt, input.venueName, nullableNumber(input.capacity), timestamp, eventId, ORGANIZATION_ID),
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

export async function updateRaceEntrySettings(raceId: string, entryModes: Array<"individual" | "team" | "relay">, teamMinSize: number, teamMaxSize: number, actorEmail: string) {
  const race = await database().prepare("SELECT event_id AS eventId FROM races WHERE id = ?").bind(raceId).first<{ eventId: string }>();
  if (!race) throw new Error("Race not found");
  await database().prepare("UPDATE races SET entry_modes_json = ?, team_min_size = ?, team_max_size = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(entryModes), teamMinSize, teamMaxSize, now(), raceId).run();
  await audit("race.entry_settings_updated", "race", raceId, actorEmail, { eventId: race.eventId, entryModes, teamMinSize, teamMaxSize });
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

export async function listActiveHeroSlides(): Promise<HeroSlideRecord[]> {
  const result = await database().prepare(
    `SELECT id, organization_id AS organizationId, image_url AS imageUrl, title, caption, sort_order AS sortOrder, (is_active = 1) AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM hero_slides WHERE organization_id = ? AND is_active = 1 ORDER BY sort_order ASC, created_at ASC LIMIT 5`
  ).bind(ORGANIZATION_ID).all<HeroSlideRecord>();
  return result.results;
}

export async function listAllHeroSlides(): Promise<HeroSlideRecord[]> {
  const result = await database().prepare(
    `SELECT id, organization_id AS organizationId, image_url AS imageUrl, title, caption, sort_order AS sortOrder, (is_active = 1) AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM hero_slides WHERE organization_id = ? ORDER BY sort_order ASC, created_at ASC`
  ).bind(ORGANIZATION_ID).all<HeroSlideRecord>();
  return result.results;
}

export async function createHeroSlide(
  input: { imageUrl: string; title?: string; caption?: string; isActive?: boolean },
  actorEmail: string
) {
  const countResult = await database().prepare(
    `SELECT COUNT(id) AS total FROM hero_slides WHERE organization_id = ?`
  ).bind(ORGANIZATION_ID).first<{ total: number }>();
  if ((countResult?.total ?? 0) >= 5) {
    throw new Error("Maximum of 5 hero carousel images allowed. Remove an image to add a new one.");
  }

  const slideId = id("slide");
  const timestamp = now();
  const sortOrder = countResult?.total ?? 0;
  const activeVal = input.isActive !== false ? 1 : 0;

  await database().prepare(
    `INSERT INTO hero_slides (id, organization_id, image_url, title, caption, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slideId,
    ORGANIZATION_ID,
    input.imageUrl,
    input.title ?? null,
    input.caption ?? null,
    sortOrder,
    activeVal,
    timestamp,
    timestamp
  ).run();

  await audit("hero_slide.created", "hero_slide", slideId, actorEmail, { title: input.title });
  return slideId;
}

export async function updateHeroSlide(
  slideId: string,
  input: { imageUrl?: string; title?: string; caption?: string; isActive?: boolean },
  actorEmail: string
) {
  const existing = await database().prepare(
    `SELECT id, image_url AS imageUrl, title, caption, is_active AS isActive FROM hero_slides WHERE id = ? AND organization_id = ?`
  ).bind(slideId, ORGANIZATION_ID).first<HeroSlideRecord>();
  if (!existing) throw new Error("Hero slide not found.");

  const newImageUrl = input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl;
  const newTitle = input.title !== undefined ? (input.title || null) : existing.title;
  const newCaption = input.caption !== undefined ? (input.caption || null) : existing.caption;
  const newActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);

  await database().prepare(
    `UPDATE hero_slides SET image_url = ?, title = ?, caption = ?, is_active = ?, updated_at = ? WHERE id = ? AND organization_id = ?`
  ).bind(newImageUrl, newTitle, newCaption, newActive, now(), slideId, ORGANIZATION_ID).run();

  await audit("hero_slide.updated", "hero_slide", slideId, actorEmail);
}

export async function deleteHeroSlide(slideId: string, actorEmail: string) {
  await database().prepare(
    `DELETE FROM hero_slides WHERE id = ? AND organization_id = ?`
  ).bind(slideId, ORGANIZATION_ID).run();
  await audit("hero_slide.deleted", "hero_slide", slideId, actorEmail);
}

export async function reorderHeroSlides(orderedIds: string[], actorEmail: string) {
  const statements = orderedIds.slice(0, 5).map((slideId, index) =>
    database().prepare(
      `UPDATE hero_slides SET sort_order = ?, updated_at = ? WHERE id = ? AND organization_id = ?`
    ).bind(index, now(), slideId, ORGANIZATION_ID)
  );
  if (statements.length > 0) {
    await database().batch(statements);
  }
  await audit("hero_slides.reordered", "hero_slides", "carousel", actorEmail, { orderedIds });
}

export async function resetDefaultHeroSlides(actorEmail: string) {
  const defaultSlides = [
    { id: id("slide"), image: "/images/hero/slide1_running_dawn.jpg", title: "Dawn Striders", caption: "Community road & marathon training across the UAE" },
    { id: id("slide"), image: "/images/hero/slide2_triathlon_bike.jpg", title: "Speed on the Open Road", caption: "Time-trial and cycling packs conquering distance" },
    { id: id("slide"), image: "/images/hero/slide3_open_water.jpg", title: "Open Water Excellence", caption: "Triathlon swim legs in sparkling Arabian Gulf waters" },
    { id: id("slide"), image: "/images/hero/slide4_stadium_track.jpg", title: "Track Speed & Intervals", caption: "Precision interval training under evening floodlights" },
    { id: id("slide"), image: "/images/hero/slide5_finish_line.jpg", title: "Celebrate Every Finish", caption: "Every athlete and distance celebrated as one team" },
  ];

  const batch = [
    database().prepare(`DELETE FROM hero_slides WHERE organization_id = ?`).bind(ORGANIZATION_ID),
    ...defaultSlides.map((slide, index) =>
      database().prepare(
        `INSERT INTO hero_slides (id, organization_id, image_url, title, caption, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(slide.id, ORGANIZATION_ID, slide.image, slide.title, slide.caption, index, now(), now())
    ),
  ];
  await database().batch(batch);
  await audit("hero_slides.reset_defaults", "hero_slides", "carousel", actorEmail);
}

