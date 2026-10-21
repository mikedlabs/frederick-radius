import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, type MerchantHoursArtifact } from "./merchant-hours";
import { getOpenStatus } from "./hours";

const source = MERCHANT_HOURS_SOURCES.find(row => row.slug === "alekos-middletown")!;
const observedAt = "2026-10-21T08:23:25.373Z";
const now = new Date("2026-10-21T08:24:00.000Z");
// This small factual fixture is not the original 773517-byte receipt. The
// private offline proof separately checks that complete body's exact hash.
const html = readFileSync("tests/fixtures/merchant-hours/alekos-middletown.html", "utf8");
const page = { url: source.url, observedAt, html };
const place = { slug: source.slug, category: source.category, website: source.url };
const parse = (body = html) => parseMerchantOfficialHours(source, { ...page, html: body }, now);
const artifact = (): MerchantHoursArtifact => ({ schema_version: 1, places: [parse()], review: [] });
const slots = (close: string) => [{ open: "11:00", close }];
const body = (bytes: number) => html + " ".repeat(bytes - Buffer.byteLength(html));
const response = (value: string, contentLength?: string) => new Response(value, {
  headers: { "content-type": "text/html", ...(contentLength === undefined ? {} : { "content-length": contentLength }) },
});

afterEach(() => vi.unstubAllEnvs());

describe("Aleko's exact native official hours", () => {
  it("retains every posted weekday, explicit closure and actual seven-day evidence window", () => {
    const row = parse();
    expect(row.hours).toEqual({ mon: [], tue: slots("20:00"), wed: slots("20:00"), thu: slots("20:00"), fri: slots("20:30"), sat: slots("20:30"), sun: [] });
    expect(row).toMatchObject({ slug: source.slug, source_url: source.url, source_name: "Aleko's Village Cafe", observed_at: observedAt, source_sha256: createHash("sha256").update(html).digest("hex"), coverage_from: "2026-10-21", coverage_through: "2026-10-28", expires_at: "2026-10-28T08:23:25.373Z", kind: "weekly" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-26T16:00:00Z"))).toMatchObject({ state: "closed" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-23T23:00:00Z"))).toMatchObject({ state: "open" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-23T23:45:00Z"))).toMatchObject({ state: "closing-soon", closesAt: "20:30" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-24T00:30:00Z"))).toMatchObject({ state: "closed" });
    expect(merchantHoursForPlace(place, artifact(), new Date(Date.parse(row.expires_at) - 1)).hours).toBeDefined();
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "0");
    expect(merchantHoursForPlace(place, artifact(), new Date(row.expires_at))).toEqual({ enrolled: true });
  });

  it.each([
    ["name", "Alekos", "Another Cafe"],
    ["prefixed name", "Alekos", "FakeAlekos"],
    ["suffixed name", "Alekos", "AlekosOther"],
    ["street", "6 N Church Street", "7 N Church Street"],
    ["extended street number", "6 N Church Street", "16 N Church Street"],
    ["town", "Middletown, MD 21769", "Frederick, MD 21701"],
    ["phone", "(301) 371-3500", "(301) 371-3501"],
    ["extra phone digit", "(301) 371-3500", "(301) 371-35000"],
    ["prefixed phone digit", "Tel: (301)", "Tel: 1(301)"],
  ])("requires the reviewed %s as well as clocks", (_kind, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow(/Aleko location identity/);
  });

  it.each([
    ["missing day", "<p>Wednesday 11:00 AM–8:00 PM</p>", ""],
    ["missing explicit closure", "Sunday CLOSED", "Sunday"],
    ["unreviewed open Monday", "Monday CLOSED", "Monday 11:00 AM–8:00 PM"],
    ["missing meridiem", "11:00 AM–8:00 PM", "11:00–8:00"],
  ])("holds a %s instead of completing it", (_kind, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow();
  });

  it("accepts an agreeing repeated block but rejects conflicting or unmatched weekday evidence", () => {
    expect(parse(html + html).hours).toEqual(parse().hours);
    expect(() => parse(html + html.replaceAll("8:30 PM", "9:00 PM"))).toThrow(/conflicting/);
    expect(() => parse(html + "<p>Friday CLOSED</p>")).toThrow(/conflicting/);
    expect(() => parse(html + "<p>Hours vary</p>")).toThrow();
  });

  it.each(["Closed today", "Holiday hours apply", "Kitchen hours differ", "Takeout only", "Seasonal hours", "Hours subject to change", "By appointment"])("holds %s", (notice) => {
    expect(() => parse(html + `<p>${notice}</p>`)).toThrow(/notice or service qualifier/);
  });

  it("keeps unsupported structured-hours claims outside the reviewed visible adapter", () => {
    expect(() => parse(html + '<script type="application/ld+json">{"@type":"Restaurant","openingHours":"Fr 11:00-21:00"}</script>')).toThrow(/structured merchant hours/);
    for (const mismatch of [{ ...place, category: "coffee" }, { ...place, website: "https://another.example/" }]) {
      expect(merchantHoursForPlace(mismatch, artifact(), now)).toEqual({ enrolled: true });
    }
  });

  it("stages new native evidence, requires the exact proof, and preserves unrelated holds on acceptance", async () => {
    const previous: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
    const fetcher = vi.fn(async (url: string) => { if (url === source.url) return page; throw new Error("Other sources deliberately unavailable"); });
    const staged = await collectMerchantOfficialHours(previous, fetcher, now);
    expect(staged.artifact.places).toEqual([]);
    const candidate = staged.artifact.review.find(row => row.slug === source.slug)!.candidate!;
    expect(candidate).toEqual(parse());
    const proof = { source_sha256: candidate.source_sha256, observed_at: observedAt };
    expect(() => acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, { ...proof, source_sha256: "0".repeat(64) }, now)).toThrow(/exact pending source proof/);
    expect(() => acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, { ...proof, observed_at: "2026-10-21T08:24:00.000Z" }, now)).toThrow(/exact pending source proof/);
    const accepted = acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, proof, now);
    expect(accepted.places).toEqual([candidate]);
    expect(accepted.review).toEqual(staged.artifact.review.filter(row => row.slug !== source.slug));
    expect(() => acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, proof, new Date(candidate.expires_at))).toThrow(/expired/);
    const held = await collectMerchantOfficialHours(accepted, vi.fn(async () => { throw new Error("Failed refresh"); }), now);
    expect(held.artifact.places).toEqual(accepted.places);
    expect(merchantHoursForPlace(place, held.artifact, now)).toEqual({ enrolled: true });
  });
});

describe("registry-bound merchant response byte caps", () => {
  it("admits the reviewed Aleko-sized body and preserves native request policy", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(body(773517)));
    await expect(fetchMerchantHoursPage(source.url, fetcher)).resolves.toMatchObject({ url: source.url, html: body(773517) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit" });
    expect(MERCHANT_HOURS_SOURCES.filter(row => "max_response_bytes" in row).map(row => row.slug)).toEqual([source.slug]);
  });

  it("accepts exactly 1 MiB for Aleko and retains the existing 512000-byte default", async () => {
    await expect(fetchMerchantHoursPage(source.url, vi.fn(async () => response(body(1_048_576))))).resolves.toMatchObject({ html: body(1_048_576) });
    const ordinary = MERCHANT_HOURS_SOURCES.find(row => !("max_response_bytes" in row) && !("collection" in row))!;
    await expect(fetchMerchantHoursPage(ordinary.url, vi.fn(async () => response(body(512000))))).resolves.toBeDefined();
    await expect(fetchMerchantHoursPage(ordinary.url, vi.fn(async () => response(body(512001))))).rejects.toThrow(/512 KB/);
  });

  it.each([undefined, "1", "invalid"])("enforces the streamed 1 MiB cap with Content-Length=%s", async (length) => {
    await expect(fetchMerchantHoursPage(source.url, vi.fn(async () => response(body(1_048_577), length)))).rejects.toThrow(/1048576 bytes/);
  });

  it("refuses an oversized header early and cancels its body", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start() {}, cancel }), { headers: { "content-type": "text/html", "content-length": "1048577" } }));
    await expect(fetchMerchantHoursPage(source.url, fetcher, 100)).rejects.toThrow(/1048576 bytes/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses invalid configured caps before making a request", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(source, "max_response_bytes")!;
    const fetcher = vi.fn<typeof fetch>();
    try {
      for (const value of [0, -1, 1.5, 1_048_577, Number.POSITIVE_INFINITY]) {
        Object.defineProperty(source, "max_response_bytes", { ...descriptor, value });
        await expect(fetchMerchantHoursPage(source.url, fetcher)).rejects.toThrow(/reviewed merchant response cap/);
      }
      expect(fetcher).not.toHaveBeenCalled();
    } finally { Object.defineProperty(source, "max_response_bytes", descriptor); }
  });

  it("does not admit alternate URLs or the existing manual sources", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchMerchantHoursPage(`${source.url}?max_response_bytes=1048576`, fetcher)).rejects.toThrow(/Unapproved merchant URL/);
    const manual = MERCHANT_HOURS_SOURCES.find(row => "collection" in row && row.collection === "manual")!;
    await expect(fetchMerchantHoursPage(manual.url, fetcher)).rejects.toThrow(/native fetching is disabled/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
