import { redirect } from "react-router";
import type { Route } from "./+types/organizer-logout";
import { clearOrganizerCookies } from "../infrastructure/auth/organizer-session.server";

export async function loader({}: Route.LoaderArgs) { return redirect("/organizer/login"); }
export async function action({}: Route.ActionArgs) {
  const headers = new Headers();
  for (const c of clearOrganizerCookies()) {
    headers.append("Set-Cookie", c);
  }
  return redirect("/organizer/login", { headers });
}
