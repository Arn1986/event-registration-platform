import { Form, Link, data, useNavigation } from "react-router";

import type { Route } from "./+types/organizer-event-form";
import { hasPermission } from "../domain/auth/rbac";
import { formFieldSchema } from "../domain/forms/form-validation";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { addFormField, deleteFormField, getFormBuilder, publishFormBundle, saveDraftWaiver } from "../infrastructure/db/form-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  const builder = await getFormBuilder(params.eventId);
  if (!builder) throw data("Event not found", { status: 404 });
  return { ...builder, canEdit: hasPermission(session.role, "events.edit"), canPublish: hasPermission(session.role, "events.publish") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const session = await requireOrganizer(request); const formData = await request.formData(); const intent = String(formData.get("intent") ?? "");
  if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot edit registration forms." }, { status: 403 });
  try {
    if (intent === "add-field") {
      const parsed = formFieldSchema.safeParse({ key: formData.get("key"), label: formData.get("label"), helpText: formData.get("helpText"), type: formData.get("type"), required: formData.get("required") === "on", sensitive: formData.get("sensitive") === "on", options: String(formData.get("options") ?? "").split("\n").map((item) => item.trim()).filter(Boolean) });
      if (!parsed.success) return data({ ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the field settings." }, { status: 400 });
      if ((parsed.data.type === "single_select" || parsed.data.type === "multi_select") && parsed.data.options.length < 2) return data({ ok: false as const, message: "Select fields need at least two options." }, { status: 400 });
      await addFormField(params.eventId, parsed.data, session.email); return { ok: true as const, message: "Question added to the draft." };
    }
    if (intent === "delete-field") { await deleteFormField(params.eventId, String(formData.get("fieldId") ?? ""), session.email); return { ok: true as const, message: "Question removed." }; }
    if (intent === "save-waiver") {
      const title = String(formData.get("title") ?? "").trim(); const content = String(formData.get("content") ?? "").trim();
      if (title.length < 2 || content.length < 20) return data({ ok: false as const, message: "Add a waiver title and at least 20 characters of text." }, { status: 400 });
      await saveDraftWaiver(params.eventId, title, content, session.email); return { ok: true as const, message: "Waiver draft saved." };
    }
    if (intent === "publish") {
      if (!hasPermission(session.role, "events.publish")) return data({ ok: false as const, message: "Your role cannot publish forms." }, { status: 403 });
      await publishFormBundle(params.eventId, session.email); return { ok: true as const, message: "Form and waiver published as an immutable version." };
    }
    return data({ ok: false as const, message: "Unknown form action." }, { status: 400 });
  } catch (error) {
    return data({ ok: false as const, message: error instanceof Error ? error.message : "The form change could not be saved." }, { status: 500 });
  }
}

const fieldLabels = { short_text: "Short text", long_text: "Long text", number: "Number", date: "Date", single_select: "Single select", multi_select: "Multi-select", checkbox: "Acknowledgement" } as const;
const fieldTypeOptions = ["short_text", "long_text", "number", "date", "single_select", "multi_select", "checkbox"] as const;

export default function OrganizerEventForm({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const busy = navigation.state === "submitting";
  return <><Link className="back-link" to={`/organizer/events/${loaderData.event.id}`}>← {loaderData.event.name}</Link><div className="organizer-heading"><span className="eyebrow eyebrow-dark">Form builder</span><h1>Questions & waiver</h1><p>Draft version {loaderData.form.version}. Publishing freezes this exact form for future registration records.</p></div>{actionData ? <p className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}</p> : null}
    <section className="builder-layout"><div className="table-card"><div className="table-title"><h2>Registration questions</h2><span className="pill">{loaderData.fields.length} custom</span></div>{loaderData.fields.length ? <div className="builder-fields">{loaderData.fields.map((field) => <article key={field.id}><div><strong>{field.label}</strong><span>{field.key} · {fieldLabels[field.type]}{field.required ? " · required" : ""}{field.sensitive ? " · encrypted" : ""}</span>{field.helpText ? <small>{field.helpText}</small> : null}</div><Form method="post"><input type="hidden" name="intent" value="delete-field" /><input type="hidden" name="fieldId" value={field.id} /><button className="text-button danger-text" type="submit" disabled={!loaderData.canEdit}>Remove</button></Form></article>)}</div> : <div className="empty-state"><h3>No custom questions</h3><p>The standard athlete, emergency, and medical fields are always included.</p></div>}</div>
      <Form method="post" className="admin-form-card"><input type="hidden" name="intent" value="add-field" /><h2>Add a question</h2><div className="field-grid"><label>Internal key<input name="key" placeholder="expected_finish_time" required /></label><label>Field type<select name="type">{fieldTypeOptions.map((type) => <option key={type} value={type}>{fieldLabels[type]}</option>)}</select></label></div><label>Question label<input name="label" required placeholder="Expected finish time" /></label><label>Help text<textarea name="helpText" rows={2} /></label><label>Options, one per line<textarea name="options" rows={4} placeholder={"Option A\nOption B"} /></label><div className="check-grid"><label className="check-row"><input type="checkbox" name="required" /><span>Required</span></label><label className="check-row"><input type="checkbox" name="sensitive" /><span>Encrypt answer</span></label></div><button className="button button-primary button-full" type="submit" disabled={!loaderData.canEdit || busy}>Add question</button></Form></section>
    <section className="editor-section"><div className="editor-section-heading"><div><span>02</span><h2>Participant waiver</h2></div><p>Version {loaderData.waiver.version}</p></div><Form method="post" className="admin-form-card"><input type="hidden" name="intent" value="save-waiver" /><label>Waiver title<input name="title" defaultValue={loaderData.waiver.title} required /></label><label>Waiver text<textarea name="content" rows={14} defaultValue={loaderData.waiver.content} required /></label><div className="admin-form-actions"><span className="save-hint">Guardian consent uses this same published version.</span><button className="button button-primary" type="submit" disabled={!loaderData.canEdit || busy}>Save waiver draft</button></div></Form></section>
    <section className="editor-section publish-panel"><div><span className="eyebrow">Versioning</span><h2>Publish this bundle</h2><p>Existing registrations always remain tied to the exact form fields and waiver checksum they accepted.</p></div><Form method="post"><input type="hidden" name="intent" value="publish" /><button className="button button-primary" type="submit" disabled={!loaderData.canPublish || busy}>Publish form & waiver</button></Form></section>
  </>;
}
