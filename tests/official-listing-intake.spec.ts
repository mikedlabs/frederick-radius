import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { intakeOfficialListingEvidence, prepareOfficialListingHoursHandoff, type OfficialListingIntakeEvidence } from "../scripts/lib/official-listing-intake";
import { reviewMerchantHoursBatch } from "../scripts/lib/review-merchant-hours-batch";
import { MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "../src/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../scripts/lib/merchant-official-hours";

const now = new Date("2026-10-22T18:00:00.000Z");
const observed = "2026-10-22T12:00:00.000Z";
const identity = { slug: "test-exact-cafe", name: "Test Exact Cafe", category: "coffee", website: "https://cafe.example.com/location/frederick/", address: "100 Main Street", city: "Frederick", state: "MD", postal_code: "21701", phone: "301-555-0100" };
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function entity() {
  return { "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", "@id": `${identity.website}#business`, name: identity.name, url: identity.website,
    address: { "@type": "PostalAddress", streetAddress: identity.address, addressLocality: identity.city, addressRegion: identity.state, postalCode: identity.postal_code, addressCountry: "US" },
    telephone: "+1 (301) 555-0100", email: "hello@cafe.example.com",
    openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: [...days], opens: "08:00", closes: "17:00" }],
    image: { "@type": "ImageObject", url: "https://media.example.com/cafe.jpg", license: "https://creativecommons.org/publicdomain/zero/1.0/" } };
}
function html(value: unknown = entity(), body = "Test Exact Cafe, 100 Main Street, Frederick MD 21701") {
  return `<html><head><script type="application/ld+json">${JSON.stringify(value)}</script></head><body>${body}</body></html>`;
}
function receipt(value: string = html(), overrides: Partial<OfficialListingIntakeEvidence> = {}): OfficialListingIntakeEvidence {
  return { source_url: identity.website, observed_at: observed, source_revision: "a".repeat(40), bytes: Buffer.byteLength(value), source_sha256: createHash("sha256").update(value).digest("hex"), content_type: "text/html; charset=utf-8", status: 200, identity: { ...identity }, html: value, ...overrides };
}

describe("held official listing intake from already captured HTML", () => {
  it("extracts exact contact and complete seven-day candidates without acceptance, calls, raw HTML or image rights", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must remain offline"));
    try {
      const input = receipt(); const original = structuredClone(input);
      const result = intakeOfficialListingEvidence(input, now);
      expect(result).toMatchObject({ status: "held", provenance: { valid: true, observed_at: observed, source_sha256: input.source_sha256, source_revision: input.source_revision }, identity_state: "exact",
        candidates: { contact: { name: identity.name, phone: "3015550100", email: "hello@cafe.example.com" }, weekly_hours: { observed_at: observed, expires_at: "2026-10-29T12:00:00.000Z", owner: "official-hours", review_required: true }, image_urls: [{ url: "https://media.example.com/cafe.jpg", rights: "unverified", publishable: false }] },
        enrollment_draft: { status: "held", owner: "official-hours", shape: "jsonld_weekly_location_cards", binding: { slug: identity.slug, identity: { phone: "3015550100" } } } });
      expect(Object.keys(result.candidates.weekly_hours!.hours)).toHaveLength(7);
      expect(result.reasons).toContain("visible_week_and_notices_require_review");
      expect(result.enrollment_draft!.missing_review).toContain("code_reviewed_visible_location_and_weekday_selectors");
      expect(JSON.stringify(result)).not.toContain("<html>");
      expect(JSON.stringify(result)).not.toMatch(/hours_verified|is_verified|license|accepted/);
      expect(input).toEqual(original); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it.each(["hash", "bytes", "status", "mime", "foreign-host", "private-source", "future", "invalid-date", "unknown-revision", "lossy-decode"])("holds invalid original %s evidence without any candidates", (failure) => {
    const input = receipt();
    if (failure === "hash") input.source_sha256 = "0".repeat(64);
    if (failure === "bytes") input.bytes++;
    if (failure === "status") input.status = 206;
    if (failure === "mime") input.content_type = "application/json";
    if (failure === "foreign-host") input.source_url = "https://other.example.com/";
    if (failure === "private-source") input.source_url = "https://127.0.0.1/source";
    if (failure === "future") input.observed_at = "2026-10-23T12:00:00.000Z";
    if (failure === "invalid-date") input.observed_at = "2026-02-30T12:00:00.000Z";
    if (failure === "unknown-revision") input.source_revision = "unknown";
    if (failure === "lossy-decode") { const raw = Buffer.from([0xff]); input.html = raw.toString("utf8"); input.bytes = raw.length; input.source_sha256 = createHash("sha256").update(raw).digest("hex"); }
    expect(intakeOfficialListingEvidence(input, now)).toMatchObject({ status: "held", provenance: { valid: false }, candidates: {} });
  });
  it.each(["name", "street", "city", "region", "zip", "phone", "url", "country", "missing-canonical-city"])("does not project another or incomplete identity: %s", (failure) => {
    const value = entity(); const input = receipt();
    if (failure === "name") value.name = "Nearby Cafe";
    if (failure === "street") value.address.streetAddress = "101 Main Street";
    if (failure === "city") value.address.addressLocality = "Brunswick";
    if (failure === "region") value.address.addressRegion = "VA";
    if (failure === "zip") value.address.postalCode = "21702";
    if (failure === "phone") value.telephone = "3015550101";
    if (failure === "url") value.url = "https://cafe.example.com/location/other-branch/";
    if (failure === "country") value.address.addressCountry = "CA";
    if (failure === "missing-canonical-city") delete input.identity.city;
    Object.assign(input, receipt(html(value), { identity: input.identity }));
    const result = intakeOfficialListingEvidence(input, now);
    expect(result.status).toBe("held"); expect(result.identity_state).not.toBe("exact"); expect(result.candidates).toEqual({});
  });
  it("distinguishes a missing canonical phone from a wrong phone and keeps newly found contact held", () => {
    const input = receipt(); delete input.identity.phone;
    expect(intakeOfficialListingEvidence(input, now)).toMatchObject({ status: "held", identity_state: "exact", candidates: { contact: { phone: "3015550100" } } });
  });
  it("does not conflate services sharing an address or duplicate matching structured identities", () => {
    const other = entity(); other.name = "Test Auto Repair"; other.telephone = "3015550199";
    const one = intakeOfficialListingEvidence(receipt(html({ "@graph": [other, entity()] })), now);
    expect(one.identity_state).toBe("exact");
    const ambiguous = intakeOfficialListingEvidence(receipt(html({ "@graph": [entity(), entity()] })), now);
    expect(ambiguous).toMatchObject({ identity_state: "ambiguous", candidates: {}, reasons: ["ambiguous_exact_business_entities"] });
  });
  it.each(["partial-week", "equal-midnight", "overnight", "overlap", "extra-period", "dated", "special", "flat-and-spec", "qualified-row", "duplicate-day"])("refuses a ready weekly candidate for %s", (failure) => {
    const value: Record<string, unknown> = entity();
    const rows = value.openingHoursSpecification as Record<string, unknown>[];
    if (failure === "partial-week") rows[0].dayOfWeek = days.slice(0, 5);
    if (failure === "equal-midnight") { rows[0].opens = "00:00"; rows[0].closes = "00:00"; }
    if (failure === "overnight") { rows[0].opens = "20:00"; rows[0].closes = "02:00"; }
    if (failure === "overlap") rows.push({ ...rows[0], opens: "16:00", closes: "18:00" });
    if (failure === "extra-period") rows.push({ ...rows[0], opens: "18:00", closes: "19:00" }, { ...rows[0], opens: "20:00", closes: "21:00" });
    if (failure === "dated") value.validThrough = "2026-10-23";
    if (failure === "special") value.specialOpeningHoursSpecification = [];
    if (failure === "flat-and-spec") value.openingHours = "Mo-Su 08:00-17:00";
    if (failure === "qualified-row") rows[0].description = "Kitchen only";
    if (failure === "duplicate-day") rows[0].dayOfWeek = [...days, "Monday"];
    const result = intakeOfficialListingEvidence(receipt(html(value)), now);
    expect(result.identity_state).toBe("exact"); expect(result.candidates.contact).toBeDefined();
    expect(result.candidates.weekly_hours).toBeUndefined(); expect(result.enrollment_draft).toBeUndefined();
  });
  it.each(["Holiday closures: December 25", "Closing early tomorrow", "Kitchen hours", "By appointment", "Until sold out", "Last admission 4 PM", "Delivery hours"])("withholds weekly candidates around visible notices: %s", (notice) => {
    const result = intakeOfficialListingEvidence(receipt(html(entity(), `<p>${notice}</p>`)), now);
    expect(result.candidates.weekly_hours).toBeUndefined(); expect(result.enrollment_draft).toBeUndefined();
    expect(result.reasons).toContain("visible_notice_or_service_qualifier");
  });
  it("preserves observations and seven-day evidence instead of adopting commerce's thirty-day interval", () => {
    const result = intakeOfficialListingEvidence(receipt(), new Date("2026-10-30T12:00:00.000Z"));
    expect(result.provenance.observed_at).toBe(observed);
    expect(result.candidates.weekly_hours).toBeUndefined(); expect(result.reasons).toContain("hours_evidence_expired");
  });
  it("rejects broken or hidden structured evidence without executing scripts or leaking extra transport/identity fields", () => {
    expect(intakeOfficialListingEvidence(receipt(`${html()}<script type="application/ld+json">{broken</script>`), now).reasons).toContain("invalid_jsonld");
    const hidden = `<div hidden><script type="application/ld+json">${JSON.stringify(entity())}</script></div>`;
    expect(intakeOfficialListingEvidence(receipt(hidden), now)).toMatchObject({ candidates: {}, reasons: ["hidden_jsonld_evidence"] });
    const input = receipt(`${html()}<script>globalThis.__intakeExecuted = true;</script>`);
    Object.assign(input, { rawBytes: "secret-extra" }); Object.assign(input.identity, { html: "secret-extra", hours_verified: true });
    const result = intakeOfficialListingEvidence(input, now);
    expect(JSON.stringify(result)).not.toContain("secret-extra"); expect(JSON.stringify(result)).not.toContain("hours_verified");
    expect((globalThis as Record<string, unknown>).__intakeExecuted).toBeUndefined();
  });
  it("keeps only public image URLs, regardless of an asserted license or provider metadata", () => {
    const value: Record<string, unknown> = entity();
    value.image = ["https://127.0.0.1/private.jpg", "http://media.example.com/insecure.jpg", "https://user:pass@media.example.com/auth.jpg", { url: "https://media.example.com/a.jpg", license: "CC0", creator: "Wrong Photo" }];
    const result = intakeOfficialListingEvidence(receipt(html(value)), now);
    expect(result.candidates.image_urls).toEqual([{ url: "https://media.example.com/a.jpg", rights: "unverified", publishable: false }]);
  });
  it("projects twenty exact branches from one existing response without sharing identity or acceptance", () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({ ...entity(), name: `Cafe Branch ${index}`, url: `https://cafe.example.com/locations/${index}/`, telephone: `301555${String(index).padStart(4, "0")}`,
      address: { ...entity().address, streetAddress: `${index + 1} Main Street` } }));
    const sharedHtml = html({ "@graph": entries });
    const results = entries.map((entry, index) => intakeOfficialListingEvidence(receipt(sharedHtml, { source_url: "https://cafe.example.com/locations/", identity: { ...identity, slug: `cafe-${index}`, name: entry.name, website: entry.url, address: entry.address.streetAddress, phone: entry.telephone } }), now));
    expect(results).toHaveLength(20); expect(results.every((result) => result.identity_state === "exact" && result.status === "held" && result.candidates.weekly_hours?.review_required)).toBe(true);
    expect(new Set(results.map((result) => result.provenance.source_sha256)).size).toBe(1);
    expect(new Set(results.map((result) => result.candidates.contact!.street)).size).toBe(20);
  });
});

describe("existing explicit hours batch reviewer handoff", () => {
  const source = MERCHANT_HOURS_SOURCES.find((source) => source.slug === "thai-meric-eatery-bar-frederick")!;
  const raw = readFileSync("tests/fixtures/merchant-hours/thai-meric-eatery-bar-frederick.html", "utf8");
  function registered() {
    return receipt(raw, { source_url: source.url, identity: { slug: source.slug, name: source.name, category: source.category, website: source.url, address: "1170 W Patrick St Ste E", city: "Frederick", state: "MD", postal_code: "21703", phone: "2406510998" } });
  }
  const baseline: MerchantHoursArtifact = { schema_version: 1, places: [], review: [{ slug: "brewers-alley-frederick", checked_at: observed, reason: "source_unavailable" }] };
  it("requires reviewed registry/parser enrollment instead of dynamically enrolling a discovered business", () => {
    const before = JSON.stringify(baseline);
    const result = prepareOfficialListingHoursHandoff(before, [{ evidence: receipt(), evidence_file: "original.html" }], now);
    expect(result.staged).toEqual([]); expect(result.artifact).toEqual(baseline);
    expect(result.blocked).toEqual([{ slug: identity.slug, source_url: identity.website, reason: "reviewed_daily_hours_registry_and_parser_enrollment_required" }]);
    expect(result.plan.decisions).toEqual([]); expect(result.publication_required).toBe(false);
  });
  it("replays the registered parser and feeds the existing all-hold batch plan; acceptance remains a separate explicit review", () => {
    const evidence = registered(); const before = JSON.stringify(baseline);
    const result = prepareOfficialListingHoursHandoff(before, [{ evidence, evidence_file: "original.html" }], now);
    expect(result.blocked).toEqual([]); expect(result.staged).toEqual([source.slug]);
    expect(result.artifact.places).toEqual([]); expect(result.artifact.review[0]).toEqual(baseline.review[0]);
    const expected = parseMerchantOfficialHours(source, { url: source.url, html: raw, observedAt: observed }, now);
    expect(result.artifact.review[1]).toEqual({ slug: source.slug, checked_at: observed, reason: "pending_acceptance", candidate: expected });
    expect(result.plan.decisions).toMatchObject([{ slug: source.slug, decision: "hold", evidence_file: "original.html", review_note: "", observed_at: observed, source_sha256: evidence.source_sha256 }]);
    const noRead = vi.fn(() => { throw new Error("held plan cannot need evidence"); });
    expect(reviewMerchantHoursBatch(result.artifact_bytes, result.plan, noRead, now).accepted).toEqual([]); expect(noRead).not.toHaveBeenCalled();
    result.plan.decisions[0].decision = "accept";
    result.plan.decisions[0].review_note = "Reviewed exact restaurant identity, all seven split-service days, visible and structured agreement, and no unresolved source notices.";
    const reviewed = reviewMerchantHoursBatch(result.artifact_bytes, result.plan, () => raw, now);
    expect(reviewed.accepted).toEqual([source.slug]); expect(reviewed.artifact.places).toEqual([expected]);
    expect(reviewed.artifact.review).toEqual(baseline.review); expect(JSON.parse(before)).toEqual(baseline);
  });
  it("retains accepted records and unselected failures, and requires explicit selection between multiple receipts", () => {
    const evidence = registered(); const accepted = parseMerchantOfficialHours(source, { url: source.url, html: raw, observedAt: observed }, now);
    const previous = { ...baseline, places: [accepted] }; const before = JSON.stringify(previous);
    const result = prepareOfficialListingHoursHandoff(before, [{ evidence, evidence_file: "a.html" }, { evidence, evidence_file: "b.html" }], now);
    expect(result.staged).toEqual([]); expect(result.blocked).toHaveLength(2); expect(result.artifact).toEqual(previous);
    expect(result.blocked.every((row) => row.reason === "multiple_receipts_require_explicit_selection")).toBe(true);
  });
  it("reuses reviewed visible-only Common Market cohort parsing without imposing generic JSON-LD requirements", () => {
    const source = MERCHANT_HOURS_SOURCES.find((source) => source.slug === "common-market-frederick")!;
    const raw = readFileSync("tests/fixtures/merchant-hours/common-market.html", "utf8");
    const evidence = receipt(raw, { source_url: source.url, identity: { slug: source.slug, name: source.name, category: source.category, website: source.url,
      address: "5728 Buckeystown Pike, Unit B1", city: "Frederick", state: "MD", postal_code: "21704", phone: "3016633416" } });
    expect(intakeOfficialListingEvidence(evidence, now).identity_state).toBe("unmatched");
    const result = prepareOfficialListingHoursHandoff(JSON.stringify(baseline), [{ evidence, evidence_file: "common-market-original.html" }], now);
    expect(result.staged).toEqual([source.slug]); expect(result.blocked).toEqual([]);
    expect(result.plan.decisions[0].decision).toBe("hold"); expect(result.artifact.review[0]).toEqual(baseline.review[0]);
  });
  it.each(["accepted", "pending", "failed-check", "equal-time-different-hash"])("does not replace newer or conflicting %s source evidence", (kind) => {
    const evidence = registered();
    const old = parseMerchantOfficialHours(source, { url: source.url, html: raw, observedAt: observed }, now);
    const later = parseMerchantOfficialHours(source, { url: source.url, html: raw, observedAt: "2026-10-22T17:00:00.000Z" }, now);
    const original: MerchantHoursArtifact = structuredClone(baseline);
    if (kind === "accepted") original.places.push(later);
    if (kind === "pending") original.review.push({ slug: source.slug, checked_at: later.observed_at, reason: "pending_acceptance", candidate: later });
    if (kind === "failed-check") original.review.push({ slug: source.slug, checked_at: later.observed_at, reason: "source_unavailable" });
    if (kind === "equal-time-different-hash") original.places.push({ ...old, source_sha256: "0".repeat(64) });
    const result = prepareOfficialListingHoursHandoff(JSON.stringify(original), [{ evidence, evidence_file: "old-original.html" }], now);
    expect(result.staged).toEqual([]); expect(result.artifact).toEqual(original);
    expect(result.blocked[0].reason).toBe(kind === "equal-time-different-hash" ? "conflicting_proof_at_same_observation" : "older_than_existing_observation_or_review");
  });
  it("blocks a wrong branch, altered capture and structured/visible conflict without erasing prior evidence", () => {
    const good = registered();
    // Recompute proof for deliberately changed original bytes; a matching hash
    // alone must not bypass the registered visible/structured parser.
    const conflictHtml = raw.replace(">11:00 AM</time>", ">12:00 PM</time>");
    expect(conflictHtml).not.toBe(raw);
    const conflict = { ...good, html: conflictHtml, bytes: Buffer.byteLength(conflictHtml), source_sha256: createHash("sha256").update(conflictHtml).digest("hex") };
    const wrongHtml = raw.replaceAll("1170 W Patrick St Ste E", "999 Different Branch Road");
    const wrong = { ...good, html: wrongHtml, bytes: Buffer.byteLength(wrongHtml), source_sha256: createHash("sha256").update(wrongHtml).digest("hex") };
    const altered = registered(); altered.source_sha256 = "0".repeat(64);
    for (const evidence of [conflict, wrong, altered]) {
      const result = prepareOfficialListingHoursHandoff(JSON.stringify(baseline), [{ evidence, evidence_file: "original.html" }], now);
      expect(result.staged).toEqual([]); expect(result.blocked).toHaveLength(1); expect(result.artifact).toEqual(baseline);
    }
  });
});
