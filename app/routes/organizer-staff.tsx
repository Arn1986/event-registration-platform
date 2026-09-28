import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/organizer-staff";
import { hasPermission, organizerRoles, rolePermissions, type OrganizerRole } from "../domain/auth/rbac";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { inviteStaff, listStaff } from "../infrastructure/db/event-repository.server";
import { z } from "zod";

const invitationSchema = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(organizerRoles) });

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  return { staff: await listStaff(), role: session.role, canManage: hasPermission(session.role, "staff.manage") };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "staff.manage")) return data({ ok: false as const, message: "Your role cannot manage staff." }, { status: 403 });
  const result = invitationSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!result.success) return data({ ok: false as const, message: "Enter a valid email and role." }, { status: 400 });
  await inviteStaff(result.data.email, result.data.role, session.email);
  return { ok: true as const, message: `Invitation prepared for ${result.data.email}. Email delivery will be connected in Phase 2.` };
}

const roleLabels: Record<OrganizerRole, string> = { owner: "Owner", admin: "Administrator", event_manager: "Event manager", registration_reviewer: "Registration reviewer" };

export default function OrganizerStaff({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <>
      <div className="organizer-heading"><span className="eyebrow eyebrow-dark">Access control</span><h1>Staff & roles</h1><p>Assign only the access each staff member needs.</p></div>
      {actionData ? <p className={actionData.ok ? "form-message form-success" : "form-message form-error"}>{actionData.message}</p> : null}
      <div className="staff-layout">
        <section className="table-card">
          <div className="table-title"><h2>Organization staff</h2><span>{loaderData.staff.length} members</span></div>
          {loaderData.staff.length === 0 ? <div className="empty-state"><h3>No staff records yet</h3><p>Your bootstrap organizer session remains the owner until staff authentication is connected.</p></div> : loaderData.staff.map((member) => (
            <article className="staff-row" key={member.id}><div className="avatar">{member.email.slice(0, 1).toUpperCase()}</div><div><strong>{member.email}</strong><span>{roleLabels[member.role]}</span></div><span className={`pill status-${member.status}`}>{member.status}</span></article>
          ))}
        </section>
        <aside className="admin-form-card staff-invite-card">
          <h2>Invite staff</h2><p>The membership is stored now; the invitation email will activate in Phase 2.</p>
          <Form method="post" className="form-stack"><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="event_manager">{organizerRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label><button className="button button-primary button-full" type="submit" disabled={!loaderData.canManage || navigation.state === "submitting"}>Add staff member</button></Form>
        </aside>
      </div>
      <section className="permission-matrix"><h2>Permission matrix</h2><div className="permission-grid">{organizerRoles.map((role) => <article key={role}><strong>{roleLabels[role]}</strong><ul>{rolePermissions[role].map((permission) => <li key={permission}>{permission.replace(".", ": ")}</li>)}</ul></article>)}</div></section>
    </>
  );
}
