import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/auth-verify";
import { createAthleteSession, safeNextPath, verifyOtp } from "../infrastructure/auth/athlete-auth.server";

const verificationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  purpose: z.enum(["register", "sign_in"]),
  next: z.string(),
});

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const purpose = url.searchParams.get("purpose") === "register" ? "register" : "sign_in";
  return { email, purpose, next: safeNextPath(url.searchParams.get("next")) };
}

export async function action({ request }: Route.ActionArgs) {
  const result = verificationSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!result.success) return data({ ok: false as const, message: "Enter the six-digit code from your email." }, { status: 400 });
  const verified = await verifyOtp(result.data.email, result.data.purpose, result.data.code);
  if (!verified.ok) return data({ ok: false as const, message: verified.error }, { status: 400 });
  return redirect(safeNextPath(result.data.next), { headers: { "Set-Cookie": await createAthleteSession(verified.email) } });
}

export default function AuthVerify({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return <main className="narrow-page section-space">
    <Link className="back-link" to={loaderData.next}>← Go back</Link>
    <section className="form-card compact-card">
      <span className="eyebrow eyebrow-dark">Email verification</span>
      <h1>Check your inbox</h1>
      <p>Enter the six-digit code sent to <strong>{loaderData.email}</strong>. It expires in 10 minutes.</p>
      <Form method="post" className="form-stack">
        <input type="hidden" name="email" value={loaderData.email} /><input type="hidden" name="purpose" value={loaderData.purpose} /><input type="hidden" name="next" value={loaderData.next} />
        <label>Verification code<input className="otp-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label>
        <button className="button button-primary button-full" type="submit" disabled={navigation.state === "submitting"}>{navigation.state === "submitting" ? "Checking…" : "Verify and continue"}</button>
      </Form>
      {actionData ? <p className="form-message form-error">{actionData.message}</p> : null}
    </section>
  </main>;
}

