import { Form, Link, data, useNavigation } from "react-router";

import type { Route } from "./+types/registration-confirmation";
import { requireAthlete } from "../infrastructure/auth/athlete-auth.server";
import { getAthleteRegistration } from "../infrastructure/db/athlete-repository.server";
import { cancelRegistration } from "../infrastructure/db/registration-engine.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const athlete = await requireAthlete(request);
  const registration = await getAthleteRegistration(athlete.userId, params.registrationId);
  if (!registration) throw data("Registration not found", { status: 404 });
  return { registration, teamCode: new URL(request.url).searchParams.get("teamCode") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const athlete = await requireAthlete(request);
  const registration = await getAthleteRegistration(athlete.userId, params.registrationId);
  if (!registration) throw data("Registration not found", { status: 404 });
  if (new Date(registration.eventStartsAt) <= new Date()) return data({ ok: false as const, message: "This event has already started." }, { status: 400 });
  try { await cancelRegistration(registration.id, "athlete", athlete.email, "athlete cancellation"); return { ok: true as const, message: "Registration cancelled." }; }
  catch (error) { return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not cancel the registration." }, { status: 400 }); }
}

export default function RegistrationConfirmation({ loaderData, actionData }: Route.ComponentProps) {
  const { registration } = loaderData;
  const navigation = useNavigation();
  const awaitingGuardian = registration.status === "awaiting_guardian_consent";
  const statusMessage = registration.status === "confirmed" ? "Your place is confirmed." : registration.status === "waitlisted" ? "The selected capacity is full, so you are on the waitlist." : awaitingGuardian ? `A verification code was sent to ${registration.guardianEmail}. The registration remains pending until consent is recorded.` : registration.status === "cancelled" ? "This registration has been cancelled." : "Your registration is being processed.";
  return <main className="narrow-page section-space"><section className="confirmation-card"><span className="confirmation-mark">{registration.status === "confirmed" ? "✓" : registration.status === "waitlisted" || awaitingGuardian ? "…" : "—"}</span><span className="eyebrow eyebrow-dark">Registration {registration.registrationReference}</span><h1>{registration.status === "confirmed" ? "Place confirmed" : registration.status === "waitlisted" ? "You’re waitlisted" : awaitingGuardian ? "Guardian consent needed" : registration.status.replaceAll("_", " ")}</h1><p>{statusMessage}</p>{loaderData.teamCode ? <div className="team-code-panel"><span>Share this team join code</span><strong>{loaderData.teamCode}</strong><small>It is shown only on this page. Team members can use it at the Join a team page.</small></div> : null}<dl className="stacked-facts confirmation-facts"><div><dt>Event</dt><dd>{registration.eventName}</dd></div><div><dt>Race</dt><dd>{registration.raceName}</dd></div>{registration.categoryName ? <div><dt>Category</dt><dd>{registration.categoryName}</dd></div> : null}{registration.teamName ? <div><dt>Team</dt><dd>{registration.teamName}</dd></div> : null}<div><dt>Status</dt><dd>{registration.status.replaceAll("_", " ")}</dd></div></dl>{actionData ? <p className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}</p> : null}<div className="button-row confirmation-actions">{awaitingGuardian ? <Link className="button button-primary" to={`/guardian/consent/${registration.id}`}>Open guardian consent</Link> : <Link className="button button-primary" to="/dashboard">Go to dashboard</Link>}{registration.teamId ? <Link className="button button-muted" to={`/dashboard/teams/${registration.teamId}`}>View team</Link> : null}{!["cancelled", "completed"].includes(registration.status) ? <Form method="post"><button className="text-button danger-text" type="submit" disabled={navigation.state === "submitting"}>{navigation.state === "submitting" ? "Cancelling…" : "Cancel registration"}</button></Form> : null}</div></section></main>;
}
