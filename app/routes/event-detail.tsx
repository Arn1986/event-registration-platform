import { Link, data } from "react-router";

import type { Route } from "./+types/event-detail";
import { getPublishedEventBySlug, validatePrivateEventAccess } from "../infrastructure/db/event-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const result = await getPublishedEventBySlug(params.eventSlug);
  if (!result) throw data("Event not found", { status: 404 });
  const access = new URL(request.url).searchParams.get("access");
  if (result.event.visibility === "private" && !(await validatePrivateEventAccess(result.event.id, access))) throw data("Event not found", { status: 404 });
  return { ...result, access };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.event.name ?? "Event"} | 3F Striders` },
    { name: "description", content: loaderData?.event.summary },
  ];
}

export default function EventDetail({ loaderData }: Route.ComponentProps) {
  const { event, races } = loaderData; const startsAt = new Date(event.startsAt);
  return (
    <main className="page-width section-space">
      <Link className="back-link" to="/">← All events</Link>
      <section className="event-hero">
        <div>
          <div className="pill-row"><span className="pill">Running</span><span className="pill pill-open">Registration open</span></div>
          <h1>{event.name}</h1><p>{event.summary}</p>
        </div>
        <aside className="date-panel"><span>{startsAt.toLocaleString("en-AE", { day: "2-digit", timeZone: "Asia/Dubai" })}</span><strong>{startsAt.toLocaleString("en-AE", { month: "short", year: "numeric", timeZone: "Asia/Dubai" }).toUpperCase()}</strong></aside>
      </section>
      <section className="event-layout">
        <div>
          <h2>Choose your race</h2>
          <div className="race-list">
            {races.map((race) => (
              <article className="race-row" key={race.id}>
                <div><span className="race-distance">{race.distanceValue} {race.distanceUnit}</span><h3>{race.name}</h3><p>{race.capacity === null ? "No capacity limit" : `${race.capacity} places`}</p></div>
                <Link className="button button-primary" to={`/events/${event.slug}/register?race=${race.id}${loaderData.access ? `&access=${loaderData.access}` : ""}`}>Register</Link>
              </article>
            ))}
          </div>
        </div>
        <aside className="info-card">
          <h2>Event details</h2>
          <dl className="stacked-facts">
            <div><dt>Date</dt><dd>{startsAt.toLocaleString("en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" })}</dd></div>
            <div><dt>Start</dt><dd>{startsAt.toLocaleString("en-AE", { timeStyle: "short", timeZone: "Asia/Dubai" })} GST</dd></div>
            <div><dt>Location</dt><dd>{event.venueName}</dd></div>
            <div><dt>Entry</dt><dd>Free registration</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
