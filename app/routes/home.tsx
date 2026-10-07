import { Link } from "react-router";

import type { Route } from "./+types/home";
import { listPublishedEvents } from "../infrastructure/db/event-repository.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "3F Striders Event Registration" },
    { name: "description", content: "Event and race registration platform for 3F Striders, featuring race management, athlete dashboards, organizer tools, and digital passes." },
    { property: "og:title", content: "3F Striders Event Registration" },
    { property: "og:description", content: "Event and race registration platform for 3F Striders, featuring race management, athlete dashboards, organizer tools, and digital passes." },
  ];
}

export async function loader({}: Route.LoaderArgs) { return { events: await listPublishedEvents() }; }

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <section className="hero-shell">
        <div className="hero-grid page-width">
          <div className="hero-copy">
            <span className="eyebrow">Run · Swim · Bike · Triathlon</span>
            <h1>Your next start line begins here.</h1>
            <p>Register for 3F Striders events, keep your race information in one place, and carry your confirmation in Apple or Google Wallet.</p>
            <div className="button-row">
              <a className="button button-primary" href="#events">Explore events</a>
              <Link className="button button-secondary" to="/dashboard">Athlete dashboard</Link>
            </div>
          </div>
          <div className="hero-stat-card" aria-label="Registration process">
            <span className="status-dot" />
            <p className="card-kicker">Simple registration</p>
            <ol className="steps-list">
              <li><span>1</span>Verify your email</li>
              <li><span>2</span>Complete your entry</li>
              <li><span>3</span>Add your wallet pass</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="page-width section-space" id="events">
        <div className="section-heading">
          <div><span className="eyebrow eyebrow-dark">Upcoming</span><h2>Find your race</h2></div>
          <p>Times shown in Gulf Standard Time (UTC+4).</p>
        </div>
        {loaderData.events.length === 0 ? <div className="empty-state public-empty"><h3>New events are coming soon</h3><p>Published 3F Striders races will appear here.</p></div> : loaderData.events.map((event) => {
          const startsAt = new Date(event.startsAt);
          return <article className="event-card" key={event.id}>
            <div className="event-visual" aria-hidden="true"><span className="event-month">{startsAt.toLocaleString("en-AE", { month: "short", timeZone: "Asia/Dubai" }).toUpperCase()}</span><strong>{startsAt.toLocaleString("en-AE", { day: "2-digit", timeZone: "Asia/Dubai" })}</strong></div>
            <div className="event-content">
              <div className="pill-row"><span className="pill">Race event</span><span className="pill pill-open">Registration open</span></div>
              <h3>{event.name}</h3><p>{event.summary}</p>
              <dl className="event-facts"><div><dt>Date</dt><dd>{startsAt.toLocaleString("en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" })}</dd></div><div><dt>Location</dt><dd>{event.venueName}</dd></div><div><dt>Capacity</dt><dd>{event.capacity ?? "Unlimited"}</dd></div></dl>
              <Link className="text-link" to={`/events/${event.slug}`}>View event <span aria-hidden="true">→</span></Link>
            </div>
          </article>;
        })}
      </section>
    </main>
  );
}
