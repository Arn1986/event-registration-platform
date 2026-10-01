import { Form, Link, data, useNavigation } from "react-router";

import type { Route } from "./+types/organizer-registration-detail";
import { hasPermission } from "../domain/auth/rbac";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { enqueueRegistrationDelivery } from "../infrastructure/communications/delivery-queue.server";
import { getEvent } from "../infrastructure/db/event-repository.server";
import { assignBibNumber, getOrganizerRegistration } from "../infrastructure/db/organizer-registration-repository.server";
import { cancelRegistration, finalizeRegistration, moveToWaitlist } from "../infrastructure/db/registration-engine.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "registrations.view")) throw data("Not authorized", { status: 403 });
  const [event, registration] = await Promise.all([getEvent(params.eventId), getOrganizerRegistration(params.eventId, params.registrationId, session.role === "owner" || session.role === "admin")]);
  if (!event || !registration) throw data("Registration not found", { status: 404 });
  return { event: event.event, registration, canEdit: hasPermission(session.role, "registrations.edit") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "registrations.edit")) return data({ ok: false as const, message: "Your role cannot change registrations." }, { status: 403 });
  if (!(await getOrganizerRegistration(params.eventId, params.registrationId, false))) throw data("Registration not found", { status: 404 });
  const formData = await request.formData(); const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "confirm") { const result = await finalizeRegistration(params.registrationId, "organizer", session.email); return { ok: true as const, message: result.status === "confirmed" ? "Registration confirmed." : "Capacity is full; registration remains waitlisted." }; }
    if (intent === "waitlist") { await moveToWaitlist(params.registrationId, session.email); return { ok: true as const, message: "Registration moved to the waitlist." }; }
    if (intent === "cancel") { await cancelRegistration(params.registrationId, "organizer", session.email, "organizer cancellation"); return { ok: true as const, message: "Registration cancelled." }; }
    if (intent === "assign-bib") {
      const bib = await assignBibNumber(params.eventId, params.registrationId, String(formData.get("bibNumber") ?? ""), session.email);
      await enqueueRegistrationDelivery({ type: "registration_updated", registrationId: params.registrationId, message: `Bib ${bib} has been assigned` });
      return { ok: true as const, message: `Bib ${bib} assigned and wallet pass updated.` };
    }
    if (intent === "retry-delivery") { await enqueueRegistrationDelivery({ type: "confirmed", registrationId: params.registrationId, force: true, deliveryVersion: crypto.randomUUID() }); return { ok: true as const, message: "Confirmation and wallet delivery retry queued." }; }
    return data({ ok: false as const, message: "Unknown action." }, { status: 400 });
  } catch (error) { return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not update the registration." }, { status: 400 }); }
}

export default function OrganizerRegistrationDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { registration } = loaderData; const navigation = useNavigation(); const busy = navigation.state === "submitting";
  return <><Link className="back-link" to={`/organizer/events/${loaderData.event.id}/registrations`}>← Registrations</Link><div className="editor-title-row"><div><span className={`pill status-${registration.status}`}>{registration.status.replaceAll("_", " ")}</span><h1>{registration.firstName} {registration.lastName}</h1><p>{registration.email} · {registration.registrationReference}</p></div><div className="publish-actions"><Form method="post"><button name="intent" value="confirm" className="button button-primary" disabled={!loaderData.canEdit || busy}>Confirm</button></Form><Form method="post"><button name="intent" value="waitlist" className="button button-muted" disabled={!loaderData.canEdit || busy}>Waitlist</button></Form><Form method="post"><button name="intent" value="cancel" className="button button-muted danger-text" disabled={!loaderData.canEdit || busy}>Cancel</button></Form></div></div>{actionData ? <p className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}</p> : null}<div className="registration-review-grid"><section className="table-card"><h2>Registration</h2><dl className="review-facts"><div><dt>Race</dt><dd>{registration.raceName}</dd></div><div><dt>Entry</dt><dd>{registration.entryType}{registration.teamName ? ` · ${registration.teamName}` : ""}</dd></div><div><dt>Bib</dt><dd>{registration.bibNumber ?? "Not assigned"}</dd></div>{Object.entries(registration.athleteSnapshot).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value || "—")}</dd></div>)}<div><dt>Medical notes</dt><dd>{registration.medicalNotes || "None provided"}</dd></div></dl>{registration.status === "confirmed" ? <Form method="post" className="bib-form"><label>Bib number<input name="bibNumber" defaultValue={registration.bibNumber ?? ""} maxLength={24} required /></label><button className="button button-muted" name="intent" value="assign-bib" disabled={!loaderData.canEdit || busy}>Assign and update pass</button></Form> : null}</section><section className="table-card"><h2>Custom answers</h2>{registration.answers.length ? <dl className="review-facts">{registration.answers.map((answer) => <div key={answer.label}><dt>{answer.label}{answer.sensitive ? " · sensitive" : ""}</dt><dd>{Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value || "—")}</dd></div>)}</dl> : <p className="section-help">No custom answers.</p>}<h2 className="subheading">Consent</h2>{registration.consents.map((consent, index) => <p className="section-help" key={index}>{consent.actorType} accepted {new Date(consent.acceptedAt).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}</p>)}</section></div><section className="editor-section table-card"><div className="table-title"><h2>Delivery</h2>{registration.status === "confirmed" ? <Form method="post"><button className="text-button" name="intent" value="retry-delivery" disabled={!loaderData.canEdit || busy}>Retry confirmation & wallet</button></Form> : null}</div><p className="section-help">Wallet: {registration.walletStatus ?? "not issued"}{registration.walletError ? ` · ${registration.walletError}` : ""}</p><div className="history-list">{registration.deliveries.length ? registration.deliveries.map((item, index) => <article key={index}><span>{item.messageType} · <strong>{item.status}</strong></span><small>{item.channel} · {item.provider} · {new Date(item.createdAt).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}{item.errorMessage ? ` · ${item.errorMessage}` : ""}</small></article>) : <p className="section-help">No delivery attempts yet.</p>}</div></section><section className="editor-section table-card"><h2>Status history</h2><div className="history-list">{registration.history.length ? registration.history.map((item, index) => <article key={index}><span>{item.fromStatus ?? "created"} → <strong>{item.toStatus}</strong></span><small>{item.actorType}{item.actorReference ? ` · ${item.actorReference}` : ""} · {new Date(item.createdAt).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}</small></article>) : <p className="section-help">No status changes recorded yet.</p>}</div></section></>;
}

function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()); }
