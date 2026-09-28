import { Link } from "react-router";
import type { Route } from "./+types/dashboard";

export function meta({}: Route.MetaArgs) { return [{ title: "Athlete dashboard | 3F Striders" }]; }

export default function Dashboard() {
  return (
    <main className="narrow-page section-space">
      <span className="eyebrow eyebrow-dark">Athlete access</span><h1>Your race dashboard</h1>
      <p className="lead">Enter your email to receive a one-time access code. No password required.</p>
      <section className="form-card compact-card">
        <label htmlFor="dashboard-email">Email address</label>
        <input id="dashboard-email" type="email" placeholder="athlete@example.com" />
        <button className="button button-primary button-full" type="button">Email me a code</button>
      </section>
      <Link className="back-link" to="/">← Return to events</Link>
    </main>
  );
}
