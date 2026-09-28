import { Link, data } from "react-router";

import type { Route } from "./+types/event-detail";
import { exampleEvent } from "../domain/events/example-event";

export function loader({ params }: Route.LoaderArgs) {
  if (params.eventSlug !== exampleEvent.slug) throw data("Event not found", { status: 404 });
  return { event: exampleEvent };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.event.name ?? "Event"} | 3F Striders` },
    { name: "description", content: loaderData?.event.summary },
  ];
}

export default function EventDetail({ loaderData }: Route.ComponentProps) {
  const { event } = loaderData;
  return (
    <main className="page-width section-space">
      <Link className="back-link" to="/">← All events</Link>
      <section className="event-hero">
        <div>
          <div className="pill-row"><span className="pill">Running</span><span className="pill pill-open">Registration open</span></div>
          <h1>{event.name}</h1><p>{event.summary}</p>
        </div>
        <aside className="date-panel"><span>16</span><strong>NOV 2026</strong></aside>
      </section>
      <section className="event-layout">
        <div>
          <h2>Choose your race</h2>
          <div className="race-list">
            {event.races.map((race) => (
              <article className="race-row" key={race.id}>
                <div><span className="race-distance">{race.distance}</span><h3>{race.name}</h3><p>{race.remaining} places remaining</p></div>
                <Link className="button button-primary" to={`/events/${event.slug}/register?race=${race.id}`}>Register</Link>
              </article>
            ))}
          </div>
        </div>
        <aside className="info-card">
          <h2>Event details</h2>
          <dl className="stacked-facts">
            <div><dt>Date</dt><dd>{event.dateLabel}</dd></div>
            <div><dt>Start</dt><dd>{event.timeLabel}</dd></div>
            <div><dt>Location</dt><dd>{event.location}</dd></div>
            <div><dt>Entry</dt><dd>Free registration</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
