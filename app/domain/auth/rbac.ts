export const organizerRoles = ["owner", "admin", "event_manager", "registration_reviewer"] as const;
export type OrganizerRole = (typeof organizerRoles)[number];

export const organizerPermissions = [
  "events.view", "events.create", "events.edit", "events.publish", "events.delete",
  "registrations.view", "registrations.edit", "staff.view", "staff.manage", "audit.view",
] as const;
export type OrganizerPermission = (typeof organizerPermissions)[number];

export const rolePermissions: Record<OrganizerRole, readonly OrganizerPermission[]> = {
  owner: organizerPermissions,
  admin: organizerPermissions.filter((permission) => permission !== "events.delete"),
  event_manager: ["events.view", "events.create", "events.edit", "events.publish", "registrations.view", "registrations.edit"],
  registration_reviewer: ["events.view", "registrations.view", "registrations.edit"],
};

export function hasPermission(role: OrganizerRole, permission: OrganizerPermission) {
  return rolePermissions[role].includes(permission);
}
