import { Form, Link, data, useNavigation } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/athlete-team";
import { requireAthlete } from "../infrastructure/auth/athlete-auth.server";
import { createTeamInvitation, getTeamForAthlete, rotateTeamJoinCode } from "../infrastructure/db/team-repository.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const athlete = await requireAthlete(request); const team = await getTeamForAthlete(params.teamId, athlete.userId);
  if (!team) throw data("Team not found", { status: 404 });
  return { team };
}

export async function action({ params, request }: Route.ActionArgs) {
  const athlete = await requireAthlete(request); const team = await getTeamForAthlete(params.teamId, athlete.userId);
  if (!team) throw data("Team not found", { status: 404 });
  if (!team.isCaptain) return data({ ok: false as const, message: "Only the team captain can send invitations." }, { status: 403 });
  const formData = await request.formData();
  if (formData.get("intent") === "rotate-code") return { ok: true as const, message: "Join code rotated. Share the new code below.", joinCode: await rotateTeamJoinCode(team.id) };
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return data({ ok: false as const, message: "Enter a valid email address." }, { status: 400 });
  try { await createTeamInvitation(team.id, email.data, String(formData.get("relayLeg") ?? "").trim() || undefined, new URL(request.url).origin); return { ok: true as const, message: `Invitation sent to ${email.data}.` }; }
  catch (error) { return data({ ok: false as const, message: error instanceof Error ? error.message : "Could not send the invitation." }, { status: 500 }); }
}

export default function AthleteTeam({ loaderData, actionData }: Route.ComponentProps) {
  const { team } = loaderData; const navigation = useNavigation();
  return <main className="page-width section-space"><Link className="back-link" to="/dashboard">← Dashboard</Link><div className="organizer-heading"><span className="eyebrow eyebrow-dark">{team.entryType}</span><h1>{team.name}</h1><p>{team.eventName} · {team.raceName}</p></div><div className="team-overview"><section className="table-card"><div className="table-title"><h2>Members</h2><span className={`pill status-${team.status}`}>{team.members.length}/{team.maxSize} · {team.status}</span></div><div className="team-member-list">{team.members.map((member) => <article key={member.id}><div className="avatar">{member.firstName[0]}{member.lastName[0]}</div><div><strong>{member.firstName} {member.lastName}</strong><span>{member.role}{member.relayLeg ? ` · ${member.relayLeg}` : ""} · {member.status}</span></div><small>{member.registrationReference}</small></article>)}</div></section><aside className="admin-form-card"><h2>Team access</h2><p className="section-help">Join code ends in <strong>{team.joinCodeHint}</strong>.</p>{actionData && "joinCode" in actionData && actionData.joinCode ? <div className="team-code-panel"><span>New join code</span><strong>{actionData.joinCode}</strong></div> : null}{team.isCaptain ? <><Form method="post"><button className="text-button" name="intent" value="rotate-code" type="submit">Generate a new join code</button></Form><Form method="post" className="form-stack"><input type="hidden" name="intent" value="invite" /><label>Invite by email<input name="email" type="email" required /></label>{team.entryType === "relay" ? <label>Relay leg or role<input name="relayLeg" placeholder="Swim / Bike / Run" /></label> : null}<button className="button button-primary button-full" type="submit" disabled={navigation.state === "submitting" || team.members.length >= team.maxSize}>{navigation.state === "submitting" ? "Sending…" : "Send invitation"}</button></Form></> : <p className="section-help">Only the captain can invite more members.</p>}{actionData ? <p className={`form-message ${actionData.ok ? "form-success" : "form-error"}`}>{actionData.message}</p> : null}</aside></div></main>;
}
