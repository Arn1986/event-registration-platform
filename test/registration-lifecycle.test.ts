import { describe, expect, it } from "vitest";
import { canTransitionRegistration, capacityScopes } from "../app/domain/registration/registration-lifecycle";

describe("registration lifecycle", () => {
  it("allows submitted entries to confirm or waitlist", () => { expect(canTransitionRegistration("submitted", "confirmed")).toBe(true); expect(canTransitionRegistration("submitted", "waitlisted")).toBe(true); });
  it("keeps cancelled entries terminal", () => expect(canTransitionRegistration("cancelled", "confirmed")).toBe(false));
  it("builds only applicable capacity scopes", () => expect(capacityScopes({ eventId: "e", raceId: "r", categoryId: "c", waveId: null })).toEqual([{ type: "event", id: "e" }, { type: "race", id: "r" }, { type: "category", id: "c" }]));
});

