export type EventStatus = "draft" | "published" | "closed" | "cancelled" | "completed";

const allowedTransitions: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["draft", "closed", "cancelled", "completed"],
  closed: ["published", "cancelled", "completed"],
  cancelled: [],
  completed: [],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus) {
  return allowedTransitions[from].includes(to);
}
