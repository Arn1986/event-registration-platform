import { describe, expect, it } from "vitest";
import { canTransitionEvent } from "../app/domain/events/lifecycle";

describe("event lifecycle", () => {
  it("publishes a draft", () => expect(canTransitionEvent("draft", "published")).toBe(true));
  it("does not reopen a cancelled event", () => expect(canTransitionEvent("cancelled", "published")).toBe(false));
  it("can close and reopen a published event", () => {
    expect(canTransitionEvent("published", "closed")).toBe(true);
    expect(canTransitionEvent("closed", "published")).toBe(true);
  });
});
