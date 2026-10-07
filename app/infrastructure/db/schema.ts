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
  phone: text("phone"), nationality: text("nationality"), clubName: text("club_name"),
  emergencyContactName: text("emergency_contact_name"), emergencyContactPhone: text("emergency_contact_phone"),
  medicalNotesEncrypted: text("medical_notes_encrypted"), ...timestamps,
}, (table) => [uniqueIndex("athlete_profiles_user_unique").on(table.userId)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(), expiresAt: text("expires_at").notNull(), revokedAt: text("revoked_at"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  slug: text("slug").notNull(), name: text("name").notNull(), summary: text("summary").notNull().default(""),
  imageUrl: text("image_url"),
  status: text("status", { enum: ["draft", "published", "closed", "cancelled", "completed"] }).notNull().default("draft"),
  visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("public"),
  startsAt: text("starts_at").notNull(), timezone: text("timezone").notNull().default("Asia/Dubai"),
  venueName: text("venue_name").notNull(), capacity: integer("capacity"), ...timestamps,
}, (table) => [uniqueIndex("events_org_slug_unique").on(table.organizationId, table.slug), index("events_status_starts_idx").on(table.status, table.startsAt)]);

export const races = sqliteTable("races", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id), name: text("name").notNull(),
  discipline: text("discipline").notNull(), distanceValue: integer("distance_value").notNull(),
  distanceUnit: text("distance_unit", { enum: ["m", "km"] }).notNull(), startsAt: text("starts_at").notNull(),
  capacity: integer("capacity"), entryModesJson: text("entry_modes_json").notNull().default('["individual"]'),
  teamMinSize: integer("team_min_size").notNull().default(2), teamMaxSize: integer("team_max_size").notNull().default(2), ...timestamps,
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

export const formVersions = sqliteTable("form_versions", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  version: integer("version").notNull(), status: text("status", { enum: ["draft", "published", "retired"] }).notNull().default("draft"),
  title: text("title").notNull().default("Registration questions"), publishedAt: text("published_at"), ...timestamps,
}, (table) => [uniqueIndex("form_versions_event_version_unique").on(table.eventId, table.version), index("form_versions_event_status_idx").on(table.eventId, table.status)]);

export const formFields = sqliteTable("form_fields", {
  id: text("id").primaryKey(), formVersionId: text("form_version_id").notNull().references(() => formVersions.id),
  key: text("key").notNull(), label: text("label").notNull(), helpText: text("help_text").notNull().default(""),
  type: text("type", { enum: ["short_text", "long_text", "number", "date", "single_select", "multi_select", "checkbox"] }).notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(false), sensitive: integer("sensitive", { mode: "boolean" }).notNull().default(false),
  optionsJson: text("options_json").notNull().default("[]"), validationJson: text("validation_json").notNull().default("{}"), sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [uniqueIndex("form_fields_version_key_unique").on(table.formVersionId, table.key), index("form_fields_version_sort_idx").on(table.formVersionId, table.sortOrder)]);

export const waiverVersions = sqliteTable("waiver_versions", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  version: integer("version").notNull(), title: text("title").notNull(), content: text("content").notNull(), checksum: text("checksum").notNull(),
  status: text("status", { enum: ["draft", "published", "retired"] }).notNull().default("draft"), publishedAt: text("published_at"), ...timestamps,
}, (table) => [uniqueIndex("waiver_versions_event_version_unique").on(table.eventId, table.version), index("waiver_versions_event_status_idx").on(table.eventId, table.status)]);

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
  categoryId: text("category_id").references(() => categories.id), waveId: text("wave_id").references(() => waves.id),
  formVersionId: text("form_version_id").references(() => formVersions.id), waiverVersionId: text("waiver_version_id").references(() => waiverVersions.id),
  entryType: text("entry_type", { enum: ["individual", "team", "relay"] }).notNull().default("individual"),
  teamId: text("team_id"), registrationReference: text("registration_reference"), idempotencyKey: text("idempotency_key"), processedAt: text("processed_at"),
  bibNumber: text("bib_number"), bibAssignedAt: text("bib_assigned_at"),
  status: text("status", { enum: ["draft", "awaiting_guardian_consent", "submitted", "confirmed", "waitlisted", "cancelled", "completed"] }).notNull().default("draft"),
  athleteSnapshotJson: text("athlete_snapshot_json").notNull(), submittedAt: text("submitted_at"),
  confirmedAt: text("confirmed_at"), cancelledAt: text("cancelled_at"), ...timestamps,
}, (table) => [index("registrations_event_status_idx").on(table.eventId, table.status), index("registrations_athlete_idx").on(table.athleteProfileId), uniqueIndex("registrations_reference_unique").on(table.registrationReference), uniqueIndex("registrations_idempotency_unique").on(table.idempotencyKey), index("registrations_team_idx").on(table.teamId)]);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id), raceId: text("race_id").notNull().references(() => races.id),
  categoryId: text("category_id").references(() => categories.id), waveId: text("wave_id").references(() => waves.id), name: text("name").notNull(),
  entryType: text("entry_type", { enum: ["team", "relay"] }).notNull(), status: text("status", { enum: ["forming", "ready", "cancelled"] }).notNull().default("forming"),
  captainRegistrationId: text("captain_registration_id"), joinCodeHash: text("join_code_hash").notNull(), joinCodeHint: text("join_code_hint").notNull(),
  minSize: integer("min_size").notNull(), maxSize: integer("max_size").notNull(), organizerCreated: integer("organizer_created", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [index("teams_event_idx").on(table.eventId), index("teams_race_idx").on(table.raceId), uniqueIndex("teams_join_code_hash_unique").on(table.joinCodeHash)]);

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(), teamId: text("team_id").notNull().references(() => teams.id), registrationId: text("registration_id").notNull().references(() => registrations.id),
  role: text("role", { enum: ["captain", "member"] }).notNull().default("member"), relayLeg: text("relay_leg"), joinedAt: text("joined_at").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("team_members_registration_unique").on(table.registrationId), uniqueIndex("team_members_team_registration_unique").on(table.teamId, table.registrationId), index("team_members_team_idx").on(table.teamId)]);

export const teamInvitations = sqliteTable("team_invitations", {
  id: text("id").primaryKey(), teamId: text("team_id").notNull().references(() => teams.id), email: text("email").notNull(), tokenHash: text("token_hash").notNull(),
  relayLeg: text("relay_leg"), expiresAt: text("expires_at").notNull(), acceptedAt: text("accepted_at"), revokedAt: text("revoked_at"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("team_invitations_token_hash_unique").on(table.tokenHash), index("team_invitations_team_idx").on(table.teamId)]);

export const capacityReservations = sqliteTable("capacity_reservations", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id), eventId: text("event_id").notNull().references(() => events.id),
  scopeType: text("scope_type", { enum: ["event", "race", "category", "wave"] }).notNull(), scopeId: text("scope_id").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("capacity_reservations_registration_scope_unique").on(table.registrationId, table.scopeType), index("capacity_reservations_scope_idx").on(table.scopeType, table.scopeId)]);

export const registrationStatusHistory = sqliteTable("registration_status_history", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  fromStatus: text("from_status"), toStatus: text("to_status").notNull(), actorType: text("actor_type", { enum: ["system", "athlete", "organizer", "guardian"] }).notNull(),
  actorReference: text("actor_reference"), reason: text("reason"), createdAt: text("created_at").notNull(),
}, (table) => [index("registration_status_history_registration_idx").on(table.registrationId, table.createdAt)]);

export const registrationAnswers = sqliteTable("registration_answers", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  fieldId: text("field_id").notNull().references(() => formFields.id), valueJson: text("value_json"), encryptedValue: text("encrypted_value"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("registration_answers_registration_field_unique").on(table.registrationId, table.fieldId)]);

export const consentRecords = sqliteTable("consent_records", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  waiverVersionId: text("waiver_version_id").notNull().references(() => waiverVersions.id), userId: text("user_id").notNull().references(() => users.id),
  actorType: text("actor_type", { enum: ["athlete", "guardian"] }).notNull(), waiverChecksum: text("waiver_checksum").notNull(), acceptedAt: text("accepted_at").notNull(),
}, (table) => [index("consent_records_registration_idx").on(table.registrationId)]);

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(), normalizedEmail: text("normalized_email").notNull(), codeHash: text("code_hash").notNull(),
  purpose: text("purpose", { enum: ["register", "sign_in", "guardian_consent"] }).notNull(), expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"), attemptCount: integer("attempt_count").notNull().default(0), requestIpHash: text("request_ip_hash"), createdAt: text("created_at").notNull(),
}, (table) => [index("auth_challenges_email_idx").on(table.normalizedEmail, table.createdAt)]);

export const guardianConsents = sqliteTable("guardian_consents", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  guardianName: text("guardian_name").notNull(), guardianEmail: text("guardian_email").notNull(), relationship: text("relationship").notNull(),
  challengeId: text("challenge_id").references(() => authChallenges.id), consentedAt: text("consented_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("guardian_consents_registration_unique").on(table.registrationId)]);

export const walletPasses = sqliteTable("wallet_passes", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  provider: text("provider").notNull().default("walletwallet"), externalSerial: text("external_serial").notNull(),
  status: text("status", { enum: ["active", "revoked", "failed"] }).notNull().default("active"),
  appleObjectKey: text("apple_object_key"), googleSaveUrl: text("google_save_url"), passSpecJson: text("pass_spec_json").notNull().default("{}"),
  lastError: text("last_error"), issuedAt: text("issued_at"), attemptCount: integer("attempt_count").notNull().default(0),
  lastSyncedAt: text("last_synced_at").notNull(), ...timestamps,
}, (table) => [uniqueIndex("wallet_passes_registration_unique").on(table.registrationId)]);

export const communicationLogs = sqliteTable("communication_logs", {
  id: text("id").primaryKey(), registrationId: text("registration_id").notNull().references(() => registrations.id),
  messageType: text("message_type", { enum: ["confirmation", "waitlist", "cancellation", "event_update", "wallet_delivery"] }).notNull(),
  channel: text("channel", { enum: ["email", "wallet"] }).notNull(), provider: text("provider").notNull(),
  status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(), externalId: text("external_id"), errorMessage: text("error_message"),
  dedupeKey: text("dedupe_key").notNull(), createdAt: text("created_at").notNull(), sentAt: text("sent_at"),
}, (table) => [uniqueIndex("communication_logs_dedupe_unique").on(table.dedupeKey), index("communication_logs_registration_idx").on(table.registrationId, table.createdAt)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorUserId: text("actor_user_id"), action: text("action").notNull(), targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(), metadataJson: text("metadata_json").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, (table) => [index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt)]);

export const heroSlides = sqliteTable("hero_slides", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  imageUrl: text("image_url").notNull(),
  title: text("title"),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (table) => [index("hero_slides_org_sort_idx").on(table.organizationId, table.sortOrder)]);

