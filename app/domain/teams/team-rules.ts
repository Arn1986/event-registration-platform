import { z } from "zod";

export const entryTypes = ["individual", "team", "relay"] as const;
export type EntryType = typeof entryTypes[number];

export const raceEntrySettingsSchema = z.object({
  entryModes: z.array(z.enum(entryTypes)).min(1),
  teamMinSize: z.coerce.number().int().min(2).max(100),
  teamMaxSize: z.coerce.number().int().min(2).max(100),
}).refine((value) => value.teamMaxSize >= value.teamMinSize, { message: "Maximum team size must be at least the minimum." });

export function teamReadiness(memberCount: number, minimum: number) {
  return memberCount >= minimum ? "ready" as const : "forming" as const;
}

