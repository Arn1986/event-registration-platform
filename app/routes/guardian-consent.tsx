import { Form, Link, data, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/guardian-consent";
import { requestOtp, verifyOtp } from "../infrastructure/auth/athlete-auth.server";
import { attachGuardianChallenge, getGuardianConsentSummary, recordGuardianConsent } from "../infrastructure/db/athlete-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const summary = await getGuardianConsentSummary(params.registrationId);
  if (!summary) throw data("Consent request not found", { status: 404 });
  const url = new URL(request.url);
  return { summary, complete: url.searchParams.get("complete") === "1", deliveryFailed: url.searchParams.get("delivery") === "failed" };
}

export async function action({ params, request }: Route.ActionArgs) {
  const summary = await getGuardianConsentSummary(params.registrationId);
  if (!summary) throw data("Consent request not found", { status: 404 });
  const formData = await request.formData(); const intent = String(formData.get("intent") ?? "verify");
  if (intent === "resend") {
    try {
      const challenge = await requestOtp(summary.guardianEmail, "guardian_consent", request);
      if (challenge.challengeId) await attachGuardianChallenge(params.registrationId, challenge.challengeId);
      return { ok: true as const, message: "A new code has been sent." };
    } catch (error) {
      return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not send a new code." }, { status: 503 });
    }
  }
  const verified = await verifyOtp(summary.guardianEmail, "guardian_consent", String(formData.get("code") ?? ""));
  if (!verified.ok) return data({ ok: false as const, message: verified.error }, { status: 400 });
  if (!(await recordGuardianConsent(params.registrationId, verified.email, verified.challengeId))) return data({ ok: false as const, message: "This consent request no longer matches the verification code." }, { status: 409 });
  return redirect(`/guardian/consent/${params.registrationId}?complete=1`);
}

export default function GuardianConsent({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const { summary } = loaderData;
  if (loaderData.complete || summary.consentedAt) return <main className="narrow-page section-space"><section className="confirmation-card"><span className="confirmation-mark">✓</span><span className="eyebrow eyebrow-dark">Consent recorded</span><h1>Thank you</h1><p>Guardian consent for {summary.eventName} has been securely recorded. The athlete can review the registration from their dashboard.</p><Link className="button button-primary" to="/">Return to events</Link></section></main>;
  return <main className="narrow-page section-space"><section className="form-card"><span className="eyebrow eyebrow-dark">Guardian consent</span><h1>Review and approve</h1><p><strong>{summary.guardianName}</strong>, you were named as the athlete’s {summary.relationship}. Enter the code sent to {summary.guardianEmail} after reviewing the waiver.</p>{loaderData.deliveryFailed ? <p className="form-message form-error">The first code could not be delivered. Use “Send a new code” below.</p> : null}<div className="waiver-text guardian-waiver"><h2>{summary.waiverTitle}</h2>{summary.waiverContent}</div><Form method="post" className="form-stack"><input type="hidden" name="intent" value="verify" /><label>Six-digit code<input className="otp-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><button className="button button-primary button-full" type="submit" disabled={navigation.state === "submitting"}>{navigation.state === "submitting" ? "Recording…" : "Verify and give consent"}</button></Form>{actionData ? <p className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}</p> : null}<Form method="post" className="inline-form"><input type="hidden" name="intent" value="resend" /><button className="text-button" type="submit">Send a new code</button></Form></section></main>;
}
