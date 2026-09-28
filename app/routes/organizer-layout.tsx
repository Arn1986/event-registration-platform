import { Form, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/organizer-layout";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";

export async function loader({ request }: Route.LoaderArgs) { return { session: await requireOrganizer(request) }; }

export default function OrganizerLayout({ loaderData }: Route.ComponentProps) {
  return (
    <main className="organizer-shell page-width">
      <aside className="organizer-sidebar">
        <div><span className="eyebrow eyebrow-dark">Organizer</span><strong>Event control</strong></div>
        <nav aria-label="Organizer navigation">
          <NavLink to="/organizer" end>Events</NavLink>
          <NavLink to="/organizer/staff">Staff & roles</NavLink>
        </nav>
        <div className="organizer-account"><span>{loaderData.session.email}</span><small>{loaderData.session.role.replace("_", " ")}</small><Form action="/organizer/logout" method="post"><button type="submit">Sign out</button></Form></div>
      </aside>
      <section className="organizer-content"><Outlet /></section>
    </main>
  );
}
