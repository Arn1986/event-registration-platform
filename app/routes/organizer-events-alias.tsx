import { redirect } from "react-router";

export function loader() {
  return redirect("/organizer");
}

export default function OrganizerEventsAlias() {
  return null;
}
