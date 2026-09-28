import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("events/:eventSlug", "routes/event-detail.tsx"),
  route("events/:eventSlug/register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("organizer", "routes/organizer.tsx"),
] satisfies RouteConfig;
