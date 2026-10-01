import { data, redirect } from "react-router";

import type { Route } from "./+types/team-invitation";
import { resolveInvitation } from "../infrastructure/db/team-repository.server";

export async function loader({ params }: Route.LoaderArgs) {
  const invitation = await resolveInvitation(params.token);
  if (!invitation) throw data("This team invitation is invalid or has expired.", { status: 404 });
  return redirect(`/events/${invitation.team.eventSlug}/register?race=${invitation.team.raceId}&invite=${encodeURIComponent(params.token)}`);
}

