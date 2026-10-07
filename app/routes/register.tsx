import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/register";
import { athleteDetailsSchema, isMinorOnEventDate } from "../domain/registration/athlete-validation";
import { validateFieldAnswer } from "../domain/forms/form-validation";
import { entryTypes, type EntryType } from "../domain/teams/team-rules";
import { getAthlete, requestOtp } from "../infrastructure/auth/athlete-auth.server";
import { attachGuardianChallenge, getAthleteProfile, getAthleteRegistrationForRace, saveRegistrationSubmission } from "../infrastructure/db/athlete-repository.server";
import { getPublishedEventBySlug, validatePrivateEventAccess } from "../infrastructure/db/event-repository.server";
import { getPublishedFormBundle } from "../infrastructure/db/form-repository.server";
import { finalizeRegistration } from "../infrastructure/db/registration-engine.server";
import { createTeam, deleteEmptyTeam, markInvitationAccepted, resolveInvitation, resolveJoinCode, setTeamCaptain } from "../infrastructure/db/team-repository.server";
import { emailDeliveryConfigured } from "../infrastructure/email/email-provider.server";

const emailSchema = z.string().trim().toLowerCase().email();
const guardianSchema = z.object({ guardianName: z.string().trim().min(2).max(120), guardianEmail: z.string().trim().toLowerCase().email(), guardianRelationship: z.string().trim().min(2).max(60) });

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url); const result = await getPublishedEventBySlug(params.eventSlug);
  if (!result) throw data("Event not found", { status: 404 });
  const access = url.searchParams.get("access");
  const teamAccess = await resolveTeamAccess(url);
  if ((url.searchParams.has("invite") || url.searchParams.has("joinCode")) && !teamAccess) throw data("Team invitation or join code is invalid, expired, or full.", { status: 404 });
  if (result.event.visibility === "private" && !teamAccess && !(await validatePrivateEventAccess(result.event.id, access))) throw data("Event not found", { status: 404 });
  const selectedRace = result.races.find((race) => race.id === (teamAccess?.team.raceId ?? url.searchParams.get("race"))) ?? result.races[0];
  if (!selectedRace) throw data("No race is available for registration", { status: 400 });
  const athlete = await getAthlete(request);
  const existingRegistration = athlete ? await getAthleteRegistrationForRace(athlete.userId, selectedRace.id) : null;
  return {
    event: result.event, eventSlug: params.eventSlug, selectedRace, access, teamAccess,
    categories: result.categories.filter((category) => category.raceId === selectedRace.id),
    waves: result.waves.filter((wave) => wave.raceId === selectedRace.id),
    athlete, profile: athlete ? await getAthleteProfile(athlete.userId) : null,
    existingRegistration,
    bundle: await getPublishedFormBundle(result.event.id), emailConfigured: emailDeliveryConfigured(), submissionToken: crypto.randomUUID(),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "request_otp");
  const result = await getPublishedEventBySlug(params.eventSlug);
  if (!result) throw data("Event not found", { status: 404 });
  const requestUrl = new URL(request.url);
  const teamAccess = await resolveTeamAccess(requestUrl);
  if ((requestUrl.searchParams.has("invite") || requestUrl.searchParams.has("joinCode")) && !teamAccess) throw data("Team invitation or join code is invalid, expired, or full.", { status: 404 });
  if (result.event.visibility === "private" && !teamAccess && !(await validatePrivateEventAccess(result.event.id, requestUrl.searchParams.get("access")))) throw data("Event not found", { status: 404 });

  if (intent === "request_otp") {
    const email = emailSchema.safeParse(formData.get("email"));
    if (!email.success) return data({ ok: false as const, message: "Enter a valid email address." }, { status: 400 });
    try {
      await requestOtp(email.data, "register", request);
      return redirect(`/auth/verify?email=${encodeURIComponent(email.data)}&purpose=register&next=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`);
    } catch (error) {
      return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not send the verification code." }, { status: 503 });
    }
  }

  const identity = await getAthlete(request);
  if (!identity) return data({ ok: false as const, message: "Verify your email before submitting." }, { status: 401 });
  const athleteResult = athleteDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!athleteResult.success) return data({ ok: false as const, message: "Review the highlighted athlete and emergency-contact fields." }, { status: 400 });
  if (formData.get("profileConfirmed") !== "yes" || formData.get("waiverAccepted") !== "yes") return data({ ok: false as const, message: "Confirm your details and accept the waiver." }, { status: 400 });

  if (teamAccess?.invitation && teamAccess.invitation.email !== identity.email) return data({ ok: false as const, message: `This invitation was sent to ${teamAccess.invitation.email}. Verify that email to accept it.` }, { status: 403 });
  const raceId = String(teamAccess?.team.raceId ?? formData.get("raceId") ?? "");
  const race = result.races.find((item) => item.id === raceId);
  if (!race) return data({ ok: false as const, message: "Choose a valid race." }, { status: 400 });

  const alreadyRegistered = await getAthleteRegistrationForRace(identity.userId, race.id);
  if (alreadyRegistered) {
    return data({
      ok: false as const,
      message: `You are already registered for this race (${alreadyRegistered.registrationReference}). Each athlete can only register once per race.`,
    }, { status: 409 });
  }

  const bundle = await getPublishedFormBundle(result.event.id);
  if (!bundle) return data({ ok: false as const, message: "Registration is not open because the event form and waiver have not been published." }, { status: 409 });

  const answers = bundle.fields.map((field) => ({ field, values: formData.getAll(`field_${field.id}`).map(String) }));
  const answerError = answers.map((answer) => validateFieldAnswer(answer.field, answer.values)).find(Boolean);
  if (answerError) return data({ ok: false as const, message: answerError }, { status: 400 });
  const isMinor = isMinorOnEventDate(athleteResult.data.dateOfBirth, result.event.startsAt);
  const guardianResult = isMinor ? guardianSchema.safeParse(Object.fromEntries(formData)) : null;
  if (isMinor && !guardianResult?.success) return data({ ok: false as const, message: "Guardian name, email, and relationship are required for athletes under 18." }, { status: 400 });

  const requestedEntryType = String(teamAccess?.team.entryType ?? formData.get("entryType") ?? "individual") as EntryType;
  const submissionToken = z.string().uuid().safeParse(formData.get("submissionToken"));
  if (!submissionToken.success) return data({ ok: false as const, message: "The registration form expired. Reload the page and try again." }, { status: 400 });
  const allowedEntryTypes = JSON.parse(race.entryModesJson) as EntryType[];
  if (!entryTypes.includes(requestedEntryType) || !allowedEntryTypes.includes(requestedEntryType)) return data({ ok: false as const, message: "This race does not allow the selected entry type." }, { status: 400 });
  let createdTeam: { teamId: string; joinCode: string } | null = null;
  try {
    if (requestedEntryType !== "individual" && !teamAccess) {
      const teamName = String(formData.get("teamName") ?? "").trim();
      if (teamName.length < 2 || teamName.length > 100) return data({ ok: false as const, message: "Enter a team name between 2 and 100 characters." }, { status: 400 });
      createdTeam = await createTeam({ eventId: result.event.id, raceId, categoryId: optionalString(formData.get("categoryId")), waveId: optionalString(formData.get("waveId")), name: teamName, entryType: requestedEntryType, organizerCreated: false });
    }
    const targetTeamId = teamAccess?.team.id ?? createdTeam?.teamId;
    const saved = await saveRegistrationSubmission({
      identity, eventId: result.event.id, raceId, categoryId: teamAccess?.team.categoryId ?? optionalString(formData.get("categoryId")), waveId: teamAccess?.team.waveId ?? optionalString(formData.get("waveId")),
      formVersionId: bundle.form.id, waiver: bundle.waiver, athlete: athleteResult.data, isMinor, answers,
      guardian: guardianResult?.success ? { name: guardianResult.data.guardianName, email: guardianResult.data.guardianEmail, relationship: guardianResult.data.guardianRelationship } : undefined,
      entryType: requestedEntryType, idempotencyKey: submissionToken.data, teamId: targetTeamId,
      teamRole: createdTeam ? "captain" : targetTeamId ? "member" : undefined,
      relayLeg: teamAccess?.invitation?.relayLeg ?? optionalString(formData.get("relayLeg")),
    });
    if (saved.existing) {
      if (createdTeam) await deleteEmptyTeam(createdTeam.teamId);
      return redirect(saved.guardianEmail ? `/guardian/consent/${saved.registrationId}` : `/registrations/${saved.registrationId}/confirmation`);
    }
    if (createdTeam) await setTeamCaptain(createdTeam.teamId, saved.registrationId);
    if (teamAccess?.invitation) await markInvitationAccepted(teamAccess.invitation.invitationId);
    if (saved.guardianEmail) {
      try {
        const challenge = await requestOtp(saved.guardianEmail, "guardian_consent", request);
        if (challenge.challengeId) await attachGuardianChallenge(saved.registrationId, challenge.challengeId);
        return redirect(`/guardian/consent/${saved.registrationId}?sent=1`);
      } catch {
        return redirect(`/guardian/consent/${saved.registrationId}?delivery=failed`);
      }
    }
    await finalizeRegistration(saved.registrationId);
    const teamCode = createdTeam ? `?teamCode=${encodeURIComponent(createdTeam.joinCode)}` : "";
    return redirect(`/registrations/${saved.registrationId}/confirmation${teamCode}`);
  } catch (error) {
    if (createdTeam) await deleteEmptyTeam(createdTeam.teamId);
    return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not save the registration." }, { status: 500 });
  }
}

function optionalString(value: FormDataEntryValue | null) { const text = String(value ?? "").trim(); return text || undefined; }
async function resolveTeamAccess(url: URL) {
  const invitationToken = url.searchParams.get("invite");
  if (invitationToken) { const invitation = await resolveInvitation(invitationToken); return invitation ? { team: invitation.team, invitation } : null; }
  const joinCode = url.searchParams.get("joinCode");
  if (joinCode) { const team = await resolveJoinCode(joinCode); return team ? { team, invitation: null } : null; }
  return null;
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const backQuery = loaderData.access ? `?access=${encodeURIComponent(loaderData.access)}` : "";
  if (!loaderData.athlete) return <main className="narrow-page section-space">
    <Link className="back-link" to={`/events/${loaderData.eventSlug}${backQuery}`}>← Event details</Link>
    <div className="progress" aria-label="Registration progress"><span className="progress-active">1 Email</span><span>2 Athlete details</span><span>3 Review</span></div>
    <section className="form-card">
      <span className="eyebrow eyebrow-dark">{loaderData.selectedRace.name}</span><h1>Verify your email</h1>
      <p>We’ll send a one-time code to confirm your email before you complete the registration.</p>
      {!loaderData.emailConfigured ? <div className="setup-notice"><strong>Email delivery is not configured.</strong><p>Add the Resend secrets before requesting a code.</p></div> : null}
      <Form method="post" className="form-stack"><input type="hidden" name="intent" value="request_otp" /><label>Email address<input name="email" type="email" autoComplete="email" placeholder="athlete@example.com" required /></label><button className="button button-primary button-full" type="submit" disabled={!loaderData.emailConfigured || navigation.state === "submitting"}>{navigation.state === "submitting" ? "Sending…" : "Send verification code"}</button></Form>
      {actionData ? <p className="form-message form-error">{actionData.message}</p> : null}<p className="form-note">By continuing, you agree to receive registration-related email from 3F Striders.</p>
    </section>
  </main>;

  if (loaderData.existingRegistration) {
    return <main className="narrow-page section-space">
      <Link className="back-link" to={`/events/${loaderData.eventSlug}${backQuery}`}>← Event details</Link>
      <section className="form-card">
        <span className="eyebrow eyebrow-dark">{loaderData.selectedRace.name}</span>
        <h1>Already registered</h1>
        <p className="lead">You already have an active registration for this race.</p>
        <div className="registration-card-top" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
          <span className={`pill status-${loaderData.existingRegistration.status}`}>{loaderData.existingRegistration.status.replaceAll("_", " ")}</span>
          <strong>Ref: {loaderData.existingRegistration.registrationReference}</strong>
        </div>
        <p className="section-help">Each athlete can only register once per race. You can view your registration details, access your wallet pass, or manage your entry.</p>
        <div className="button-row" style={{ marginTop: "1.5rem" }}>
          <Link className="button button-primary" to={`/registrations/${loaderData.existingRegistration.id}/confirmation`}>View registration</Link>
          <Link className="button button-muted" to="/dashboard">Athlete dashboard</Link>
        </div>
      </section>
    </main>;
  }

  const profile = loaderData.profile;
  return <main className="registration-page page-width section-space">
    <Link className="back-link" to={`/events/${loaderData.eventSlug}${backQuery}`}>← Event details</Link>
    <div className="progress" aria-label="Registration progress"><span>1 Email ✓</span><span className="progress-active">2 Athlete details</span><span>3 Review</span></div>
    <div className="registration-layout"><div>
      <div className="organizer-heading"><span className="eyebrow eyebrow-dark">{loaderData.event.name}</span><h1>Registration details</h1><p>Every field is shown for confirmation, even when we already know you.</p></div>
      {!loaderData.bundle ? <div className="setup-notice"><strong>Registration form unavailable.</strong><p>The organizer must publish a form and waiver first.</p></div> : null}
      <Form method="post" className="registration-form">
        <input type="hidden" name="intent" value="submit" /><input type="hidden" name="raceId" value={loaderData.selectedRace.id} /><input type="hidden" name="submissionToken" value={loaderData.submissionToken} />
        <FormSection title="Race selection">{loaderData.teamAccess ? <div className="team-join-banner"><strong>Joining {loaderData.teamAccess.team.name}</strong><span>{loaderData.teamAccess.team.entryType} entry · {loaderData.teamAccess.team.memberCount}/{loaderData.teamAccess.team.maxSize} members</span></div> : null}<div className="field-grid"><label>Race<input value={loaderData.selectedRace.name} readOnly /></label>{!loaderData.teamAccess ? <label>Entry type<select name="entryType" defaultValue={(JSON.parse(loaderData.selectedRace.entryModesJson) as string[])[0]}>{(JSON.parse(loaderData.selectedRace.entryModesJson) as EntryType[]).map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label> : <input type="hidden" name="entryType" value={loaderData.teamAccess.team.entryType} />}{!loaderData.teamAccess && loaderData.categories.length ? <label>Category<select name="categoryId" required><option value="">Choose category</option>{loaderData.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}{!loaderData.teamAccess && loaderData.waves.length ? <label>Wave<select name="waveId" required><option value="">Choose wave</option>{loaderData.waves.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}</div>{!loaderData.teamAccess && (JSON.parse(loaderData.selectedRace.entryModesJson) as string[]).some((mode) => mode !== "individual") ? <div className="field-grid"><TextField name="teamName" label="Team name (for team or relay entry)" required={false} /><TextField name="relayLeg" label="Relay leg or role (optional)" required={false} /></div> : null}</FormSection>
        <FormSection title="Athlete profile"><div className="field-grid"><TextField name="firstName" label="First name" value={profile?.firstName} autoComplete="given-name" /><TextField name="lastName" label="Last name" value={profile?.lastName} autoComplete="family-name" /><TextField name="dateOfBirth" label="Date of birth" value={profile?.dateOfBirth} type="date" /><TextField name="phone" label="Mobile number" value={profile?.phone} autoComplete="tel" /><TextField name="nationality" label="Nationality" value={profile?.nationality} /><TextField name="clubName" label="Club or team (optional)" value={profile?.clubName} required={false} /></div></FormSection>
        <FormSection title="Emergency and medical"><div className="field-grid"><TextField name="emergencyContactName" label="Emergency contact name" value={profile?.emergencyContactName} /><TextField name="emergencyContactPhone" label="Emergency contact phone" value={profile?.emergencyContactPhone} autoComplete="tel" /></div><label>Medical notes (optional)<textarea name="medicalNotes" rows={4} defaultValue={profile?.medicalNotes} placeholder="Allergies, conditions, or information the event medical team should know" /></label><p className="privacy-note">Medical notes are encrypted and never included in emails or wallet passes.</p></FormSection>
        {loaderData.bundle?.fields.length ? <FormSection title={loaderData.bundle.form.title}>{loaderData.bundle.fields.map((field) => <CustomField key={field.id} field={field} />)}</FormSection> : null}
        <FormSection title="Guardian details"><p className="section-help">Required only if the athlete will be under 18 on event day. The guardian receives a separate consent code.</p><div className="field-grid"><TextField name="guardianName" label="Guardian full name" required={false} /><TextField name="guardianEmail" label="Guardian email" type="email" required={false} /><TextField name="guardianRelationship" label="Relationship" required={false} /></div></FormSection>
        {loaderData.bundle ? <FormSection title={loaderData.bundle.waiver.title}><div className="waiver-text">{loaderData.bundle.waiver.content}</div><label className="check-row"><input type="checkbox" name="waiverAccepted" value="yes" required /><span>I have read and accept this waiver.</span></label></FormSection> : null}
        <section className="form-section final-review"><label className="check-row"><input type="checkbox" name="profileConfirmed" value="yes" required /><span>I reviewed every field and confirm the information is accurate.</span></label>{actionData ? <p className="form-message form-error">{actionData.message}</p> : null}<button className="button button-primary button-full" type="submit" disabled={!loaderData.bundle || navigation.state === "submitting"}>{navigation.state === "submitting" ? "Saving…" : "Submit registration details"}</button></section>
      </Form>
    </div><aside className="info-card registration-summary"><span className="eyebrow eyebrow-dark">Your entry</span><h2>{loaderData.selectedRace.name}</h2><dl className="stacked-facts"><div><dt>Event</dt><dd>{loaderData.event.name}</dd></div><div><dt>Starts</dt><dd>{new Date(loaderData.selectedRace.startsAt).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</dd></div><div><dt>Venue</dt><dd>{loaderData.event.venueName}</dd></div><div><dt>Verified email</dt><dd>{loaderData.athlete.email}</dd></div></dl></aside></div>
  </main>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="form-section"><h2>{title}</h2>{children}</section>; }
function TextField({ name, label, value, type = "text", required = true, autoComplete }: { name: string; label: string; value?: string | null; type?: string; required?: boolean; autoComplete?: string }) { return <label>{label}<input name={name} type={type} defaultValue={value ?? ""} required={required} autoComplete={autoComplete} /></label>; }
function CustomField({ field }: { field: NonNullable<Awaited<ReturnType<typeof getPublishedFormBundle>>>["fields"][number] }) {
  const name = `field_${field.id}`; const required = field.required;
  if (field.type === "long_text") return <label>{field.label}<textarea name={name} rows={4} required={required} />{field.helpText ? <small>{field.helpText}</small> : null}</label>;
  if (field.type === "single_select") return <label>{field.label}<select name={name} required={required}><option value="">Choose one</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>{field.helpText ? <small>{field.helpText}</small> : null}</label>;
  if (field.type === "multi_select") return <fieldset><legend>{field.label}</legend>{field.options.map((option) => <label className="check-row" key={option}><input type="checkbox" name={name} value={option} /><span>{option}</span></label>)}{field.helpText ? <small>{field.helpText}</small> : null}</fieldset>;
  if (field.type === "checkbox") return <label className="check-row"><input type="checkbox" name={name} value="yes" required={required} /><span>{field.label}</span></label>;
  return <label>{field.label}<input name={name} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} required={required} />{field.helpText ? <small>{field.helpText}</small> : null}</label>;
}
