export type CapacityLevel = { id: string; label: string; limit: number | null; confirmed: number };
export type CapacityDecision =
  | { status: "confirmed"; fullLevelIds: [] }
  | { status: "waitlisted"; fullLevelIds: string[] };

export function decideCapacity(levels: CapacityLevel[]): CapacityDecision {
  const fullLevelIds = levels
    .filter((level) => level.limit !== null && level.confirmed >= level.limit)
    .map((level) => level.id);

  return fullLevelIds.length === 0
    ? { status: "confirmed", fullLevelIds: [] }
    : { status: "waitlisted", fullLevelIds };
}
