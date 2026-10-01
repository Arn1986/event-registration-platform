import { Form, Link, data } from "react-router";

import type { Route } from "./+types/organizer-registrations";
import { hasPermission } from "../domain/auth/rbac";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { getEvent } from "../infrastructure/db/event-repository.server";
import { listOrganizerRegistrations } from "../infrastructure/db/organizer-registration-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "registrations.view")) throw data("Not authorized", { status: 403 });
  const event = await getEvent(params.eventId); if (!event) throw data("Event not found", { status: 404 });
  const url = new URL(request.url); const search = url.searchParams.get("q") ?? ""; const status = url.searchParams.get("status") ?? "";
  return { event: event.event, search, status, ...(await listOrganizerRegistrations(params.eventId, search, status)) };
}

export default function OrganizerRegistrations({ loaderData }: Route.ComponentProps) {
  return <><Link className="back-link" to={`/organizer/events/${loaderData.event.id}`}>← {loaderData.event.name}</Link><div className="organizer-heading"><span className="eyebrow eyebrow-dark">Registrations</span><h1>Athlete entries</h1><p>Search, review, confirm, waitlist, or cancel event registrations.</p></div><div className="admin-grid"><article className="metric-card"><span>Total</span><strong>{loaderData.metrics.total}</strong></article><article className="metric-card"><span>Confirmed</span><strong>{loaderData.metrics.confirmed ?? 0}</strong></article><article className="metric-card"><span>Waitlisted</span><strong>{loaderData.metrics.waitlisted ?? 0}</strong></article></div><Form method="get" className="filter-bar"><input name="q" defaultValue={loaderData.search} placeholder="Name, email, reference, or team" /><select name="status" defaultValue={loaderData.status}><option value="">All statuses</option>{["awaiting_guardian_consent", "submitted", "confirmed", "waitlisted", "cancelled", "completed"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><button className="button button-muted" type="submit">Filter</button></Form><section className="table-card registration-table">{loaderData.registrations.length ? loaderData.registrations.map((registration) => <article className="registration-admin-row" key={registration.id}><div><strong>{registration.firstName} {registration.lastName}</strong><span>{registration.email} · {registration.registrationReference}</span></div><div><span>{registration.raceName}{registration.teamName ? ` · ${registration.teamName}` : ""}</span><small>{registration.entryType}</small></div><span className={`pill status-${registration.status}`}>{registration.status.replaceAll("_", " ")}</span><Link className="text-link" to={`/organizer/events/${loaderData.event.id}/registrations/${registration.id}`}>Review →</Link></article>) : <div className="empty-state"><h3>No registrations found</h3><p>Try a different filter or wait for the first athlete entry.</p></div>}</section></>;
}

