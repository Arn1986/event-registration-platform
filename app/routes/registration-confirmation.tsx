import { Link, data } from "react-router";

import type { Route } from "./+types/registration-confirmation";
import { requireAthlete } from "../infrastructure/auth/athlete-auth.server";
import { getAthleteRegistration } from "../infrastructure/db/athlete-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const athlete = await requireAthlete(request);
  const registration = await getAthleteRegistration(athlete.userId, params.registrationId);
  if (!registration) throw data("Registration not found", { status: 404 });
  return { registration };
}

export default function RegistrationConfirmation({ loaderData }: Route.ComponentProps) {
  const { registration } = loaderData;
  const awaitingGuardian = registration.status === "awaiting_guardian_consent";
  return <main className="narrow-page section-space"><section className="confirmation-card"><span className="confirmation-mark">{awaitingGuardian ? "…" : "✓"}</span><span className="eyebrow eyebrow-dark">Registration details saved</span><h1>{awaitingGuardian ? "Guardian consent needed" : "You’re all set for review"}</h1><p>{awaitingGuardian ? `A verification code was sent to ${registration.guardianEmail}. The registration remains pending until consent is recorded.` : "Your athlete details, answers, and waiver acceptance are securely stored. Final confirmation and capacity assignment will appear here when registration processing is enabled."}</p><dl className="stacked-facts confirmation-facts"><div><dt>Event</dt><dd>{registration.eventName}</dd></div><div><dt>Race</dt><dd>{registration.raceName}</dd></div>{registration.categoryName ? <div><dt>Category</dt><dd>{registration.categoryName}</dd></div> : null}<div><dt>Status</dt><dd>{registration.status.replaceAll("_", " ")}</dd></div></dl>{awaitingGuardian ? <Link className="button button-primary" to={`/guardian/consent/${registration.id}`}>Open guardian consent</Link> : <Link className="button button-primary" to="/dashboard">Go to dashboard</Link>}</section></main>;
}
