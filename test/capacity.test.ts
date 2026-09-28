import { describe, expect, it } from "vitest";
import { decideCapacity } from "../app/domain/registration/capacity";

describe("decideCapacity", () => {
  it("confirms when every applicable capacity has room", () => {
    expect(decideCapacity([{ id: "event", label: "Event", limit: 500, confirmed: 225 }, { id: "race", label: "5K", limit: 300, confirmed: 116 }]))
      .toEqual({ status: "confirmed", fullLevelIds: [] });
  });
  it("waitlists when any applicable level is full", () => {
    expect(decideCapacity([{ id: "event", label: "Event", limit: 500, confirmed: 225 }, { id: "wave-a", label: "Wave A", limit: 100, confirmed: 100 }]))
      .toEqual({ status: "waitlisted", fullLevelIds: ["wave-a"] });
  });
});
