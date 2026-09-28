import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = { createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() };

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  timezone: text("timezone").notNull().default("Asia/Dubai"), ...timestamps,
}, (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), emailVerifiedAt: text("email_verified_at"), ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const organizationMemberships = sqliteTable("organization_memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "admin", "event_manager", "registration_reviewer"] }).notNull(),
  status: text("status", { enum: ["invited", "active", "suspended"] }).notNull().default("invited"),
  ...timestamps,
}, (table) => [
  uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  index("organization_memberships_org_idx").on(table.organizationId),
]);

export const athleteProfiles = sqliteTable("athlete_profiles", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), dateOfBirth: text("date_of_birth").notNull(),
  phone: text("phone"), nationality: text("nationality"), clubName: text("club_name"), ...timestamps,
}, (table) => [uniqueIndex("athlete_profiles_user_unique").on(table.userId)]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  slug: text("slug").notNull(), name: text("name").notNull(), summary: text("summary").notNull().default(""),
  status: text("status", { enum: ["draft", "published", "closed", "cancelled", "completed"] }).notNull().default("draft"),
  visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("public"),
  startsAt: text("starts_at").notNull(), timezone: text("timezone").notNull().default("Asia/Dubai"),
  venueName: text("venue_name").notNull(), capacity: integer("capacity"), ...timestamps,
}, (table) => [uniqueIndex("events_org_slug_unique").on(table.organizationId, table.slug), index("events_status_starts_idx").on(table.status, table.startsAt)]);

export const races = sqliteTable("races", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id), name: text("name").notNull(),
  discipline: text("discipline").notNull(), distanceValue: integer("distance_value").notNull(),
  distanceUnit: text("distance_unit", { enum: ["m", "km"] }).notNull(), startsAt: text("starts_at").notNull(),
  capacity: integer("capacity"), ...timestamps,
}, (table) => [index("races_event_idx").on(table.eventId)]);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  raceId: text("race_id").notNull().references(() => races.id), name: text("name").notNull(),
  description: text("description").notNull().default(""), capacity: integer("capacity"), sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [index("categories_race_idx").on(table.raceId)]);

export const waves = sqliteTable("waves", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  raceId: text("race_id").notNull().references(() => races.id), name: text("name").notNull(),
  startsAt: text("starts_at").notNull(), capacity: integer("capacity"), sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [index("waves_race_idx").on(table.raceId)]);

export const eventAccessTokens = sqliteTable("event_access_tokens", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  tokenHash: text("token_hash").notNull(), label: text("label").notNull().default("Primary private link"),
  expiresAt: text("expires_at"), revokedAt: text("revoked_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("event_access_tokens_event_idx").on(table.eventId)]);

export const capacityCounters = sqliteTable("capacity_counters", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  scopeType: text("scope_type", { enum: ["event", "race", "category", "wave"] }).notNull(),
  scopeId: text("scope_id").notNull(), limit: integer("limit"), confirmed: integer("confirmed").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("capacity_counters_scope_unique").on(table.scopeType, table.scopeId), index("capacity_counters_event_idx").on(table.eventId)]);

export const registrations = sqliteTable("registrations", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  raceId: text("race_id").notNull().references(() => races.id),
  athleteProfileId: text("athlete_profile_id").notNull().references(() => athleteProfiles.id),
  status: text("status", { enum: ["draft", "awaiting_guardian_consent", "submitted", "confirmed", "waitlisted", "cancelled", "completed"] }).notNull().default("draft"),
  athleteSnapshotJson: text("athlete_snapshot_json").notNull(), submittedAt: text("submitted_at"),
  confirmedAt: text("confirmed_at"), cancelledAt: text("cancelled_at"), ...timestamps,
}, (table) => [index("registrations_event_status_idx").on(table.eventId, table.status), index("registrations_athlete_idx").on(table.athleteProfileId)]);

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(), normalizedEmail: text("normalized_email").notNull(), codeHash: text("code_hash").notNull(),
  purpose: text("purpose", { enum: ["register", "sign_in", "guardian_consent"] }).notNull(), expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"), attemptCount: integer("attempt_count").notNull().default(0), createdAt: text("created_at").notNull(),
}, (table) => [index("auth_challenges_email_idx").on(table.normalizedEmail, table.createdAt)]);

export const walletPasses = sqliteTable("wallet_passes", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  provider: text("provider").notNull().default("walletwallet"), externalSerial: text("external_serial").notNull(),
  shareUrl: text("share_url").notNull(), status: text("status", { enum: ["active", "revoked", "failed"] }).notNull().default("active"),
  lastSyncedAt: text("last_synced_at").notNull(), ...timestamps,
}, (table) => [uniqueIndex("wallet_passes_registration_unique").on(table.registrationId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorUserId: text("actor_user_id"), action: text("action").notNull(), targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(), metadataJson: text("metadata_json").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)]);
