export const registrationStatuses = ["draft", "awaiting_guardian_consent", "submitted", "confirmed", "waitlisted", "cancelled", "completed"] as const;
export type RegistrationStatus = typeof registrationStatuses[number];

const transitions: Record<RegistrationStatus, RegistrationStatus[]> = {
  draft: ["awaiting_guardian_consent", "submitted", "cancelled"],
  awaiting_guardian_consent: ["submitted", "cancelled"],
  submitted: ["confirmed", "waitlisted", "cancelled"],
  confirmed: ["waitlisted", "cancelled", "completed"],
  waitlisted: ["confirmed", "cancelled"],
  cancelled: [],
  completed: [],
};

export function canTransitionRegistration(from: RegistrationStatus, to: RegistrationStatus) {
  return transitions[from].includes(to);
}

export function isActiveRegistrationStatus(status: RegistrationStatus | string): boolean {
  return status !== "cancelled";
}

export type RegistrationSelection = { eventId: string; raceId: string; categoryId: string | null; waveId: string | null };
export function capacityScopes(selection: RegistrationSelection) {
  return [
    { type: "event" as const, id: selection.eventId },
    { type: "race" as const, id: selection.raceId },
    ...(selection.categoryId ? [{ type: "category" as const, id: selection.categoryId }] : []),
    ...(selection.waveId ? [{ type: "wave" as const, id: selection.waveId }] : []),
  ];
}

