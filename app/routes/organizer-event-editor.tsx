import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/organizer-event-editor";
import { hasPermission } from "../domain/auth/rbac";
import { canTransitionEvent, type EventStatus } from "../domain/events/lifecycle";
import { categoryInputSchema, eventInputSchema, raceInputSchema, waveInputSchema } from "../domain/events/event-validation";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { addCategory, addRace, addWave, getEvent, rotatePrivateLink, setEventStatus, updateEvent } from "../infrastructure/db/event-repository.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  const event = await getEvent(params.eventId);
  if (!event) throw data("Event not found", { status: 404 });
  return { ...event, permissions: { edit: hasPermission(session.role, "events.edit"), publish: hasPermission(session.role, "events.publish") } };
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  const current = await getEvent(params.eventId);
  if (!current) throw data("Event not found", { status: 404 });
  const formData = await request.formData(); const intent = String(formData.get("intent") ?? "");
  const values = Object.fromEntries(formData);
  try {
    if (intent === "save-event") {
      if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot edit events." }, { status: 403 });
      const result = eventInputSchema.safeParse(values);
      if (!result.success) return data({ ok: false as const, message: result.error.issues[0]?.message ?? "Check the event details." }, { status: 400 });
      await updateEvent(params.eventId, result.data, session.email);
      return { ok: true as const, message: "Event details saved." };
    }
    if (intent === "set-status") {
      if (!hasPermission(session.role, "events.publish")) return data({ ok: false as const, message: "Your role cannot change publication status." }, { status: 403 });
      const status = String(formData.get("status")) as EventStatus;
      if (!canTransitionEvent(current.event.status, status)) return data({ ok: false as const, message: `Cannot change ${current.event.status} to ${status}.` }, { status: 400 });
      if (status === "published" && current.races.length === 0) return data({ ok: false as const, message: "Add at least one race before publishing." }, { status: 400 });
      await setEventStatus(params.eventId, status, session.email);
      return { ok: true as const, message: `Event is now ${status}.` };
    }
    if (intent === "add-race") {
      if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot edit races." }, { status: 403 });
      const result = raceInputSchema.safeParse(values);
      if (!result.success) return data({ ok: false as const, message: result.error.issues[0]?.message ?? "Check the race details." }, { status: 400 });
      await addRace(params.eventId, result.data, session.email); return { ok: true as const, message: "Race added." };
    }
    if (intent === "add-category") {
      if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot edit categories." }, { status: 403 });
      const result = categoryInputSchema.safeParse(values);
      if (!result.success) return data({ ok: false as const, message: result.error.issues[0]?.message ?? "Check the category." }, { status: 400 });
      await addCategory(params.eventId, result.data, session.email); return { ok: true as const, message: "Category added." };
    }
    if (intent === "add-wave") {
      if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot edit waves." }, { status: 403 });
      const result = waveInputSchema.safeParse(values);
      if (!result.success) return data({ ok: false as const, message: result.error.issues[0]?.message ?? "Check the wave." }, { status: 400 });
      await addWave(params.eventId, result.data, session.email); return { ok: true as const, message: "Wave added." };
    }
    if (intent === "rotate-link") {
      if (!hasPermission(session.role, "events.edit")) return data({ ok: false as const, message: "Your role cannot rotate access links." }, { status: 403 });
      if (current.event.visibility !== "private") return data({ ok: false as const, message: "Private links apply only to private events." }, { status: 400 });
      const token = await rotatePrivateLink(params.eventId, session.email);
      return { ok: true as const, message: "Private link rotated. Copy it now; it will not be shown again.", privateUrl: `${new URL(request.url).origin}/events/${current.event.slug}?access=${token}` };
    }
    return data({ ok: false as const, message: "Unknown organizer action." }, { status: 400 });
  } catch (error) {
    console.error("Organizer event action failed", error);
    return data({ ok: false as const, message: "The change could not be saved." }, { status: 500 });
  }
}

function localDateTime(value: string) { return value.slice(0, 16); }
function capacityLabel(value: number | null) { return value === null ? "Unlimited" : `${value} places`; }

export default function OrganizerEventEditor({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const saving = navigation.state === "submitting";
  const { event, races, categories, waves } = loaderData;
  return (
    <>
      <Link className="back-link" to="/organizer">← Events</Link>
      <div className="editor-title-row"><div><div className="pill-row"><span className={`pill status-${event.status}`}>{event.status}</span><span className="pill">{event.visibility}</span></div><h1>{event.name}</h1><p>{event.slug}</p></div><div className="button-row compact-buttons"><Link className="button button-muted" to={`/organizer/events/${event.id}/form`}>Form & waiver</Link><Link className="button button-muted" to={`/events/${event.slug}`}>Public preview</Link></div></div>
      {actionData ? <div className={actionData.ok ? "form-message form-success" : "form-message form-error"}><span>{actionData.message}</span>{"privateUrl" in actionData && actionData.privateUrl ? <input readOnly value={actionData.privateUrl} onFocus={(event) => event.currentTarget.select()} /> : null}</div> : null}

      <section className="editor-section">
        <div className="editor-section-heading"><div><span>01</span><h2>Event details</h2></div><p>Core information, access, and overall capacity.</p></div>
        <Form method="post" className="admin-form-card">
          <input type="hidden" name="intent" value="save-event" />
          <div className="field-grid"><label>Event name<input name="name" defaultValue={event.name} required /></label><label>URL slug<input name="slug" defaultValue={event.slug} required /></label></div>
          <label>Summary<textarea name="summary" rows={4} defaultValue={event.summary} /></label>
          <div className="field-grid"><label>Start date and time<input name="startsAt" type="datetime-local" defaultValue={localDateTime(event.startsAt)} required /></label><label>Venue<input name="venueName" defaultValue={event.venueName} required /></label></div>
          <div className="field-grid"><label>Visibility<select name="visibility" defaultValue={event.visibility}><option value="public">Public</option><option value="private">Private link</option></select></label><label>Overall capacity<input name="capacity" type="number" min="1" defaultValue={event.capacity ?? ""} placeholder="Unlimited" /></label></div>
          <div className="admin-form-actions"><span className="save-hint">All times use Asia/Dubai.</span><button className="button button-primary" type="submit" disabled={!loaderData.permissions.edit || saving}>{saving ? "Saving…" : "Save details"}</button></div>
        </Form>
      </section>

      <section className="editor-section">
        <div className="editor-section-heading"><div><span>02</span><h2>Race structure</h2></div><p>Add distances or disciplines, then define their categories and waves.</p></div>
        <div className="structure-grid">
          <div className="structure-list">
            {races.length === 0 ? <div className="empty-state"><h3>No races yet</h3><p>Add the first race to make this event publishable.</p></div> : races.map((race) => (
              <article className="structure-card" key={race.id}>
                <div className="structure-card-title"><div><span>{race.discipline}</span><h3>{race.name}</h3></div><strong>{race.distanceValue} {race.distanceUnit}</strong></div>
                <p>{capacityLabel(race.capacity)} · {new Date(race.startsAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</p>
                <div className="structure-tags">{categories.filter((item) => item.raceId === race.id).map((item) => <span key={item.id}>Category: {item.name}</span>)}{waves.filter((item) => item.raceId === race.id).map((item) => <span key={item.id}>Wave: {item.name}</span>)}</div>
              </article>
            ))}
          </div>
          <details className="quick-form" open={races.length === 0}><summary>Add race</summary><Form method="post"><input type="hidden" name="intent" value="add-race" /><label>Name<input name="name" required placeholder="Sprint Triathlon" /></label><div className="field-grid"><label>Discipline<select name="discipline"><option value="run">Run</option><option value="swim">Swim</option><option value="bike">Bike</option><option value="triathlon">Triathlon</option><option value="duathlon">Duathlon</option><option value="other">Other</option></select></label><label>Start<input name="startsAt" type="datetime-local" required /></label></div><div className="field-grid"><label>Distance<input name="distanceValue" type="number" min="1" required /></label><label>Unit<select name="distanceUnit"><option value="km">km</option><option value="m">m</option></select></label></div><label>Capacity<input name="capacity" type="number" min="1" placeholder="Unlimited" /></label><button className="button button-primary button-full" type="submit">Add race</button></Form></details>
        </div>
        {races.length > 0 ? <div className="subforms-grid">
          <details className="quick-form"><summary>Add category</summary><Form method="post"><input type="hidden" name="intent" value="add-category" /><label>Race<select name="raceId">{races.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}</select></label><label>Name<input name="name" required placeholder="Open / Age 30–39" /></label><label>Description<textarea name="description" rows={2} /></label><label>Capacity<input name="capacity" type="number" min="1" placeholder="Unlimited" /></label><button className="button button-primary button-full" type="submit">Add category</button></Form></details>
          <details className="quick-form"><summary>Add start wave</summary><Form method="post"><input type="hidden" name="intent" value="add-wave" /><label>Race<select name="raceId">{races.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}</select></label><label>Name<input name="name" required placeholder="Wave A" /></label><label>Start<input name="startsAt" type="datetime-local" required /></label><label>Capacity<input name="capacity" type="number" min="1" placeholder="Unlimited" /></label><button className="button button-primary button-full" type="submit">Add wave</button></Form></details>
        </div> : null}
      </section>

      <section className="editor-section publish-panel">
        <div><span className="eyebrow">Publication</span><h2>{event.status === "published" ? "Event is live" : "Ready to publish?"}</h2><p>Publishing makes a public event discoverable. Private events remain accessible only through their current private link.</p></div>
        <div className="publish-actions">
          {event.visibility === "private" ? <Form method="post"><input type="hidden" name="intent" value="rotate-link" /><button className="button button-secondary" type="submit">Rotate private link</button></Form> : null}
          <Form method="post"><input type="hidden" name="intent" value="set-status" /><input type="hidden" name="status" value={event.status === "published" ? "draft" : "published"} /><button className="button button-primary" type="submit" disabled={!loaderData.permissions.publish}>{event.status === "published" ? "Return to draft" : "Publish event"}</button></Form>
        </div>
      </section>
    </>
  );
}
