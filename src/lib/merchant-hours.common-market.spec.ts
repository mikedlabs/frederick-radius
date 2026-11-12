import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, type MerchantHoursArtifact, type MerchantHoursSource } from "./merchant-hours";
import { getOpenStatus } from "./hours";

const url = "https://www.commonmarket.coop/";
const slugs = ["common-market-frederick", "common-market"];
const sources = () => slugs.map((slug) => {
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === slug);
  if (!source) throw new Error(`Missing reviewed Common Market source: ${slug}`);
  return source;
});
const observedAt = "2026-10-21T11:25:55.197Z";
const now = new Date("2026-10-21T11:26:00.000Z");
const html = readFileSync("tests/fixtures/merchant-hours/common-market.html", "utf8");
const page = { url, observedAt, html };
const parse = (source: MerchantHoursSource, body = html) => parseMerchantOfficialHours(source, { ...page, html: body }, now);
const place = (source: MerchantHoursSource) => ({ slug: source.slug, category: source.category, website: source.url });
const empty = (): MerchantHoursArtifact => ({ schema_version: 1, places: [], review: [] });
const fetchOnlyCommon = (receipt = page) => vi.fn(async (requested: string) => {
  if (requested === url) return receipt;
  throw new Error("Other native sources are deliberately outside this fixture cohort.");
});

describe("Common Market exact grocery hours", () => {
  it("binds the one unqualified Daily store schedule to both exact grocery identities", () => {
    expect(sources().map((source) => source.category)).toEqual(["market", "market"]);
    for (const source of sources()) {
      const row = parse(source);
      expect(row.hours).toEqual(Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [{ open: "08:00", close: "21:00" }]])));
      expect(row).toMatchObject({ slug: source.slug, source_url: url, observed_at: observedAt,
        source_sha256: createHash("sha256").update(html).digest("hex"),
        expires_at: "2026-10-28T11:25:55.197Z", coverage_from: "2026-10-21", coverage_through: "2026-10-28" });
      const artifact: MerchantHoursArtifact = { schema_version: 1, places: [row], review: [] };
      const hours = merchantHoursForPlace(place(source), artifact, now).hours!;
      expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-21T12:30:00Z"))).toMatchObject({ state: "open" });
      expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-22T01:00:00Z"))).toMatchObject({ state: "closed" });
      expect(merchantHoursForPlace(place(source), artifact, new Date(row.expires_at))).toEqual({ enrolled: true });
      expect(merchantHoursForPlace({ ...place(source), category: "coffee" }, artifact, now)).toEqual({ enrolled: true });
      expect(merchantHoursForPlace({ ...place(source), website: "https://another.example/" }, artifact, now)).toEqual({ enrolled: true });
    }
  });

  it.each([
    ["other street", "927 W 7th Street", "929 W 7th Street"],
    ["wrong postal code", "21704", "21701"],
    ["wrong town", "Frederick", "Brunswick"],
    ["main contact missing", "(301) 663-3416", "(301) 663-3417"],
    ["partial week", "Daily", "Monday to Saturday"],
    ["missing meridiem", "8am - 9pm", "8 - 9"],
    ["service-only schedule", "8am - 9pm Daily", "Café 8am - 9pm Daily"],
    ["overnight schedule", "8am - 9pm", "9pm - 8am"],
    ["hidden contact", '<address class="vcard"', '<address hidden class="vcard"'],
  ])("withholds %s without filling or broadening facts", (_kind, from, to) => {
    for (const source of sources()) expect(() => parse(source, html.replaceAll(from, to))).toThrow();
  });

  it.each([
    "<p>Store hours 9am - 8pm Daily</p>",
    '<div class="hours">9am - 8pm Daily</div>',
    "<p>Closed today</p>", "<p>Holiday hours apply</p>", "<p>Hours vary</p>", "<p>Reduced hours today</p>",
    '<script type="application/ld+json">{"@type":"LocalBusiness","openingHours":"Mo 09:00-20:00"}</script>',
  ])("holds a conflicting or unreviewed schedule/notice: %s", (extra) => {
    for (const source of sources()) expect(() => parse(source, html.replace("</body>", `${extra}</body>`))).toThrow();
  });

  it("keeps an unrelated event time separate from store hours and cafe contact labels", () => {
    for (const source of sources()) {
      const event = html.replace("</body>", "<section><h2>Community event</h2><p>Friday from 6pm to 8pm.</p></section></body>");
      expect(parse(source, event).hours).toEqual(parse(source).hours);
    }
  });

  it("reuses exactly one immutable receipt per run while each listing keeps independent acceptance", async () => {
    const fetcher = fetchOnlyCommon();
    const staged = await collectMerchantOfficialHours(empty(), fetcher, now);
    expect(fetcher.mock.calls.filter(([requested]) => requested === url)).toHaveLength(1);
    const candidates = sources().map((source) => staged.artifact.review.find((row) => row.slug === source.slug)!.candidate!);
    expect(candidates.map((row) => row.source_sha256)).toEqual([createHash("sha256").update(html).digest("hex"), createHash("sha256").update(html).digest("hex")]);
    expect(candidates.map((row) => row.observed_at)).toEqual([observedAt, observedAt]);
    for (const source of sources()) expect(merchantHoursForPlace(place(source), staged.artifact, now)).toEqual({ enrolled: true });
    expect(() => acceptReviewedMerchantHoursCandidate(staged.artifact, slugs[0], { ...candidates[0], source_sha256: "0".repeat(64) }, now)).toThrow(/exact pending source proof/);
    const firstAccepted = acceptReviewedMerchantHoursCandidate(staged.artifact, slugs[0], candidates[0], now);
    expect(merchantHoursForPlace(place(sources()[0]), firstAccepted, now).hours).toBeDefined();
    expect(merchantHoursForPlace(place(sources()[1]), firstAccepted, now)).toEqual({ enrolled: true });
    const otherHolds = firstAccepted.review.filter((row) => !slugs.includes(row.slug));
    const newer = { ...page, observedAt: "2026-10-21T11:27:00.000Z" };
    const secondFetcher = fetchOnlyCommon(newer);
    const second = await collectMerchantOfficialHours(firstAccepted, secondFetcher, new Date(newer.observedAt));
    expect(secondFetcher.mock.calls.filter(([requested]) => requested === url)).toHaveLength(1);
    expect(second.artifact.places.find((row) => row.slug === slugs[0])?.observed_at).toBe(newer.observedAt);
    expect(second.artifact.review.find((row) => row.slug === slugs[1])?.candidate?.observed_at).toBe(newer.observedAt);
    expect(merchantHoursForPlace(place(sources()[1]), second.artifact, now)).toEqual({ enrolled: true });
    expect(second.artifact.review.filter((row) => !slugs.includes(row.slug))).toEqual(otherHolds.map((row) => ({ ...row, checked_at: newer.observedAt })));
    expect(page.observedAt).toBe(observedAt);
  });

  it("shares one failed attempt but never renews evidence, clears holds, or caches across runs", async () => {
    const fetcher = vi.fn<(requested: string) => Promise<typeof page>>().mockRejectedValue(new Error("Deliberate offline transport failure"));
    const previous: MerchantHoursArtifact = { schema_version: 1, places: sources().map((source) => parse(source)), review: [] };
    const first = await collectMerchantOfficialHours(previous, fetcher, now);
    expect(fetcher.mock.calls.filter(([requested]) => requested === url)).toHaveLength(1);
    expect(first.artifact.places).toEqual(previous.places);
    for (const source of sources()) {
      expect(first.artifact.review.find((row) => row.slug === source.slug)?.reason).toBe("source_unavailable");
      expect(merchantHoursForPlace(place(source), first.artifact, now)).toEqual({ enrolled: true });
    }
    await collectMerchantOfficialHours(previous, fetcher, now);
    expect(fetcher.mock.calls.filter(([requested]) => requested === url)).toHaveLength(2);
  });

  it("keeps both bindings on the ordinary bounded native transport", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(html, { headers: { "content-type": "text/html" } }));
    await expect(fetchMerchantHoursPage(url, fetcher)).resolves.toMatchObject({ url, html });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit" });
    expect(sources().some((source) => "max_response_bytes" in source)).toBe(false);
    await expect(fetchMerchantHoursPage(url, vi.fn(async () => new Response("x".repeat(512001), { headers: { "content-type": "text/html" } })))).rejects.toThrow(/512 KB/);
  });
});
