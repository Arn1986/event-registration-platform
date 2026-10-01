import { Form, Link, data, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/team-join";
import { resolveJoinCode } from "../infrastructure/db/team-repository.server";

export async function action({ request }: Route.ActionArgs) {
  const code = String((await request.formData()).get("joinCode") ?? "").trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(code)) return data({ ok: false as const, message: "Enter the eight-character team code." }, { status: 400 });
  const team = await resolveJoinCode(code);
  if (!team) return data({ ok: false as const, message: "That code is invalid, expired, or the team is full." }, { status: 404 });
  return redirect(`/events/${team.eventSlug}/register?race=${team.raceId}&joinCode=${encodeURIComponent(code)}`);
}

export default function TeamJoin({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return <main className="narrow-page section-space"><Link className="back-link" to="/dashboard">← Dashboard</Link><section className="form-card"><span className="eyebrow eyebrow-dark">Team entry</span><h1>Join a team</h1><p>Enter the code shared by your captain or organizer. You’ll verify your email and complete your own athlete details and waiver.</p><Form method="post" className="form-stack"><label>Team join code<input className="join-code-input" name="joinCode" autoCapitalize="characters" maxLength={8} required /></label><button className="button button-primary button-full" type="submit" disabled={navigation.state === "submitting"}>{navigation.state === "submitting" ? "Checking…" : "Continue"}</button></Form>{actionData ? <p className="form-message form-error">{actionData.message}</p> : null}</section></main>;
}

