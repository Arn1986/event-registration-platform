import { Form, Link, data } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/register";
import { exampleEvent } from "../domain/events/example-event";

export function loader({ params, request }: Route.LoaderArgs) {
  const raceId = new URL(request.url).searchParams.get("race");
  const selectedRace = exampleEvent.races.find((race) => race.id === raceId) ?? exampleEvent.races[0];
  return { eventSlug: params.eventSlug, selectedRace };
}

const emailSchema = z.string().trim().toLowerCase().email();

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const result = emailSchema.safeParse(formData.get("email"));

  if (!result.success) {
    return data({ ok: false as const, message: "Enter a valid email address." }, { status: 400 });
  }

  return { ok: true as const, message: `OTP delivery will be connected for ${result.data} in the next milestone.` };
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="narrow-page section-space">
      <Link className="back-link" to={`/events/${loaderData.eventSlug}`}>← Event details</Link>
      <div className="progress" aria-label="Registration progress"><span className="progress-active">1 Email</span><span>2 Athlete details</span><span>3 Confirmation</span></div>
      <section className="form-card">
        <span className="eyebrow eyebrow-dark">{loaderData.selectedRace.name}</span>
        <h1>Verify your email</h1>
        <p>We’ll send a one-time code to confirm your email before you complete the registration. You’ll use the same secure process to return later.</p>
        <Form method="post" className="form-stack">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="athlete@example.com" required />
          <button className="button button-primary button-full" type="submit">Send verification code</button>
        </Form>
        {actionData ? <p className={actionData.ok ? "form-message form-success" : "form-message form-error"}>{actionData.message}</p> : null}
        <p className="form-note">By continuing, you agree to receive registration-related email from 3F Striders.</p>
      </section>
    </main>
  );
}
