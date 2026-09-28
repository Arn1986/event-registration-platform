import { describe, expect, it } from "vitest";
import { hasPermission } from "../app/domain/auth/rbac";

describe("organizer RBAC", () => {
  it("allows owners to manage staff", () => expect(hasPermission("owner", "staff.manage")).toBe(true));
  it("prevents event managers from managing staff", () => expect(hasPermission("event_manager", "staff.manage")).toBe(false));
  it("lets registration reviewers view events", () => expect(hasPermission("registration_reviewer", "events.view")).toBe(true));
});
