import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/organizer-event-new";
import { hasPermission } from "../domain/auth/rbac";
import { eventInputSchema, slugify } from "../domain/events/event-validation";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { createEvent } from "../infrastructure/db/event-repository.server";

export async function action({ request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "events.create")) return data({ error: "Your role cannot create events." }, { status: 403 });
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  if (!raw.slug) raw.slug = slugify(String(raw.name ?? ""));
  const result = eventInputSchema.safeParse(raw);
  if (!result.success) return data({ error: result.error.issues[0]?.message ?? "Check the event details." }, { status: 400 });
  try {
    const eventId = await createEvent(result.data, session.email);
    throw redirect(`/organizer/events/${eventId}?created=1`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: "The event could not be created. Check that its URL slug is unique." }, { status: 400 });
  }
}

export default function OrganizerEventNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const submitting = navigation.state === "submitting";
  return (
    <>
      <Link className="back-link" to="/organizer">← Events</Link>
      <div className="organizer-heading"><span className="eyebrow eyebrow-dark">New event</span><h1>Create an event</h1><p>Start with the event basics. Races, categories, and waves come next.</p></div>
      <Form method="post" className="admin-form-card">
        <div className="field-grid"><label>Event name<input name="name" required placeholder="3F Community Triathlon 2027" /></label><label>URL slug<input name="slug" placeholder="Generated from the name" /></label></div>
        <label>Summary<textarea name="summary" rows={4} placeholder="Describe the event and who it is for." /></label>
        <div className="field-grid"><label>Start date and time<input name="startsAt" type="datetime-local" required /></label><label>Venue<input name="venueName" required placeholder="Dubai, United Arab Emirates" /></label></div>
        <div className="field-grid"><label>Visibility<select name="visibility" defaultValue="public"><option value="public">Public</option><option value="private">Private link</option></select></label><label>Overall capacity<input name="capacity" type="number" min="1" placeholder="Unlimited" /></label></div>
        {actionData?.error ? <p className="form-message form-error">{actionData.error}</p> : null}
        <div className="admin-form-actions"><Link className="button button-muted" to="/organizer">Cancel</Link><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create draft"}</button></div>
      </Form>
    </>
  );
}
