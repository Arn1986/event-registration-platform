import { describe, expect, it } from "vitest";
import { raceEntrySettingsSchema, teamReadiness } from "../app/domain/teams/team-rules";

describe("team rules", () => {
  it("requires maximum size to cover minimum size", () => expect(raceEntrySettingsSchema.safeParse({ entryModes: ["team"], teamMinSize: 4, teamMaxSize: 3 }).success).toBe(false));
  it("marks a team ready at its minimum", () => { expect(teamReadiness(2, 3)).toBe("forming"); expect(teamReadiness(3, 3)).toBe("ready"); });
});
