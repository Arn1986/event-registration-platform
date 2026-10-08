/**
 * Sanitizes redirect target URLs for the organizer area.
 * Strips React Router Single Fetch (.data) suffixes, normalizes aliases,
 * prevents redirect loops to login/logout, and ensures open redirect safety.
 */
export function sanitizeOrganizerNext(raw: string | null | undefined): string {
  if (!raw) return "/organizer";
  let path = raw.trim();
  // Strip Single Fetch extension (.data) that React Router adds during client-side navigation
  path = path.replace(/\.data(?=([/?#]|$))/, "");
  if (!path.startsWith("/")) return "/organizer";
  // Prevent redirect loops to login or logout
  if (path.startsWith("/organizer/login") || path.startsWith("/organizer/logout")) {
    return "/organizer";
  }
  // Normalize root variations and events alias
  if (path === "/organizer/" || path === "/organizer/events" || path === "/organizer/events/") {
    return "/organizer";
  }
  if (!path.startsWith("/organizer")) {
    return "/organizer";
  }
  return path;
}
