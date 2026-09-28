import { Link } from "react-router";

import type { Route } from "./+types/home";
import { exampleEvent } from "../domain/events/example-event";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "3F Striders Events" },
    { name: "description", content: "Discover and register for upcoming 3F Striders races." },
  ];
}

export default function Home() {
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
        <article className="event-card">
          <div className="event-visual" aria-hidden="true"><span className="event-month">NOV</span><strong>16</strong></div>
          <div className="event-content">
            <div className="pill-row"><span className="pill">Running</span><span className="pill pill-open">Registration open</span></div>
            <h3>{exampleEvent.name}</h3>
            <p>{exampleEvent.summary}</p>
            <dl className="event-facts">
              <div><dt>Date</dt><dd>{exampleEvent.dateLabel}</dd></div>
              <div><dt>Location</dt><dd>{exampleEvent.location}</dd></div>
              <div><dt>Races</dt><dd>{exampleEvent.races.map((race) => race.distance).join(" · ")}</dd></div>
            </dl>
            <Link className="text-link" to={`/events/${exampleEvent.slug}`}>View event <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      </section>
    </main>
  );
}
