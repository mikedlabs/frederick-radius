import { describe, expect, it } from "vitest";
import { encodeSpec, decodeSavedPlanToken, type PlanSpec } from "@/lib/plan/plan-token";
import { MAX_SAVED_OUTINGS, parseSavedOutings, savedOutingDetails, savedOutingHref } from "./saved-outings";

const spec: PlanSpec = { v: 1, i: { audience: "date", vibe: "cultural", duration_hours: 3, start_at: "2026-10-12T18:20:00.000Z", municipality: "brunswick", require_verified_hours: false, budget: "free", local_only: true, max_stops: 3, max_distance_m: 1800, parking_priority: true, require_wheelchair_access: true, seed: 18 }, s: [{ p: "brunswick-heritage-museum" }, { p: "beans-in-the-belfry-brunswick" }, { e: "runtime-concert" }] };
const row = (token = encodeSpec(spec)) => ({ token, title: "A local date", saved_at: "2026-10-12T12:30:00.000Z" });

describe("separate saved outing contract", () => {
  it("reopens the exact dated token and all original ordered constraints", () => {
    const original = row();
    const stored = parseSavedOutings(JSON.stringify([original]));
    const href = savedOutingHref(stored[0].token)!;
    const reopenedToken = new URL(href, "https://example.test").searchParams.get("p");
    expect(reopenedToken).toBe(original.token);
    expect(decodeSavedPlanToken(reopenedToken)).toEqual(spec);
    expect(new URL(href, "https://example.test").searchParams.get("returnTo")).toBe("/my-radius");
    expect(savedOutingDetails(original.token)).toMatchObject({ town: "Brunswick", stopCount: 3, dateLabel: "Oct 12, 2026, 2:20 PM" });
  });
  it("does not invent a start time for an undated idea", () => {
    const token = encodeSpec({ ...spec, i: { audience: "solo", vibe: "easy", duration_hours: 2 } });
    expect(savedOutingDetails(token)).toMatchObject({ town: "Frederick County", dateLabel: "No start time saved" });
  });
  it("treats an absent separate key as an empty collection", () => {
    expect(parseSavedOutings(null)).toEqual([]);
    expect(parseSavedOutings("[]")).toEqual([]);
  });
  it.each(["{broken", "null", "{}", "[null]", "[1]", "[{}]"])("rejects unreadable record bytes %s", (raw) => {
    expect(() => parseSavedOutings(raw)).toThrow();
  });
  it.each([
    { title: "" }, { title: "x".repeat(161) }, { title: "Wrong\nline" },
    { token: "not-a-plan" }, { saved_at: null }, { saved_at: "not-a-date" }, { token: encodeSpec({ ...spec, s: [] }) },
    { extra: "unbounded legacy metadata" },
  ])("rejects an invalid stored field without salvaging the valid prefix: %s", (invalid) => {
    expect(() => parseSavedOutings(JSON.stringify([row(), { ...row(encodeSpec({ ...spec, i: { ...spec.i, seed: 2 } })), ...invalid }]))).toThrow();
  });
  it("rejects duplicate tokens and collections over their declared bound", () => {
    expect(() => parseSavedOutings(JSON.stringify([row(), row()]))).toThrow();
    const rows = Array.from({ length: MAX_SAVED_OUTINGS + 1 }, (_, seed) => row(encodeSpec({ ...spec, i: { ...spec.i, seed } })));
    expect(() => parseSavedOutings(JSON.stringify(rows))).toThrow();
    expect(() => parseSavedOutings(" ".repeat(108001))).toThrow();
  });
  it("refuses to make links or metadata from malformed tokens", () => {
    expect(savedOutingHref("../../bad")).toBeNull();
    expect(savedOutingDetails("bad-token")).toBeNull();
  });
});
