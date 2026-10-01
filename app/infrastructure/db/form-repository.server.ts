import { env } from "cloudflare:workers";

import type { FormFieldType, PublishedField } from "../../domain/forms/form-validation";
import { sha256 } from "../security/crypto.server";

const database = () => env.DB;
const ORGANIZATION_ID = "org_3fstriders";
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function audit(action: string, eventId: string, actorEmail: string, metadata: Record<string, unknown> = {}) {
  await database().prepare("INSERT INTO audit_logs (id, organization_id, actor_user_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, NULL, ?, 'event', ?, ?, ?)")
    .bind(id("audit"), ORGANIZATION_ID, action, eventId, JSON.stringify({ actorEmail, ...metadata }), now()).run();
}

export type FormVersionRecord = { id: string; eventId: string; version: number; status: "draft" | "published" | "retired"; title: string; publishedAt: string | null };
export type FormFieldRecord = PublishedField & { formVersionId: string; createdAt?: string };
export type WaiverRecord = { id: string; eventId: string; version: number; title: string; content: string; checksum: string; status: "draft" | "published" | "retired"; publishedAt: string | null };

async function getDraftForm(eventId: string) {
  return database().prepare("SELECT id, event_id AS eventId, version, status, title, published_at AS publishedAt FROM form_versions WHERE event_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<FormVersionRecord>();
}

async function createDraftForm(eventId: string) {
  const published = await database().prepare("SELECT id, version, title FROM form_versions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<{ id: string; version: number; title: string }>();
  const next = (published?.version ?? 0) + 1;
  const formId = id("form"); const timestamp = now();
  await database().prepare("INSERT INTO form_versions (id, event_id, version, status, title, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)")
    .bind(formId, eventId, next, published?.title ?? "Registration questions", timestamp, timestamp).run();
  if (published) {
    const fields = await database().prepare("SELECT key, label, help_text AS helpText, type, required, sensitive, options_json AS optionsJson, validation_json AS validationJson, sort_order AS sortOrder FROM form_fields WHERE form_version_id = ? ORDER BY sort_order")
      .bind(published.id).all<{ key: string; label: string; helpText: string; type: string; required: number; sensitive: number; optionsJson: string; validationJson: string; sortOrder: number }>();
    if (fields.results.length) await database().batch(fields.results.map((field) => database().prepare("INSERT INTO form_fields (id, form_version_id, key, label, help_text, type, required, sensitive, options_json, validation_json, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id("field"), formId, field.key, field.label, field.helpText, field.type, field.required, field.sensitive, field.optionsJson, field.validationJson, field.sortOrder, timestamp, timestamp)));
  }
  return (await getDraftForm(eventId))!;
}

async function getDraftWaiver(eventId: string) {
  return database().prepare("SELECT id, event_id AS eventId, version, title, content, checksum, status, published_at AS publishedAt FROM waiver_versions WHERE event_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<WaiverRecord>();
}

async function createDraftWaiver(eventId: string) {
  const published = await database().prepare("SELECT version, title, content FROM waiver_versions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<{ version: number; title: string; content: string }>();
  const timestamp = now(); const content = published?.content ?? "";
  await database().prepare("INSERT INTO waiver_versions (id, event_id, version, title, content, checksum, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
    .bind(id("waiver"), eventId, (published?.version ?? 0) + 1, published?.title ?? "Participant waiver", content, await sha256(content), timestamp, timestamp).run();
  return (await getDraftWaiver(eventId))!;
}

export async function getFormBuilder(eventId: string) {
  const event = await database().prepare("SELECT id, name FROM events WHERE id = ?").bind(eventId).first<{ id: string; name: string }>();
  if (!event) return null;
  const form = await getDraftForm(eventId) ?? await createDraftForm(eventId);
  const waiver = await getDraftWaiver(eventId) ?? await createDraftWaiver(eventId);
  const rawFields = await database().prepare("SELECT id, form_version_id AS formVersionId, key, label, help_text AS helpText, type, required, sensitive, options_json AS optionsJson, sort_order AS sortOrder FROM form_fields WHERE form_version_id = ? ORDER BY sort_order, created_at")
    .bind(form.id).all<{ id: string; formVersionId: string; key: string; label: string; helpText: string; type: FormFieldType; required: number; sensitive: number; optionsJson: string; sortOrder: number }>();
  const fields: FormFieldRecord[] = rawFields.results.map((field) => ({ ...field, required: Boolean(field.required), sensitive: Boolean(field.sensitive), options: JSON.parse(field.optionsJson) as string[] }));
  return { event, form, fields, waiver };
}

export async function addFormField(eventId: string, input: { key: string; label: string; helpText: string; type: FormFieldType; required: boolean; sensitive: boolean; options: string[] }, actorEmail: string) {
  const form = await getDraftForm(eventId) ?? await createDraftForm(eventId);
  const maximum = await database().prepare("SELECT COALESCE(MAX(sort_order), -1) AS maximum FROM form_fields WHERE form_version_id = ?").bind(form.id).first<{ maximum: number }>();
  const timestamp = now();
  await database().prepare("INSERT INTO form_fields (id, form_version_id, key, label, help_text, type, required, sensitive, options_json, validation_json, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)")
    .bind(id("field"), form.id, input.key, input.label, input.helpText, input.type, input.required ? 1 : 0, input.sensitive ? 1 : 0, JSON.stringify(input.options), (maximum?.maximum ?? -1) + 1, timestamp, timestamp).run();
  await audit("form.field_added", eventId, actorEmail, { key: input.key, type: input.type, sensitive: input.sensitive });
}

export async function deleteFormField(eventId: string, fieldId: string, actorEmail: string) {
  await database().prepare("DELETE FROM form_fields WHERE id = ? AND form_version_id IN (SELECT id FROM form_versions WHERE event_id = ? AND status = 'draft')").bind(fieldId, eventId).run();
  await audit("form.field_removed", eventId, actorEmail, { fieldId });
}

export async function saveDraftWaiver(eventId: string, title: string, content: string, actorEmail: string) {
  const waiver = await getDraftWaiver(eventId) ?? await createDraftWaiver(eventId);
  await database().prepare("UPDATE waiver_versions SET title = ?, content = ?, checksum = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
    .bind(title, content, await sha256(content), now(), waiver.id).run();
  await audit("waiver.draft_saved", eventId, actorEmail, { waiverVersionId: waiver.id });
}

export async function publishFormBundle(eventId: string, actorEmail: string) {
  const form = await getDraftForm(eventId); const waiver = await getDraftWaiver(eventId);
  if (!form || !waiver || waiver.content.trim().length < 20) throw new Error("Add waiver text before publishing.");
  const timestamp = now();
  await database().batch([
    database().prepare("UPDATE form_versions SET status = 'retired', updated_at = ? WHERE event_id = ? AND status = 'published'").bind(timestamp, eventId),
    database().prepare("UPDATE waiver_versions SET status = 'retired', updated_at = ? WHERE event_id = ? AND status = 'published'").bind(timestamp, eventId),
    database().prepare("UPDATE form_versions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(timestamp, timestamp, form.id),
    database().prepare("UPDATE waiver_versions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(timestamp, timestamp, waiver.id),
  ]);
  await audit("form.published", eventId, actorEmail, { formVersionId: form.id, waiverVersionId: waiver.id });
}

export async function getPublishedFormBundle(eventId: string) {
  const form = await database().prepare("SELECT id, event_id AS eventId, version, status, title, published_at AS publishedAt FROM form_versions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<FormVersionRecord>();
  const waiver = await database().prepare("SELECT id, event_id AS eventId, version, title, content, checksum, status, published_at AS publishedAt FROM waiver_versions WHERE event_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1")
    .bind(eventId).first<WaiverRecord>();
  if (!form || !waiver) return null;
  const rawFields = await database().prepare("SELECT id, form_version_id AS formVersionId, key, label, help_text AS helpText, type, required, sensitive, options_json AS optionsJson, sort_order AS sortOrder FROM form_fields WHERE form_version_id = ? ORDER BY sort_order, created_at")
    .bind(form.id).all<{ id: string; formVersionId: string; key: string; label: string; helpText: string; type: FormFieldType; required: number; sensitive: number; optionsJson: string; sortOrder: number }>();
  const fields: FormFieldRecord[] = rawFields.results.map((field) => ({ ...field, required: Boolean(field.required), sensitive: Boolean(field.sensitive), options: JSON.parse(field.optionsJson) as string[] }));
  return { form, waiver, fields };
}
