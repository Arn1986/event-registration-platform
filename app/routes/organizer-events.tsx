import { Link } from "react-router";
import type { Route } from "./+types/organizer-events";
import { hasPermission } from "../domain/auth/rbac";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { listEvents } from "../infrastructure/db/event-repository.server";

export function meta({}: Route.MetaArgs) { return [{ title: "Events | 3F Striders Organizer" }]; }
export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  return { events: await listEvents(), canCreate: hasPermission(session.role, "events.create") };
}

export default function OrganizerEvents({ loaderData }: Route.ComponentProps) {
  const published = loaderData.events.filter((event) => event.status === "published").length;
  return (
    <>
      <div className="section-heading organizer-heading">
        <div><span className="eyebrow eyebrow-dark">Phase 1</span><h1>Events</h1><p>Create, structure, and publish race events.</p></div>
        {loaderData.canCreate ? <Link className="button button-primary" to="/organizer/events/new">Create event</Link> : null}
      </div>
      <div className="admin-grid">
        <article className="metric-card"><span>Total events</span><strong>{loaderData.events.length}</strong></article>
        <article className="metric-card"><span>Published</span><strong>{published}</strong></article>
        <article className="metric-card"><span>Drafts</span><strong>{loaderData.events.length - published}</strong></article>
      </div>
      <section className="table-card">
        <div className="table-title"><h2>All events</h2><span>{loaderData.events.length} total</span></div>
        {loaderData.events.length === 0 ? (
          <div className="empty-state"><h3>No events yet</h3><p>Create your first event, then add races, categories, waves, and capacity.</p></div>
        ) : (
          <div className="event-admin-list">
            {loaderData.events.map((event) => (
              <article className="event-admin-row" key={event.id}>
                <div><strong>{event.name}</strong><span>{new Date(event.startsAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })} · {event.venueName}</span></div>
                <div className="admin-row-meta"><span className={`pill status-${event.status}`}>{event.status}</span><span>{event.raceCount ?? 0} races</span><Link to={`/organizer/events/${event.id}`}>Manage →</Link></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
