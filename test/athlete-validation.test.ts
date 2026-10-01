import { describe, expect, it } from "vitest";
import { ageOnDate, isMinorOnEventDate } from "../app/domain/registration/athlete-validation";

describe("athlete age", () => {
  it("uses the event date rather than registration date", () => expect(isMinorOnEventDate("2009-11-01", "2027-10-31T06:00:00Z")).toBe(true));
  it("recognizes the eighteenth birthday", () => expect(isMinorOnEventDate("2009-10-31", "2027-10-31T06:00:00Z")).toBe(false));
  it("handles birthdays later in the target year", () => expect(ageOnDate("2000-12-10", "2026-10-01T00:00:00Z")).toBe(25));
});

