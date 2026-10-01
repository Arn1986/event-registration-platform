import { Form, Link, data, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/organizer-teams";
import { hasPermission } from "../domain/auth/rbac";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { getEvent } from "../infrastructure/db/event-repository.server";
import { addRegistrationToTeamByReference, createTeam, createTeamInvitation, listOrganizerTeams, rotateTeamJoinCode } from "../infrastructure/db/team-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request); const event = await getEvent(params.eventId);
  if (!event) throw data("Event not found", { status: 404 });
  return { ...event, teams: await listOrganizerTeams(params.eventId), canEdit: hasPermission(session.role, "registrations.edit") };
}

export async function action({ params, request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "registrations.edit")) return data({ ok: false as const, message: "Your role cannot manage teams." }, { status: 403 });
  const formData = await request.formData(); const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "create") {
      const parsed = z.object({ name: z.string().trim().min(2).max(100), raceId: z.string().min(1), entryType: z.enum(["team", "relay"]) }).safeParse(Object.fromEntries(formData));
      if (!parsed.success) return data({ ok: false as const, message: "Enter a team name, race, and entry type." }, { status: 400 });
      const created = await createTeam({ eventId: params.eventId, raceId: parsed.data.raceId, categoryId: optionalString(formData.get("categoryId")), waveId: optionalString(formData.get("waveId")), name: parsed.data.name, entryType: parsed.data.entryType, organizerCreated: true });
      return { ok: true as const, message: "Team created. Copy the join code now.", joinCode: created.joinCode };
    }
    if (intent === "add-registration") { await addRegistrationToTeamByReference(String(formData.get("teamId")), String(formData.get("registrationReference")), params.eventId); return { ok: true as const, message: "Registration added to the team." }; }
    if (intent === "invite") {
      const email = z.string().trim().toLowerCase().email().parse(formData.get("email"));
      await createTeamInvitation(String(formData.get("teamId")), email, String(formData.get("relayLeg") ?? "").trim() || undefined, new URL(request.url).origin, params.eventId);
      return { ok: true as const, message: `Invitation sent to ${email}.` };
    }
    if (intent === "rotate-code") return { ok: true as const, message: "Join code rotated. Copy it now.", joinCode: await rotateTeamJoinCode(String(formData.get("teamId")), params.eventId) };
    return data({ ok: false as const, message: "Unknown team action." }, { status: 400 });
  } catch (error) { return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not update the team." }, { status: 400 }); }
}

export default function OrganizerTeams({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const busy = navigation.state === "submitting";
  return <><Link className="back-link" to={`/organizer/events/${loaderData.event.id}`}>← {loaderData.event.name}</Link><div className="organizer-heading"><span className="eyebrow eyebrow-dark">Teams & relays</span><h1>Team management</h1><p>Create organizer-managed teams, invite athletes, or attach an existing registration.</p></div>{actionData ? <div className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}{"joinCode" in actionData && actionData.joinCode ? <div className="inline-code"><strong>{actionData.joinCode}</strong></div> : null}</div> : null}<div className="team-management-layout"><section className="table-card"><div className="table-title"><h2>Teams</h2><span className="pill">{loaderData.teams.length}</span></div>{loaderData.teams.length ? <div className="organizer-team-list">{loaderData.teams.map((team) => <article key={team.id}><div><strong>{team.name}</strong><span>{team.raceName} · {team.entryType} · code ends {team.joinCodeHint}</span></div><div className="team-row-actions"><span className={`pill status-${team.status}`}>{team.memberCount}/{team.maxSize} · {team.status}</span><Form method="post"><input type="hidden" name="intent" value="rotate-code" /><input type="hidden" name="teamId" value={team.id} /><button className="text-button" type="submit">New code</button></Form></div></article>)}</div> : <div className="empty-state"><h3>No teams yet</h3><p>Create one here or let an athlete captain create one during registration.</p></div>}</section><aside className="admin-form-card"><h2>Create a team</h2><Form method="post" className="form-stack"><input type="hidden" name="intent" value="create" /><label>Team name<input name="name" required /></label><label>Race<select name="raceId">{loaderData.races.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}</select></label>{loaderData.categories.length ? <label>Category<select name="categoryId"><option value="">No category</option>{loaderData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}{loaderData.waves.length ? <label>Wave<select name="waveId"><option value="">No wave</option>{loaderData.waves.map((wave) => <option key={wave.id} value={wave.id}>{wave.name}</option>)}</select></label> : null}<label>Entry type<select name="entryType"><option value="team">Team</option><option value="relay">Relay</option></select></label><button className="button button-primary button-full" type="submit" disabled={!loaderData.canEdit || busy}>Create team</button></Form></aside></div>{loaderData.teams.length ? <div className="subforms-grid editor-section"><section className="admin-form-card"><h2>Invite an athlete</h2><Form method="post" className="form-stack"><input type="hidden" name="intent" value="invite" /><label>Team<select name="teamId">{loaderData.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Email<input name="email" type="email" required /></label><label>Relay leg or role<input name="relayLeg" /></label><button className="button button-primary" type="submit" disabled={!loaderData.canEdit || busy}>Send invitation</button></Form></section><section className="admin-form-card"><h2>Add existing registration</h2><Form method="post" className="form-stack"><input type="hidden" name="intent" value="add-registration" /><label>Team<select name="teamId">{loaderData.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Registration reference<input name="registrationReference" placeholder="3FS-AB12CD34" required /></label><button className="button button-primary" type="submit" disabled={!loaderData.canEdit || busy}>Add registration</button></Form></section></div> : null}</>;
}

function optionalString(value: FormDataEntryValue | null) { const text = String(value ?? "").trim(); return text || undefined; }
