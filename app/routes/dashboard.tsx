import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/dashboard";
import { getAthlete, requestOtp, safeNextPath } from "../infrastructure/auth/athlete-auth.server";
import { emailDeliveryConfigured } from "../infrastructure/email/email-provider.server";
import { listAthleteRegistrations } from "../infrastructure/db/athlete-repository.server";

export function meta({}: Route.MetaArgs) { return [{ title: "Athlete dashboard | 3F Striders" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const athlete = await getAthlete(request);
  const url = new URL(request.url);
  return { athlete, registrations: athlete ? await listAthleteRegistrations(athlete.userId) : [], next: safeNextPath(url.searchParams.get("next")), emailConfigured: emailDeliveryConfigured() };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));
  if (!email.success) return data({ ok: false as const, message: "Enter a valid email address." }, { status: 400 });
  try {
    await requestOtp(email.data, "sign_in", request);
    return redirect(`/auth/verify?email=${encodeURIComponent(email.data)}&purpose=sign_in&next=${encodeURIComponent(next)}`);
  } catch (error) {
    return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not send the verification code." }, { status: 503 });
  }
}

export default function Dashboard({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  if (!loaderData.athlete) return <main className="narrow-page section-space">
    <span className="eyebrow eyebrow-dark">Athlete access</span><h1>Your race dashboard</h1>
    <p className="lead">Enter your email to receive a one-time access code. No password required.</p>
    <section className="form-card compact-card">
      {!loaderData.emailConfigured ? <div className="setup-notice"><strong>Email delivery is not configured.</strong><p>Add the Resend secrets before requesting a code.</p></div> : null}
      <Form method="post" className="form-stack">
        <input type="hidden" name="next" value={loaderData.next} />
        <label htmlFor="dashboard-email">Email address<input id="dashboard-email" name="email" type="email" autoComplete="email" placeholder="athlete@example.com" required /></label>
        <button className="button button-primary button-full" type="submit" disabled={!loaderData.emailConfigured || navigation.state === "submitting"}>{navigation.state === "submitting" ? "Sending…" : "Email me a code"}</button>
      </Form>
      {actionData ? <p className="form-message form-error">{actionData.message}</p> : null}
    </section>
    <Link className="back-link" to="/">← Return to events</Link>
  </main>;

  return <main className="page-width section-space">
    <div className="dashboard-heading"><div><span className="eyebrow eyebrow-dark">Athlete dashboard</span><h1>Your registrations</h1><p className="lead">Signed in as {loaderData.athlete.email}</p></div><div className="button-row compact-buttons"><Link className="button button-muted" to="/teams/join">Join a team</Link><Form action="/athlete/logout" method="post"><button className="button button-muted" type="submit">Sign out</button></Form></div></div>
    {loaderData.registrations.length ? <div className="registration-grid">{loaderData.registrations.map((registration) => <article className="registration-card" key={registration.id}>
      <div className="registration-card-top"><span className={`pill status-${registration.status}`}>{registration.status.replaceAll("_", " ")}</span><time>{new Date(registration.eventStartsAt).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" })}</time></div>
      <h2>{registration.eventName}</h2><p>{registration.raceName}{registration.categoryName ? ` · ${registration.categoryName}` : ""}{registration.waveName ? ` · ${registration.waveName}` : ""}</p>{registration.teamName ? <p><strong>{registration.teamName}</strong> · {registration.entryType}</p> : null}<p>{registration.venueName}</p>
      <div className="card-links"><Link className="text-link" to={`/registrations/${registration.id}/confirmation`}>View registration →</Link>{registration.teamId ? <Link className="text-link" to={`/dashboard/teams/${registration.teamId}`}>Team →</Link> : null}</div>
    </article>)}</div> : <div className="empty-state public-empty"><h3>No registrations yet</h3><p>Choose an event to start your first registration.</p><Link className="button button-primary" to="/">Browse events</Link></div>}
  </main>;
}
