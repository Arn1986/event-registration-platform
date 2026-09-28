import { Link } from "react-router";
import type { Route } from "./+types/organizer";
import { exampleEvent } from "../domain/events/example-event";

export function meta({}: Route.MetaArgs) { return [{ title: "Organizer | 3F Striders Events" }]; }

export default function Organizer() {
  return (
    <main className="page-width section-space">
      <div className="section-heading"><div><span className="eyebrow eyebrow-dark">Organizer</span><h1>Events</h1></div><button className="button button-primary" type="button">Create event</button></div>
      <div className="admin-grid">
        <article className="metric-card"><span>Published events</span><strong>1</strong></article>
        <article className="metric-card"><span>Confirmed athletes</span><strong>225</strong></article>
        <article className="metric-card"><span>Available places</span><strong>275</strong></article>
      </div>
      <section className="table-card">
        <div className="table-title"><h2>Current events</h2><span className="pill pill-open">Published</span></div>
        <div className="event-admin-row">
          <div><strong>{exampleEvent.name}</strong><span>{exampleEvent.dateLabel} · {exampleEvent.location}</span></div>
          <div className="admin-actions"><Link to={`/events/${exampleEvent.slug}`}>Preview</Link><button type="button">Manage</button></div>
        </div>
      </section>
    </main>
  );
}
