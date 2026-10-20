import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ARTIFACT from "@/data/places-merchant-hours.json";
import { acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, MERCHANT_HOURS_SOURCES, validateMerchantHoursArtifact, type MerchantHoursArtifact } from "./merchant-hours";
import { getOpenStatus, hoursForDate, isScheduleEvidenceCurrent } from "./hours";
import { openingHoursJsonLd } from "./seo/jsonld";
import { decoratePlace, publicPlaces } from "./loaders/places";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, merchantHoursNeedsReview, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
const now = new Date("2026-10-19T23:30:00.000Z");
const names = ["brewers-alley", "gravel-and-grind", "beans-in-the-belfry"];
const pages = MERCHANT_HOURS_SOURCES.map((source, i) => ({ url: source.url, html: readFileSync(`tests/fixtures/merchant-hours/${names[i]}.html`, "utf8"), observedAt: "2026-10-19T23:24:49.283Z" }));
const place = (i: number) => ({ slug: MERCHANT_HOURS_SOURCES[i].slug, category: MERCHANT_HOURS_SOURCES[i].category, website: MERCHANT_HOURS_SOURCES[i].url });
const parsed = (): MerchantHoursArtifact => ({ schema_version: 1, places: MERCHANT_HOURS_SOURCES.map((source, i) => parseMerchantOfficialHours(source, pages[i], now)), review: [] });
afterEach(() => vi.unstubAllEnvs());
describe("reviewed merchant hours", () => {
  it("keeps the committed approvals bound to their canonical identities without treating holds as current", () => {
    expect(() => validateMerchantHoursArtifact(ARTIFACT)).not.toThrow();
    const artifact = ARTIFACT as MerchantHoursArtifact;
    const publicRows = publicPlaces();
    for (const source of MERCHANT_HOURS_SOURCES) {
      const matches = publicRows.filter((row) => row.slug === source.slug);
      expect(matches).toHaveLength(1);
      const approval = artifact.places.find((row) => row.slug === source.slug);
      // Current approvals may move to a later week, or be held independently.
      const at = new Date(approval?.observed_at ?? artifact.review.find((row) => row.slug === source.slug)?.checked_at ?? now.toISOString());
      const p = decoratePlace(matches[0], undefined, at);
      if (approval && !artifact.review.some((row) => row.slug === source.slug)) {
        expect(p.hours_verified).toBe(true);
        expect(p.hours_source).toBe("first_party");
        expect(p.hours?._official).toMatchObject({ source_url: source.url, observed_at: approval.observed_at, expires_at: approval.expires_at });
      } else {
        expect(p.hours_verified).toBe(false);
        expect(p.hours).toBeUndefined();
        expect(p.open_status.state).toBe("unknown");
      }
      expect(p.google_hours).toBeUndefined();
    }
    const coffee = decoratePlace(publicRows.find((row) => row.slug === "frederick-coffee-company-frederick")!, undefined, now);
    expect(coffee.website).toBe("https://fredcoffeeco.com/"); expect(coffee.hours_verified).toBe(false); expect(coffee.hours).toBeUndefined();
  });
  it("restores the complete visible week when structured data omits Monday and Tuesday", () => {
    const row = parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[1], pages[1], now);
    expect(row.hours.mon).toEqual([{ open: "08:00", close: "14:00" }]);
    expect(row.hours.sun).toEqual([{ open: "08:00", close: "16:00" }]);
    expect(Object.keys(row.hours)).toHaveLength(7);
  });
  it("retains overnight opening and refuses the next week even during a provider rollback", () => {
    const fixture = parsed();
    const schedule = merchantHoursForPlace(place(0), fixture, now).hours!;
    expect(getOpenStatus(schedule, { verified: true }, new Date("2026-10-24T04:30:00Z"))).toMatchObject({ state: "closing-soon", closesAt: "01:00" });
    expect(getOpenStatus(schedule, { verified: true }, new Date("2026-10-24T05:30:00Z"))).toMatchObject({ state: "closed", opensAt: "11:00" });
    expect(merchantHoursForPlace(place(0), fixture, new Date("2026-10-26T03:59:59Z")).hours).toBeDefined();
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "0");
    expect(merchantHoursForPlace(place(0), fixture, new Date("2026-10-26T04:00:00Z")).hours).toBeUndefined();
    expect(isScheduleEvidenceCurrent(schedule, new Date("2026-10-26T04:00:00Z"))).toBe(false);
    expect(hoursForDate(schedule, new Date("2026-10-26T16:00:00Z"))).toBeUndefined();
    expect(openingHoursJsonLd(schedule)?.every((row) => row.validThrough === "2026-10-25")).toBe(true);
  });
  it("expires all immutable merchant fixtures at their own exclusive boundary even when the shipped snapshot has no merchant schedules", () => {
    const artifact = parsed();
    expect(artifact.places).toHaveLength(3);
    for (const [i, row] of artifact.places.entries()) {
      const before = merchantHoursForPlace(place(i), artifact, new Date(Date.parse(row.expires_at) - 1)).hours;
      if (!before) throw new Error(`${row.slug} must retain its schedule just before expiry`);
      for (const offset of [0, 1]) {
        const at = new Date(Date.parse(row.expires_at) + offset);
        expect(merchantHoursForPlace(place(i), artifact, at).hours, `${row.slug} at expiry + ${offset}ms`).toBeUndefined();
        expect(isScheduleEvidenceCurrent(before, at)).toBe(false);
      }
    }
  });
  it("does not reuse a source for another slug, category, host, expired week or unresolved source", () => {
    const a = parsed();
    for (const mismatch of [{ ...place(1), category: "restaurant" }, { ...place(1), website: "https://another-cafe.example" }]) expect(merchantHoursForPlace(mismatch, a, now).hours).toBeUndefined();
    expect(merchantHoursForPlace({ ...place(1), slug: "another-cafe" }, a, now)).toEqual({ enrolled: false });
    expect(merchantHoursForPlace(place(1), a, new Date("2026-10-27T00:00:00Z")).hours).toBeUndefined();
    a.review.push({ slug: place(1).slug, checked_at: now.toISOString(), reason: "unparseable_or_conflicted" });
    expect(merchantHoursForPlace(place(1), a, now)).toEqual({ enrolled: true });
  });
  it.each(["missing-day", "wrong-date", "duplicate", "stale-week", "conflict", "notice", "wrong-business"])("stages %s instead of turning partial evidence into a current claim", (kind) => {
    const i = kind === "conflict" || kind === "wrong-business" ? 1 : 0; const page = { ...pages[i] };
    if (kind === "missing-day") page.html = page.html.replace(/<p>Sunday.*?<\/p>/, "");
    if (kind === "wrong-date") page.html = page.html.replace("10/20/26", "10/21/26");
    if (kind === "duplicate") page.html += "<p>Monday 10/19/26: 11:00 AM to 11:30 PM</p>";
    if (kind === "stale-week") page.observedAt = "2026-10-26T12:00:00.000Z";
    if (kind === "conflict") page.html = page.html.replace("We 08:00-17:00", "We 08:00-18:00");
    if (kind === "notice") page.html += "<p>Closed today for maintenance.</p>";
    if (kind === "wrong-business") page.html = page.html.replace("15 East 6th Street", "15 Other Street");
    expect(() => parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[i], page, kind === "stale-week" ? new Date("2026-10-26T12:00:00Z") : now)).toThrow();
  });
  it.each([1, 2])("does not hide a conflicting second visible hours block for source %i", (i) => {
    const duplicated = { ...pages[i], html: pages[i].html + pages[i].html };
    expect(parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[i], duplicated, now).hours).toEqual(parsed().places[i].hours);
    const second = pages[i].html.replace(i === 1 ? "8am - 2pm" : "8:30am to 3:00pm", i === 1 ? "8am - 3pm" : "8:30am to 4:00pm");
    expect(() => parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[i], { ...pages[i], html: pages[i].html + second }, now)).toThrow(/conflicting visible/);
  });
  it.each(["specification", "graph"])("stages an unreviewed hours-bearing %s structure", (kind) => {
    const extra = kind === "graph" ? { "@graph": [{ "@type": "LocalBusiness", openingHours: "Mo 08:00-18:00" }] } : { "@type": "LocalBusiness", openingHoursSpecification: [{ dayOfWeek: "Monday", opens: "08:00", closes: "18:00" }] };
    expect(() => parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[1], { ...pages[1], html: pages[1].html + `<script type="application/ld+json">${JSON.stringify(extra)}</script>` }, now)).toThrow(/Unreviewed structured/);
  });
  it("terminates a synchronously fulfilled endless empty body without relying on timers", async () => {
    let reads = 0; const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array()); }, cancel: cancelled });
    await expect(fetchMerchantHoursPage(MERCHANT_HOURS_SOURCES[0].url, vi.fn(async () => new Response(body, { headers: { "content-type": "text/html" } })))).rejects.toThrow(/body read limit/);
    expect(reads).toBeLessThanOrEqual(2050); expect(cancelled).toHaveBeenCalled();
  });
  it("refreshes only the three allowed sources once, preserves failed timestamps, and requires review", async () => {
    const previous = parsed();
    const fetcher = vi.fn(async (url: string) => { const i = MERCHANT_HOURS_SOURCES.findIndex((source) => source.url === url); if (i === 0) throw new Error("source unavailable"); return i === 1 ? { ...pages[i], html: pages[i].html + "<p>Holiday hours</p>" } : pages[i]; });
    const result = await collectMerchantOfficialHours(previous, fetcher, now);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(MERCHANT_HOURS_SOURCES.map((source) => source.url));
    expect(result.artifact.places[0]).toEqual(previous.places[0]);
    expect(result.artifact.places[1]).toEqual(previous.places[1]);
    expect(result.artifact.review.map((row) => row.reason)).toEqual(["source_unavailable", "unparseable_or_conflicted"]);
    expect(result.reviewRequired).toBe(false);
    expect(merchantHoursForPlace(place(0), result.artifact, now).hours).toBeUndefined();
    expect(merchantHoursForPlace(place(2), result.artifact, now).hours).toBeDefined();
  });
  it("allows unchanged observations but cannot restore a held source without exact reviewed proof", async () => {
    const before = parsed();
    const after = parsed(); after.places[1] = parseMerchantOfficialHours(MERCHANT_HOURS_SOURCES[1], { ...pages[1], observedAt: "2026-10-20T12:00:00.000Z" }, new Date("2026-10-20T12:05:00Z"));
    expect(merchantHoursNeedsReview(before, after)).toBe(false);
    const changed = structuredClone(after); changed.places[1].hours.mon![0].close = "15:00"; expect(merchantHoursNeedsReview(before, changed)).toBe(true);
    const conflicted = structuredClone(before); conflicted.review.push({ slug: place(1).slug, checked_at: now.toISOString(), reason: "unparseable_or_conflicted" });
    const result = await collectMerchantOfficialHours(conflicted, vi.fn(async (url) => pages.find((page) => page.url === url)!), now);
    expect(result.artifact.review).toHaveLength(1); expect(result.reviewRequired).toBe(false);
    expect(merchantHoursForPlace(place(1), result.artifact, now).hours).toBeUndefined();
    const candidate = result.artifact.review[0].candidate!;
    expect(() => acceptReviewedMerchantHoursCandidate(result.artifact, candidate.slug, { source_sha256: "0".repeat(64), observed_at: candidate.observed_at }, now)).toThrow(/exact pending source proof/);
    expect(() => acceptReviewedMerchantHoursCandidate(result.artifact, candidate.slug, candidate, new Date("2026-10-28T12:00:00Z"))).toThrow(/expired/);
    const accepted = acceptReviewedMerchantHoursCandidate(result.artifact, candidate.slug, candidate, now);
    expect(merchantHoursNeedsReview(result.artifact, accepted)).toBe(true);
    expect(accepted.places.find((row) => row.slug === candidate.slug)).toEqual(candidate);
    const next = await collectMerchantOfficialHours(accepted, vi.fn(async (url) => pages.find((page) => page.url === url)!), now);
    expect(next.artifact.review).toEqual([]); expect(next.reviewRequired).toBe(false);
  });
  it("holds only a new dated week while nine libraries and two unchanged merchants remain refreshable", async () => {
    const nextAt = new Date("2026-10-26T23:30:00.000Z");
    const nextPages = pages.map((page) => ({ ...page, observedAt: "2026-10-26T23:24:00.000Z" }));
    nextPages[0].html = pages[0].html.replace(/10\/(\d{2})\/26/g, (_, day: string) => {
      const next = new Date(Date.parse(`2026-10-${day}T12:00:00Z`) + 7 * 86_400_000);
      return `${next.getUTCMonth() + 1}/${next.getUTCDate()}/26`;
    });
    const previous = parsed();
    const collected = await collectMerchantOfficialHours(previous, vi.fn(async (url) => nextPages.find((page) => page.url === url)!), nextAt);
    expect(collected.reviewRequired).toBe(false);
    expect(collected.artifact.review).toHaveLength(1);
    expect(collected.artifact.review[0]).toMatchObject({ slug: place(0).slug, reason: "changed_facts", candidate: { coverage_from: "2026-10-26", coverage_through: "2026-11-01", observed_at: nextPages[0].observedAt } });
    expect(collected.artifact.places[0]).toEqual(previous.places[0]);
    expect(merchantHoursForPlace(place(0), collected.artifact, nextAt).hours).toBeUndefined();
    expect([1, 2].every((i) => merchantHoursForPlace(place(i), collected.artifact, nextAt).hours)).toBe(true);
    const { officialHoursForPlace, FCPL_HOURS_URL, FCPL_CLOSURES_URL } = await import("./official-hours");
    const { refreshOfficialHours } = await import("../../scripts/refresh-official-hours");
    const { parseFcplOfficialHours } = await import("../../scripts/lib/fcpl-official-hours");
    const libraryPages = [FCPL_HOURS_URL, FCPL_CLOSURES_URL].map((url, i) => ({ url, observedAt: pages[0].observedAt, html: readFileSync(i === 0 ? "tests/fixtures/fcpl-hours-index.html" : "tests/fixtures/fcpl-holiday-closings.html", "utf8") }));
    const libraries = parseFcplOfficialHours({ ...libraryPages[0], observedAt: nextPages[0].observedAt }, { ...libraryPages[1], observedAt: nextPages[0].observedAt }, nextAt);
    expect(libraries.places.filter((row) => officialHoursForPlace({ slug: row.slug, category: "library", website: row.source_url }, libraries, nextAt).hours)).toHaveLength(9);
    const directory = mkdtempSync(join(tmpdir(), "merchant-held-week-"));
    const outputPath = join(directory, "libraries.json"), merchantOutputPath = join(directory, "merchants.json");
    try {
      writeFileSync(outputPath, JSON.stringify(parseFcplOfficialHours(libraryPages[0], libraryPages[1], now)));
      writeFileSync(merchantOutputPath, JSON.stringify(previous));
      const runner = await refreshOfficialHours([], { outputPath, merchantOutputPath, now: nextAt, fetchPage: vi.fn(async (url) => ({ ...libraryPages.find((page) => page.url === url)!, observedAt: nextPages[0].observedAt })), fetchMerchantPage: vi.fn(async (url) => nextPages.find((page) => page.url === url)!) });
      expect(runner.reviewRequired).toBe(false);
      expect(runner.artifact.weekly.observed_at).toBe(nextPages[0].observedAt);
      expect(runner.merchants?.artifact.review).toHaveLength(1);
      expect(runner.merchants?.artifact.places[0]).toEqual(previous.places[0]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    const repeated = await collectMerchantOfficialHours(collected.artifact, vi.fn(async (url) => nextPages.find((page) => page.url === url)!), nextAt);
    expect(repeated.reviewRequired).toBe(false); expect(repeated.artifact.places[0]).toEqual(previous.places[0]);
    expect(repeated.artifact.review[0].candidate).toEqual(collected.artifact.review[0].candidate);
    expect(merchantHoursForPlace(place(0), repeated.artifact, nextAt).hours).toBeUndefined();
    const transient = await collectMerchantOfficialHours(repeated.artifact, vi.fn(async (url) => { if (url === place(0).website) throw new Error("source unavailable"); return nextPages.find((page) => page.url === url)!; }), nextAt);
    expect(transient.artifact.review[0].candidate).toEqual(repeated.artifact.review[0].candidate);
    expect(transient.artifact.places[0]).toEqual(previous.places[0]); expect(transient.reviewRequired).toBe(false);
  });
  it("keeps new enrollment unpublished and refuses to discard invalid approval state", async () => {
    const fetcher = vi.fn(async (url: string) => pages.find((page) => page.url === url)!);
    const staged = await collectMerchantOfficialHours({ schema_version: 1, places: [], review: [] }, fetcher, now);
    expect(staged.artifact.places).toEqual([]); expect(staged.artifact.review).toHaveLength(3); expect(staged.reviewRequired).toBe(false);
    expect(MERCHANT_HOURS_SOURCES.every((_, i) => !merchantHoursForPlace(place(i), staged.artifact, now).hours)).toBe(true);
    const first = staged.artifact.review[0].candidate!;
    const accepted = acceptReviewedMerchantHoursCandidate(staged.artifact, first.slug, first, now);
    expect(accepted.places).toEqual([first]); expect(accepted.review).toHaveLength(2);
    const repeat = await collectMerchantOfficialHours(accepted, fetcher, now);
    expect(repeat.artifact.places).toEqual([first]); expect(repeat.artifact.review).toHaveLength(2);
    fetcher.mockClear();
    await expect(collectMerchantOfficialHours(undefined, fetcher, now)).rejects.toThrow(/Invalid merchant/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("the real existing refresh runner publishes both bounded artifacts using exactly five injected source reads", async () => {
    const { refreshOfficialHours } = await import("../../scripts/refresh-official-hours");
    const { FCPL_HOURS_URL, FCPL_CLOSURES_URL } = await import("./official-hours");
    const directory = mkdtempSync(join(tmpdir(), "merchant-hour-runner-"));
    const outputPath = join(directory, "libraries.json"), merchantOutputPath = join(directory, "merchants.json");
    writeFileSync(merchantOutputPath, JSON.stringify(parsed()));
    const fetchPage = vi.fn(async (url: string) => ({ url, observedAt: "2026-10-19T23:24:00.000Z", html: readFileSync(url === FCPL_HOURS_URL ? "tests/fixtures/fcpl-hours-index.html" : "tests/fixtures/fcpl-holiday-closings.html", "utf8") }));
    const fetchMerchantPage = vi.fn(async (url: string) => pages.find((page) => page.url === url)!);
    try {
      const result = await refreshOfficialHours([], { outputPath, merchantOutputPath, fetchPage, fetchMerchantPage, now });
      expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([FCPL_HOURS_URL, FCPL_CLOSURES_URL]);
      expect(fetchMerchantPage.mock.calls.map(([url]) => url)).toEqual(MERCHANT_HOURS_SOURCES.map((source) => source.url));
      expect(JSON.parse(readFileSync(outputPath, "utf8")).places).toHaveLength(9);
      expect(JSON.parse(readFileSync(merchantOutputPath, "utf8")).places).toHaveLength(3);
      expect(result.merchants?.reviewRequired).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("bounds transport/body waits, byte count and URL admission without credentials, retries or redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>source</html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchMerchantHoursPage(MERCHANT_HOURS_SOURCES[0].url, fetcher)).resolves.toMatchObject({ html: "<html>source</html>" });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit" });
    await expect(fetchMerchantHoursPage("https://example.com/", fetcher)).rejects.toThrow(/Unapproved/); expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(fetchMerchantHoursPage(MERCHANT_HOURS_SOURCES[0].url, vi.fn(() => new Promise<Response>(() => {})), 10)).rejects.toThrow(/deadline/);
    await expect(fetchMerchantHoursPage(MERCHANT_HOURS_SOURCES[0].url, vi.fn(async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } })), 10)).rejects.toThrow(/deadline/);
    await expect(fetchMerchantHoursPage(MERCHANT_HOURS_SOURCES[0].url, vi.fn(async () => new Response("x".repeat(512001), { headers: { "content-type": "text/html" } })))).rejects.toThrow(/512 KB/);
  });
});
