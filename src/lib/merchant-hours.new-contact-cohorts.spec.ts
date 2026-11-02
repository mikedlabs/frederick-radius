import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { merchantHoursCohort } from "../../scripts/lib/merchant-hours-cohorts";
import { parseOfficialHoursCohort } from "../../scripts/lib/official-hours-cohort";
import { prepareOfficialListingHoursHandoff, type OfficialListingIntakeEvidence } from "../../scripts/lib/official-listing-intake";
import { merchantHoursBatchTemplate, reviewMerchantHoursBatch } from "../../scripts/lib/review-merchant-hours-batch";
import { MERCHANT_HOURS_SOURCES, merchantHoursForPlace, validateMerchantHoursArtifact } from "./merchant-hours";
import { getOpenStatus, isDisplayOnlyHours } from "./hours";
import { hasReliableHours } from "./hours-availability";
import type { Hours } from "@/data/places";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const ordinarySlug = "mamma-angela-mount-airy", taproomSlug = "monocacy-brewing-frederick";
const observedAt = "2026-10-26T14:19:39.206Z", now = new Date("2026-10-27T18:00:00.000Z");
const source = (slug: string) => MERCHANT_HOURS_SOURCES.find(item => item.slug === slug)!;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
// Small contract fixtures reproduce reviewed selectors and wording. They are
// not the authenticated source originals and never constitute source evidence.
const fixtures: Record<string, string> = {
  [ordinarySlug]: `<!doctype html><html><head><title>Mamma Angela| Family-owned Italian Restaurant | Mount Airy</title><link rel="canonical" href="https://www.mammaangelamtairymd.com"></head><body>
    <div id="i72scp7p"><h6>Call us</h6><p>1 <span>301 829 1575</span></p></div>
    <div id="i72scp7p_0"><h6><span>WE'</span><span>RE O</span><span>PEN!</span></h6>
    <p>Monday thru Thursday</p><p>10:30am to 09:00pm</p><p>Friday and Saturday</p><p>10:30am to 10:00pm</p><p>Sunday</p><p>11:00am to 9:00pm</p></div>
    <div id="i72scp7p_2"><p>5 Ridgeside Court</p><p>Mount Airy, MD 21771</p></div></body></html>`,
  [taproomSlug]: `<!doctype html><html><head><title>Monocacy Brewing Company - Quality beer. It's in our nature.</title><link rel="canonical" href="https://monocacybrewing.com/"></head><body>
    <section id="text-10"><div class="textwidget"><div><center><strong>Taproom Hours</strong></center>
    <div>Monday: 3 – 9PM</div><div>Tuesday: 3 – 9PM</div><div>Wednesday: 3 – 10PM</div><div>Thursday: 3 – 10PM</div><div>Friday: 12 – 10PM</div><div>Saturday: 12 – 10PM</div><div>Sunday: 12 – 8PM</div></div></div></section>
    <section id="text-5"><div class="textwidget"><h2>240.457.4232</h2><h3>1781 NORTH MARKET ST FREDERICK, MD 21701</h3></div></section></body></html>`,
};
const parse = (slug: string, html = fixtures[slug], at = now) => parseMerchantOfficialHours(source(slug), { url: source(slug).url, html, observedAt }, at);
const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const expected: Record<string, Hours> = {
  [ordinarySlug]: Object.fromEntries(weekdays.map((day, index) => [day, [{ open: index === 6 ? "11:00" : "10:30", close: [4, 5].includes(index) ? "22:00" : "21:00" }]])),
  [taproomSlug]: Object.fromEntries(weekdays.map((day, index) => [day, [{ open: index < 4 ? "15:00" : "12:00", close: index < 2 ? "21:00" : index === 6 ? "20:00" : "22:00" }]])),
};
function intake(slug: string, html = fixtures[slug], stamp = observedAt): OfficialListingIntakeEvidence {
  const owner = source(slug);
  return { source_url: owner.url, source_revision: "a".repeat(40), observed_at: stamp, source_sha256: hash(html), bytes: Buffer.byteLength(html), status: 200, content_type: "text/html", html,
    identity: { slug, name: owner.name, category: owner.category, website: owner.url,
      address: slug === ordinarySlug ? "5 Ridgeside Court" : "1781 North Market St", city: slug === ordinarySlug ? "Mount Airy" : "Frederick", state: "MD", postal_code: slug === ordinarySlug ? "21771" : "21701", phone: slug === ordinarySlug ? "3018291575" : "2404574232" } };
}

describe("reviewed ordinary and taproom contact cohorts", () => {
  it.each([ordinarySlug, taproomSlug])("replays the complete %s week with its actual hash and seven-day horizon", slug => {
    const record = parse(slug);
    expect(record.hours).toEqual(expected[slug]);
    expect(record).toMatchObject({ source_url: source(slug).url, source_sha256: hash(fixtures[slug]), observed_at: observedAt, expires_at: "2026-11-02T14:19:39.206Z" });
    expect(() => validateMerchantHoursArtifact({ schema_version: 1, places: [record], review: [] })).not.toThrow();
    expect(() => parse(slug, fixtures[slug], new Date(Date.parse(record.expires_at) + 1))).toThrow();
  });
  it("keeps ordinary hours distinct from a taproom table across status, coverage and missing/expired evidence", () => {
    for (const slug of [ordinarySlug, taproomSlug]) {
      const owner = source(slug), record = parse(slug), place = { slug, category: owner.category, website: owner.url };
      const hours = merchantHoursForPlace(place, { schema_version: 1, places: [record], review: [] }, now).hours!;
      expect(isDisplayOnlyHours(hours)).toBe(slug === taproomSlug);
      expect(hasReliableHours({ slug, hours, hours_verified: true, hours_updated_at: observedAt }, now)).toBe(slug === ordinarySlug);
      if (slug === taproomSlug) {
        expect(record.qualification).toMatchObject({ scope: "bar", label: "Taproom hours", usage: "display_only" });
        expect(getOpenStatus(hours, { verified: true }, now)).toEqual({ state: "unknown" });
        const stripped = { ...record }; delete stripped.qualification;
        expect(() => validateMerchantHoursArtifact({ schema_version: 1, places: [stripped], review: [] })).toThrow(/qualification/);
      } else expect(record.qualification).toBeUndefined();
      expect(merchantHoursForPlace(place, { schema_version: 1, places: [], review: [] }, now)).toEqual({ enrolled: true });
      expect(merchantHoursForPlace(place, { schema_version: 1, places: [record], review: [] }, new Date(record.expires_at)).hours).toBeUndefined();
    }
  });
  it.each([
    [ordinarySlug, "5 Ridgeside Court", "6 Ridgeside Court", /Changed exact visible contact identity/],
    [ordinarySlug, "301 829 1575", "301 829 1576", /Changed exact visible contact identity/],
    [ordinarySlug, "Mount Airy, MD 21771", "Mount Airy, MD 21772", /Changed exact visible contact identity/],
    [ordinarySlug, "Sunday</p><p>11:00am to 9:00pm", "", /Incomplete primary visible cohort week/],
    [ordinarySlug, "Monday thru Thursday", "Monday thru Wednesday", /Incomplete primary visible cohort week/],
    [taproomSlug, "1781 NORTH MARKET ST", "1782 NORTH MARKET ST", /Changed exact visible contact identity/],
    [taproomSlug, "240.457.4232", "301.846.4204", /Changed exact visible contact identity/],
    [taproomSlug, "Taproom Hours", "Brewery Hours", /Missing exact visible hours label/],
    [taproomSlug, "Sunday: 12 – 8PM", "Sunday: 12 – 8", /Unknown visible week text or service condition/],
    [taproomSlug, "Monday: 3 – 9PM", "Monday: 11 – 9PM", /Overnight or all-day visible hours need separate review/],
  ])("holds incomplete or changed exact evidence for %s (%s)", (slug, from, to, reason) => {
    expect(fixtures[slug]).toContain(from);
    expect(() => parse(slug, fixtures[slug].replace(from, to))).toThrow(reason);
  });
  it.each([ordinarySlug, taproomSlug])("holds notices, hidden/duplicate weeks and conflicting extra claims for %s", slug => {
    for (const extra of ["Closed today", "Holiday hours apply", "By appointment", "Kitchen hours differ", "Hours may vary", "Closed for renovations", "Monday: 8am–10pm"]) {
      expect(() => parse(slug, fixtures[slug].replace("</body>", `<p>${extra}</p></body>`))).toThrow();
    }
    expect(() => parse(slug, fixtures[slug].replace("</body>", '<script type="application/ld+json">{"@type":"Restaurant","openingHours":"Mo-Su 08:00-23:00"}</script></body>'))).toThrow();
    const selected = merchantHoursCohort(source(slug))!, cohort = selected.cohort;
    if (cohort.shape !== "visible_weekly_contact_card") throw Error("Expected reviewed contact owner.");
    const selector = cohort.locations[slug].weeks[0].selector;
    const document = new JSDOM(fixtures[slug]).window.document, week = document.querySelector(selector)!;
    week.after(week.cloneNode(true)); expect(() => parse(slug, document.documentElement.outerHTML)).toThrow();
    for (const attr of ["hidden", "aria-hidden", "style"]) {
      const changed = new JSDOM(fixtures[slug]).window.document;
      changed.querySelector(selector)!.setAttribute(attr, attr === "style" ? "display:none" : attr === "aria-hidden" ? "true" : "");
      expect(() => parse(slug, changed.documentElement.outerHTML)).toThrow();
    }
  });
  it("does not enable word or missing-meridiem ranges for undeclared source formats", () => {
    for (const slug of [ordinarySlug, taproomSlug]) {
      const selected = merchantHoursCohort(source(slug))!, cohort = structuredClone(selected.cohort);
      if (cohort.shape !== "visible_weekly_contact_card") throw Error("Expected reviewed contact owner.");
      const section = cohort.locations[slug].weeks[0]; delete section.word_ranges; delete section.shared_pm_range;
      const document = new JSDOM(fixtures[slug]).window.document;
      expect(() => parseOfficialHoursCohort(document, document.body.textContent ?? "", cohort, cohort.bindings[0])).toThrow();
    }
  });
  it.each([ordinarySlug, taproomSlug])("holds an outside word-range week for %s", slug => {
    expect(() => parse(slug, fixtures[slug].replace("</body>", "<p>Monday thru Thursday: 8am to 10pm</p></body>"))).toThrow(/outside schedule/);
  });
  it("holds a newly added shared-PM copy outside the exact reviewed taproom section", () => {
    expect(() => parse(taproomSlug, fixtures[taproomSlug].replace("</body>", "<p>Monday: 3–10PM</p></body>"))).toThrow(/outside schedule/);
  });
  it("stages both sources through the existing bridge as held, preserving accepted records and exact clocks", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline only"));
    try {
      const old = parse(ordinarySlug), bytes = JSON.stringify({ schema_version: 1, places: [old], review: [] });
      const input = [ordinarySlug, taproomSlug].map(slug => ({ evidence: intake(slug), evidence_file: `${slug}.html` }));
      const result = prepareOfficialListingHoursHandoff(bytes, input, now);
      expect(result.staged).toEqual([ordinarySlug, taproomSlug]); expect(result.blocked).toEqual([]);
      expect(result.artifact.places).toEqual([old]); expect(result.publication_required).toBe(false);
      expect(result.plan.decisions.map(row => row.decision)).toEqual(["hold", "hold"]);
      expect(result.artifact.review.every(row => row.candidate?.observed_at === observedAt)).toBe(true);
      const reviewed = reviewMerchantHoursBatch(result.artifact_bytes, result.plan, () => { throw Error("Held decisions do not read acceptance evidence"); }, now);
      expect(reviewed.accepted).toEqual([]); expect(reviewed.artifact.places).toEqual([old]); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("rejects altered original bytes at the batch boundary and preserves failed-source observations", () => {
    const input = { evidence: intake(taproomSlug), evidence_file: "taproom.html" };
    const baseline = JSON.stringify({ schema_version: 1, places: [], review: [{ slug: taproomSlug, checked_at: "2026-10-28T18:00:00.000Z", reason: "source_unavailable" }] });
    const held = prepareOfficialListingHoursHandoff(baseline, [input], new Date("2026-10-28T19:00:00.000Z"));
    expect(held.blocked[0].reason).toBe("older_than_existing_observation_or_review"); expect(held.artifact.review).toEqual(JSON.parse(baseline).review);
    const result = prepareOfficialListingHoursHandoff(JSON.stringify({ schema_version: 1, places: [], review: [] }), [input], now);
    const plan = merchantHoursBatchTemplate(result.artifact_bytes); plan.decisions[0] = { ...plan.decisions[0], decision: "accept", evidence_file: "taproom.html", review_note: "Synthetic fixture only: exact identity, complete labeled taproom week and all notice gates checked." };
    expect(() => reviewMerchantHoursBatch(result.artifact_bytes, plan, () => fixtures[taproomSlug] + "altered", now)).toThrow(/hash mismatch/);
  });
});

// Opt-in private replay keeps raw official pages outside Git. The same portable
// suite runs without local paths; an operator can additionally supply the exact
// retained authenticated packet to prove both original hashes and parser replay.
const packetPath = process.env.RADIUS_RETAINED_HOURS_PACKET;
describe.skipIf(!packetPath)("private authenticated originals, offline replay only", () => {
  it("reproduces both exact retained hashes and keeps their true expiry without accepting either source", () => {
    const packet = JSON.parse(readFileSync(packetPath!, "utf8")) as { selected: { slug: string; original_path: string; original_sha256: string; actual_observed_at: string }[] };
    const pins: Record<string, string> = { [ordinarySlug]: "0ff5b585e317c8aecd6a710a11ff48dd3eab20ca16cf3cbca1bbf8a0a1cab22c", [taproomSlug]: "3a282e5904a7478e3c9973e4b46e17d71a56c9e71960cd6881557b7cff67b664" };
    for (const slug of [ordinarySlug, taproomSlug]) {
      const original = packet.selected.find(row => row.slug === slug)!;
      const html = readFileSync(original.original_path, "utf8");
      expect(hash(html)).toBe(pins[slug]); expect(original.original_sha256).toBe(pins[slug]);
      const record = parseMerchantOfficialHours(source(slug), { url: source(slug).url, html, observedAt: original.actual_observed_at }, now);
      expect(record.source_sha256).toBe(pins[slug]); expect(record.hours).toEqual(expected[slug]);
      expect(record.observed_at).toBe(original.actual_observed_at);
      expect(Date.parse(record.expires_at) - Date.parse(record.observed_at)).toBe(7 * 86_400_000);
      const staged = prepareOfficialListingHoursHandoff(JSON.stringify({ schema_version: 1, places: [], review: [] }), [{ evidence: intake(slug, html, original.actual_observed_at), evidence_file: original.original_path }], now);
      expect(staged.staged).toEqual([slug]); expect(staged.artifact.places).toEqual([]); expect(staged.plan.decisions[0].decision).toBe("hold");
    }
  });
});
