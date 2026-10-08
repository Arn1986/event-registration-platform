import { Form, data, redirect } from "react-router";
import type { Route } from "./+types/organizer-login";
import {
  createOrganizerSession,
  getOrganizerSession,
  organizerAuthConfigured,
  sanitizeOrganizerNext,
} from "../infrastructure/auth/organizer-session.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOrganizerSession(request)) throw redirect("/organizer");
  const rawNext = new URL(request.url).searchParams.get("next");
  return {
    configured: organizerAuthConfigured(),
    next: sanitizeOrganizerNext(rawNext),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const result = await createOrganizerSession(String(formData.get("accessKey") ?? ""));
  if (!result.ok) return data({ error: result.error }, { status: 401 });
  const rawNext = String(formData.get("next") ?? "/organizer");
  const safeNext = sanitizeOrganizerNext(rawNext);

  const headers = new Headers();
  for (const c of result.cookies) {
    headers.append("Set-Cookie", c);
  }

  return redirect(safeNext, { headers });
}

export default function OrganizerLogin({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="narrow-page section-space">
      <section className="form-card organizer-login-card">
        <div className="login-logo-wrap">
          <img src="/images/logo.png" alt="3F Striders" className="login-logo" width="64" height="64" />
        </div>
        <span className="eyebrow eyebrow-dark">Organizer access</span>
        <h1>Manage 3F events</h1>
        {!loaderData.configured ? (
          <div className="setup-notice"><strong>Setup required</strong><p>Add `ORGANIZER_SETUP_TOKEN` and `SESSION_SECRET` as encrypted Worker secrets before organizer access can be used.</p></div>
        ) : null}
        <Form method="post" className="form-stack">
          <input type="hidden" name="next" value={loaderData.next} />
          <label htmlFor="accessKey">Organizer access key (default: striders2027)</label>
          <input id="accessKey" name="accessKey" type="password" autoComplete="current-password" placeholder="striders2027" required />
          <button className="button button-primary button-full" type="submit" disabled={!loaderData.configured}>Continue securely</button>
        </Form>
        {actionData?.error ? <p className="form-message form-error">{actionData.error}</p> : null}
      </section>
    </main>
  );
}
