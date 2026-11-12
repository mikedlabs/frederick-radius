import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { HoursQualification } from "@/data/places";
import { getOpenStatus, hoursForDate, isDisplayOnlyHours, isOpenNow, isScheduleEvidenceCurrent } from "./hours";
import { getHoursAvailability, hasReliableHours } from "./hours-availability";
import { MERCHANT_HOURS_SOURCES, merchantHoursForPlace, validateMerchantHoursArtifact, type MerchantHoursArtifact } from "./merchant-hours";
import { merchantHoursNeedsReview, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { merchantHoursBatchTemplate, reviewMerchantHoursBatch } from "../../scripts/lib/review-merchant-hours-batch";

const now = new Date("2026-10-20T14:00:00.000Z");
const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === "gravel-and-grind-frederick")!;
const html = readFileSync("tests/fixtures/merchant-hours/gravel-and-grind.html", "utf8");
const qualification: HoursQualification = { scope: "kitchen", label: "Kitchen hours", note: "The bar keeps a separate schedule.", usage: "display_only" };
const ordinary = () => parseMerchantOfficialHours(source, { url: source.url, html, observedAt: now.toISOString() }, now);
function qualified(): MerchantHoursArtifact {
  return { schema_version: 1, places: [{ ...ordinary(), qualification: { ...qualification } }], review: [] };
}
const place = { slug: source.slug, category: source.category, website: source.url };

describe("qualified official hours", () => {
  it("keeps a current reviewed table and its expiry without asserting general open or closed", () => {
    const artifact = qualified();
    const hours = merchantHoursForPlace(place, artifact, now).hours!;
    expect(hours._official).toMatchObject({ qualification, observed_at: now.toISOString(), expires_at: artifact.places[0].expires_at });
    expect(isDisplayOnlyHours(hours)).toBe(true);
    expect(isScheduleEvidenceCurrent(hours, now)).toBe(true);
    expect(hoursForDate(hours, now)).toEqual([{ open: "08:00", close: "14:00" }]);
    for (const at of [now, new Date("2026-10-21T02:00:00.000Z")]) {
      const status = getOpenStatus(hours, { verified: true }, at);
      expect(status).toEqual({ state: "unknown" });
      expect(isOpenNow(status)).toBe(false);
    }
    const expired = new Date(artifact.places[0].expires_at);
    expect(isScheduleEvidenceCurrent(hours, expired)).toBe(false);
    expect(hoursForDate(hours, expired)).toBeUndefined();
    expect(merchantHoursForPlace(place, artifact, expired).hours).toBeUndefined();
  });

  it("does not count a qualified schedule toward Open now coverage", () => {
    const artifact = qualified();
    const hours = merchantHoursForPlace(place, artifact, now).hours!;
    const current = { slug: place.slug, hours, hours_verified: true, hours_updated_at: now.toISOString() };
    expect(hasReliableHours(current, now)).toBe(false);
    expect(getHoursAvailability([current], { now })).toMatchObject({ total: 1, reliable: 0, coverage: 0, enabled: false });
    const generalHours = merchantHoursForPlace(place, { ...artifact, places: [ordinary()] }, now).hours!;
    expect(hasReliableHours({ ...current, hours: generalHours }, now)).toBe(true);
    expect(getOpenStatus(generalHours, { verified: true }, now).state).toBe("open");
  });

  it("preserves actual dated exceptions and clips them without inventing an opening", () => {
    const artifact = qualified();
    artifact.places[0].exceptions = [
      { date: "2026-10-20", reason: "Kitchen closes early.", closes_at: "12:00" },
      { date: "2026-10-21", reason: "Kitchen closed for maintenance.", closed: true },
    ];
    const hours = merchantHoursForPlace(place, artifact, now).hours!;
    expect(hours._official?.exceptions).toEqual(artifact.places[0].exceptions);
    expect(hoursForDate(hours, now)).toEqual([{ open: "08:00", close: "12:00" }]);
    expect(hoursForDate(hours, new Date("2026-10-21T14:00:00.000Z"))).toEqual([]);
    expect(getOpenStatus(hours, { verified: true }, now).state).toBe("unknown");
  });

  it.each([
    { ...qualification, usage: "open_now" },
    { ...qualification, scope: "phone" },
    { ...qualification, label: "" },
    { ...qualification, note: " " },
    { ...qualification, note: "<b>Kitchen</b>" },
    { ...qualification, expires_at: "2099-01-01" },
  ])("rejects invalid qualification %# instead of silently promoting it", (value) => {
    const artifact = qualified();
    Object.assign(artifact.places[0], { qualification: value });
    expect(() => validateMerchantHoursArtifact(artifact)).toThrow(/qualification/);
    expect(merchantHoursForPlace(place, artifact, now).hours).toBeUndefined();
  });

  it.each([
    [{ date: "2026-02-30", reason: "Invalid date.", closed: true }],
    [{ date: "2026-10-20", reason: "Ambiguous closure.", closed: true, closes_at: "12:00" }],
    [{ date: "2026-10-20", reason: "Missing effect." }],
    [{ date: "2026-10-20", reason: "Invalid boolean.", closed: false }],
    [{ date: "2026-10-20", reason: "Unsupported extension.", opens_at: "09:00" }],
    [{ date: "2026-10-20", reason: "Bad clock.", closes_at: "24:00" }],
    [{ date: "2026-10-20", reason: "Duplicate date.", closed: true }, { date: "2026-10-20", reason: "Duplicate date.", closed: true }],
  ].map((exceptions) => ({ exceptions })))("rejects invalid or ambiguous date exceptions %#", ({ exceptions }) => {
    const artifact = qualified();
    Object.assign(artifact.places[0], { exceptions });
    expect(() => validateMerchantHoursArtifact(artifact)).toThrow(/exception/);
  });

  it("requires fresh substantive review for changed qualification or exceptions", () => {
    const before = qualified();
    for (const mutate of [
      (artifact: MerchantHoursArtifact) => { artifact.places[0].qualification!.scope = "venue"; },
      (artifact: MerchantHoursArtifact) => { artifact.places[0].qualification!.note = "Admission ends an hour before closing."; },
      (artifact: MerchantHoursArtifact) => { delete artifact.places[0].qualification; },
      (artifact: MerchantHoursArtifact) => { artifact.places[0].exceptions = [{ date: "2026-10-21", reason: "Closed for maintenance.", closed: true }]; },
    ]) {
      const after = structuredClone(before); mutate(after);
      expect(merchantHoursNeedsReview(before, after)).toBe(true);
    }
    const emptyExceptions = structuredClone(before); emptyExceptions.places[0].exceptions = [];
    expect(merchantHoursNeedsReview(before, emptyExceptions)).toBe(false);
  });

  it("refuses invented qualification or dated closures when replaying the exact original source", () => {
    for (const extra of [
      { qualification },
      { exceptions: [{ date: "2026-10-21", reason: "Invented closure.", closed: true as const }] },
    ]) {
      const candidate = { ...ordinary(), ...extra };
      const bytes = JSON.stringify({ schema_version: 1, places: [], review: [{ slug: source.slug, checked_at: now.toISOString(), reason: "pending_acceptance", candidate }] });
      const plan = merchantHoursBatchTemplate(bytes);
      Object.assign(plan.decisions[0], { decision: "accept", evidence_file: "original.html", review_note: "Reviewed the exact canonical source identity and complete schedule." });
      expect(() => reviewMerchantHoursBatch(bytes, plan, () => html, now)).toThrow(/does not reproduce/);
    }
  });
});
