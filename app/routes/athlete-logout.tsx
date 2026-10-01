import { redirect } from "react-router";
import type { Route } from "./+types/athlete-logout";
import { clearAthleteSession } from "../infrastructure/auth/athlete-auth.server";

export async function action({ request }: Route.ActionArgs) {
  return redirect("/", { headers: { "Set-Cookie": await clearAthleteSession(request) } });
}
