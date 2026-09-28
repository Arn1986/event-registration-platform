import { redirect } from "react-router";
import type { Route } from "./+types/organizer-logout";
import { clearOrganizerSession } from "../infrastructure/auth/organizer-session.server";

export async function loader({}: Route.LoaderArgs) { throw redirect("/organizer/login"); }
export async function action({}: Route.ActionArgs) { throw redirect("/organizer/login", { headers: { "Set-Cookie": clearOrganizerSession() } }); }
