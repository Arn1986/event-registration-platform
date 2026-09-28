import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("events/:eventSlug", "routes/event-detail.tsx"),
  route("events/:eventSlug/register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("organizer/login", "routes/organizer-login.tsx"),
  route("organizer/logout", "routes/organizer-logout.tsx"),
  route("organizer", "routes/organizer-layout.tsx", [
    index("routes/organizer-events.tsx"),
    route("events/new", "routes/organizer-event-new.tsx"),
    route("events/:eventId", "routes/organizer-event-editor.tsx"),
    route("staff", "routes/organizer-staff.tsx"),
  ]),
] satisfies RouteConfig;
