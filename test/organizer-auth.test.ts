import { describe, expect, it } from "vitest";
import {
  sanitizeOrganizerNext,
} from "../app/domain/auth/organizer-paths";

describe("organizer auth URL sanitization", () => {
  it("defaults to /organizer when next is empty or null", () => {
    expect(sanitizeOrganizerNext(null)).toBe("/organizer");
    expect(sanitizeOrganizerNext("")).toBe("/organizer");
    expect(sanitizeOrganizerNext("   ")).toBe("/organizer");
  });

  it("strips React Router single fetch .data extensions", () => {
    expect(sanitizeOrganizerNext("/organizer.data")).toBe("/organizer");
    expect(sanitizeOrganizerNext("/organizer.data?foo=bar")).toBe("/organizer?foo=bar");
    expect(sanitizeOrganizerNext("/organizer/hero.data")).toBe("/organizer/hero");
    expect(sanitizeOrganizerNext("/organizer/staff.data")).toBe("/organizer/staff");
  });

  it("normalizes root and alias paths", () => {
    expect(sanitizeOrganizerNext("/organizer/")).toBe("/organizer");
    expect(sanitizeOrganizerNext("/organizer/events")).toBe("/organizer");
    expect(sanitizeOrganizerNext("/organizer/events/")).toBe("/organizer");
  });

  it("prevents redirect loops back to login/logout", () => {
    expect(sanitizeOrganizerNext("/organizer/login")).toBe("/organizer");
    expect(sanitizeOrganizerNext("/organizer/logout")).toBe("/organizer");
  });

  it("preserves valid organizer subroutes and query params", () => {
    expect(sanitizeOrganizerNext("/organizer/hero")).toBe("/organizer/hero");
    expect(sanitizeOrganizerNext("/organizer/staff")).toBe("/organizer/staff");
    expect(sanitizeOrganizerNext("/organizer/events/new")).toBe("/organizer/events/new");
    expect(sanitizeOrganizerNext("/organizer/events/ev_123")).toBe("/organizer/events/ev_123");
    expect(sanitizeOrganizerNext("/organizer/events/ev_123?tab=teams")).toBe("/organizer/events/ev_123?tab=teams");
  });

  it("blocks external open redirects", () => {
    expect(sanitizeOrganizerNext("https://evil.com")).toBe("/organizer");
    expect(sanitizeOrganizerNext("//evil.com")).toBe("/organizer");
    expect(sanitizeOrganizerNext("/dashboard")).toBe("/organizer");
  });
});
