import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  featuredPoliceRelease,
  getCivicPressReleasesResult,
  officialCivicNews,
  type CivicPressItem,
} from "./civic-press";

const NOW = Date.parse("2026-07-21T20:00:00.000Z");

function policeItem(title: string, ageHours: number): CivicPressItem {
  return {
    title,
    url: `https://example.gov/${encodeURIComponent(title)}`,
    source: "City of Frederick",
    sourceShort: "City",
    publishedAt: new Date(NOW - ageHours * 3_600_000).toISOString(),
    lane: "police",
  };
}

describe("featuredPoliceRelease", () => {
  it("does not promote a routine police announcement", () => {
    const item = policeItem("Frederick Police Invites Community to National Night Out", 1);
    expect(featuredPoliceRelease([item], NOW)).toBeNull();
  });

  it.each([
    "Frederick Police Announces Shooting Range Training",
    "Police Academy Hosts Active Shooter Drill",
    "Frederick Police Hold Community Meeting About a Recent Shooting",
    "Emergency Preparedness Training Announcement",
  ])("does not promote the routine title %s", (title) => {
    expect(featuredPoliceRelease([policeItem(title, 1)], NOW)).toBeNull();
  });

  it("does not promote an old urgent release", () => {
    const item = policeItem("Frederick Police Investigate Shooting", 8);
    expect(featuredPoliceRelease([item], NOW)).toBeNull();
  });

  it("finds a fresh urgent release even when a newer routine item exists", () => {
    const routine = policeItem("Frederick Police Announces Community Meeting", 0.5);
    const urgent = policeItem("Frederick Police Investigate Shooting", 1);

    expect(featuredPoliceRelease([routine, urgent], NOW)?.url).toBe(urgent.url);
  });

  it.each([
    "Frederick Police Investigate Shooting",
    "Police Announce Arrest in Fatal Shooting",
    "Emergency Announcement: Shelter in Place",
  ])("keeps the real incident or directive %s eligible", (title) => {
    expect(featuredPoliceRelease([policeItem(title, 1)], NOW)?.title).toBe(title);
  });
});

describe("promoted-data build boundary", () => {
  it("does not request civic feeds while generating a release", async () => {
    const previous = process.env.RADIUS_DATA_MODE;
    process.env.RADIUS_DATA_MODE = "promoted";
    try {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const result = await getCivicPressReleasesResult();
      expect(fetch).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
      expect(result.sourceHealth).toEqual({
        degraded: true,
        unavailable: ["City of Frederick", "Frederick County"],
      });
    } finally {
      vi.unstubAllGlobals();
      if (previous === undefined) delete process.env.RADIUS_DATA_MODE;
      else process.env.RADIUS_DATA_MODE = previous;
    }
  });
});


type FeedRow = { title: string; url: string; date?: string; extra?: string };
const rss = (...rows: FeedRow[]) => `<rss version="2.0"><channel><title>Official newsroom</title>${rows.map((row) =>
  `<item><title><![CDATA[${row.title}]]></title><link><![CDATA[${row.url}]]></link>${row.date === undefined ? "" : `<pubDate>${row.date}</pubDate>`}${row.extra ?? ""}</item>`).join("")}</channel></rss>`;
const CITY_NEWS = "Frederick-News-1";
const CURRENT = "2026-10-12T12:00:00.000Z";
const cityRow = (overrides: Partial<FeedRow> = {}): FeedRow => ({ title: "City announces a Freecycle event",
  url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=101", date: "Wed, 07 Oct 2026 14:23:00 -0500", ...overrides });
const countyRow = (overrides: Partial<FeedRow> = {}): FeedRow => ({ title: "County announces a reforestation program",
  url: "https://frederickcountymd.gov/CivicAlerts.aspx?AID=202", date: "Thu, 08 Oct 2026 12:00:00 GMT", ...overrides });
const officialFetch = (responses: { city?: string | Response; county?: string | Response; safety?: string | Response } = {}) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes(CITY_NEWS) ? responses.city ?? rss(cityRow())
      : url.includes("frederickcountymd.gov") ? responses.county ?? rss(countyRow()) : responses.safety ?? rss();
    return body instanceof Response ? body : new Response(body, { headers: { "content-type": "application/rss+xml" } });
  });

beforeEach(() => {
  vi.stubEnv("RADIUS_DATA_MODE", "");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(CURRENT));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("official newsroom runtime", () => {
  it("reads the verified subscriptions, preserves separate City/County scope and original offsets", async () => {
    const fetch = officialFetch();
    vi.stubGlobal("fetch", fetch);
    const result = await getCivicPressReleasesResult();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=1&CID=Frederick-News-1",
      "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml",
      "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml",
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({ title: countyRow().title, source: "Frederick County", sourceShort: "County",
        url: "https://www.frederickcountymd.gov/CivicAlerts.aspx?aid=202", publishedAt: "2026-10-08T12:00:00.000Z" }),
      expect.objectContaining({ title: cityRow().title, source: "City of Frederick", sourceShort: "City",
        url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?aid=101", publishedAt: "2026-10-07T19:23:00.000Z" }),
    ]);
    expect(result.sourceChecks).toEqual([
      expect.objectContaining({ id: "city_official_news", scope: "city", channel: "news", status: "available", checkedAt: CURRENT, latestPublishedAt: "2026-10-07T19:23:00.000Z" }),
      expect.objectContaining({ id: "county_official_news", scope: "county", channel: "news", status: "available", checkedAt: CURRENT, latestPublishedAt: "2026-10-08T12:00:00.000Z" }),
      expect.objectContaining({ id: "city_official_releases", channel: "safety", status: "empty", checkedAt: CURRENT, latestPublishedAt: null }),
    ]);
    expect(officialCivicNews(result).status).toBe("available");
    for (const [, options] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(options.cache).toBe("no-store");
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("preserves dated broad City civic notices alongside separate police/advisory lanes", async () => {
    vi.stubGlobal("fetch", officialFetch({ safety: rss(
      cityRow({ title: "Frederick Police Investigate Shooting", url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=301" }),
      cityRow({ title: "Water main traffic advisory", url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=302" }),
      cityRow({ title: "ALL CITY SPORTS FIELDS ARE CLOSED TODAY 10-11-2026", url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=303", date: "Sun, 11 Oct 2026 07:29:15 -0500" }),
    ) }));
    const result = await getCivicPressReleasesResult();
    expect(result.items.map((item) => item.lane).sort()).toEqual(["advisory", "civic", "civic", "civic", "police"]);
    const notice = result.items.find((item) => item.title.includes("SPORTS FIELDS"));
    expect(notice).toMatchObject({ sourceId: "city_official_releases", lane: "civic", publishedAt: "2026-10-11T12:29:15.000Z" });
    expect(officialCivicNews(result).items.map((item) => item.title)).toEqual([notice?.title, countyRow().title, cityRow().title]);
    expect(result.sourceChecks?.[2]).toMatchObject({ checkedAt: CURRENT, latestPublishedAt: "2026-10-11T12:29:15.000Z" });
    expect(featuredPoliceRelease(result.items)).toBeNull();
    expect(result.sourceHealth).toEqual({ degraded: false, unavailable: [] });
  });

  it("does not let a failed City normal-news subscription imply that its police/advisory feed failed", async () => {
    vi.stubGlobal("fetch", officialFetch({ city: new Response("unavailable", { status: 503 }) }));
    const result = await getCivicPressReleasesResult();
    expect(officialCivicNews(result).status).toBe("partial");
    expect(result.sourceHealth).toEqual({ degraded: false, unavailable: [] });
    expect(result.sourceChecks?.[0]).toMatchObject({ status: "unavailable", reason: "request_failed", checkedAt: CURRENT, latestPublishedAt: null });
    expect(result.items[0].source).toBe("Frederick County");
  });

  it("preserves safety uncertainty when the broad City feed fails even though normal news works", async () => {
    vi.stubGlobal("fetch", officialFetch({ safety: new Response("unavailable", { status: 503 }) }));
    const result = await getCivicPressReleasesResult();
    expect(officialCivicNews(result).status).toBe("partial");
    expect(result.sourceHealth).toEqual({ degraded: true, unavailable: ["City of Frederick"] });
  });

  it.each(["<html><body>Service unavailable</body></html>", "<rss><channel><item></channel></rss>",
    "<rss/>", "<rss><channel>not a channel</channel></rss>", '<!DOCTYPE rss [<!ENTITY text "unsafe">]><rss><channel/></rss>',
    "<rss><channel/><channel/></rss>"])("marks malformed/wrong-shape XML unavailable rather than healthy empty: %s", async (body) => {
    vi.stubGlobal("fetch", officialFetch({ city: body }));
    const result = await getCivicPressReleasesResult();
    expect(result.sourceChecks?.[0]).toMatchObject({ status: "unavailable", reason: "invalid_feed", latestPublishedAt: null });
    expect(officialCivicNews(result).status).toBe("partial");
    expect(result.items).toHaveLength(1);
  });

  it.each([rss(), "<rss><channel/></rss>"])("accepts a validated empty newsroom without fabricating a publication time", async (body) => {
    vi.stubGlobal("fetch", officialFetch({ city: body, county: body, safety: body }));
    const result = await getCivicPressReleasesResult();
    expect(result.items).toEqual([]);
    expect(result.sourceHealth).toEqual({ degraded: false, unavailable: [] });
    expect(result.sourceChecks?.every((source) => source.status === "empty" && source.checkedAt === CURRENT && source.latestPublishedAt === null)).toBe(true);
    expect(officialCivicNews(result).status).toBe("available");
  });

  it("deduplicates actual CivicPlus identity across scheme, host, aid case and tracking aliases", async () => {
    const title = "Frederick Police Investigate Shooting";
    vi.stubGlobal("fetch", officialFetch({ city: rss(cityRow({ title, url: "http://cityoffrederickmd.gov/CivicAlerts.aspx?AID=101&CID=1&utm_source=reader#top" })),
      safety: rss(cityRow({ title, url: "https://www.cityoffrederickmd.gov/civicalerts.aspx?aid=101" })) }));
    const result = await getCivicPressReleasesResult();
    expect(result.items.filter((item) => item.title === title)).toHaveLength(1);
    expect(result.items.find((item) => item.title === title)?.url).toBe("https://www.cityoffrederickmd.gov/CivicAlerts.aspx?aid=101");
  });

  it("keeps the latest actual publication when overlapping subscriptions advertise the same canonical release", async () => {
    const title = "Frederick Police Investigate Shooting";
    vi.stubGlobal("fetch", officialFetch({
      city: rss(cityRow({ title, date: "Sat, 10 Oct 2026 12:00:00 GMT" })),
      safety: rss(cityRow({ title, date: "Mon, 12 Oct 2026 11:00:00 GMT" })),
    }));
    const result = await getCivicPressReleasesResult();
    expect(result.items.filter((item) => item.title === title)).toHaveLength(1);
    expect(featuredPoliceRelease(result.items)?.publishedAt).toBe("2026-10-12T11:00:00.000Z");
    expect(result.sourceChecks?.[2].latestPublishedAt).toBe("2026-10-12T11:00:00.000Z");
  });

  it("deduplicates a civic release repeated by City subscriptions with one deterministic actual provenance", async () => {
    vi.stubGlobal("fetch", officialFetch({ safety: rss(cityRow()) }));
    const result = await getCivicPressReleasesResult();
    const city = officialCivicNews(result).items.filter((item) => item.source === "City of Frederick");
    expect(city).toHaveLength(1);
    expect(city[0]).toMatchObject({ sourceId: "city_official_news", publishedAt: "2026-10-07T19:23:00.000Z" });
    expect(result.sourceChecks?.filter((source) => source.source === "City of Frederick").map((source) => source.status)).toEqual(["available", "available"]);
  });

  it("keeps broad City civic coverage usable when the dedicated City newsroom fails", async () => {
    vi.stubGlobal("fetch", officialFetch({ city: new Response("offline", { status: 503 }), safety: rss(cityRow({
      title: "ALL CITY SPORTS FIELDS ARE CLOSED TODAY 10-11-2026", date: "Sun, 11 Oct 2026 07:29:15 -0500",
    })) }));
    const official = officialCivicNews(await getCivicPressReleasesResult());
    expect(official.status).toBe("partial");
    expect(official.items.find((item) => item.source === "City of Frederick")).toMatchObject({ sourceId: "city_official_releases", lane: "civic", publishedAt: "2026-10-11T12:29:15.000Z" });
    expect(official.sources?.map((source) => [source.id, source.status])).toEqual([
      ["city_official_news", "unavailable"], ["county_official_news", "available"], ["city_official_releases", "available"],
    ]);
  });

  it("does not call missing configured subscription coverage fully available", async () => {
    vi.stubGlobal("fetch", officialFetch());
    const result = await getCivicPressReleasesResult();
    result.sourceChecks = result.sourceChecks?.filter((source) => source.id !== "city_official_releases");
    const official = officialCivicNews(result);
    expect(official.status).toBe("partial");
    expect(official.sources).toHaveLength(3);
    expect(official.sources?.[2]).toMatchObject({ id: "city_official_releases", status: "unavailable", checkedAt: null });
  });

  it("keeps separate official publishers when their cross-post headlines happen to match", async () => {
    vi.stubGlobal("fetch", officialFetch({ county: rss(countyRow({ title: cityRow().title })) }));
    expect((await getCivicPressReleasesResult()).items.map((item) => item.source).sort()).toEqual(["City of Frederick", "Frederick County"]);
  });

  it.each([undefined, "not a date", "Wed, 07 Oct 2026 14:23:00", "Tue, 13 Oct 2026 12:00:00 GMT"])("retains an unknown date without manufacturing a current publication: %s", async (date) => {
    vi.stubGlobal("fetch", officialFetch({ city: rss(cityRow({ date })), county: rss() }));
    const result = await getCivicPressReleasesResult();
    expect(result.items[0].publishedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(result.sourceChecks?.[0].latestPublishedAt).toBeNull();
    expect(result.sourceChecks?.[0].checkedAt).toBe(CURRENT);
    expect(featuredPoliceRelease(result.items)).toBeNull();
  });

  it("retains old article dates separately from a successful recent check and will not promote old police news", async () => {
    const title = "Frederick Police Investigate Shooting";
    vi.stubGlobal("fetch", officialFetch({ safety: rss(cityRow({ title, url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=301", date: "Thu, 01 Oct 2026 12:00:00 GMT" })) }));
    const result = await getCivicPressReleasesResult();
    expect(result.items.find((item) => item.title === title)?.publishedAt).toBe("2026-10-01T12:00:00.000Z");
    expect(result.sourceChecks?.[2]).toMatchObject({ checkedAt: CURRENT, latestPublishedAt: "2026-10-01T12:00:00.000Z" });
    expect(featuredPoliceRelease(result.items)).toBeNull();
    const stale = officialCivicNews(result, Date.parse(CURRENT) + 61 * 60_000);
    expect(stale.status).toBe("unavailable");
    expect(stale.sources?.every((source) => source.reason === "stale" && source.checkedAt === CURRENT)).toBe(true);
    expect(stale.items).toHaveLength(2);
  });

  it("uses cleaned headline metadata only, without descriptions or photo enclosures", async () => {
    vi.stubGlobal("fetch", officialFetch({ city: rss(cityRow({ title: "City &amp; County <b>Freecycle</b>",
      extra: '<description>Private full article content must not be republished</description><enclosure url="https://example.test/photo.jpg" type="image/jpeg" />' })) }));
    const result = await getCivicPressReleasesResult();
    const item = result.items.find((item) => item.source === "City of Frederick");
    expect(item?.title).toBe("City & County Freecycle");
    expect(JSON.stringify(result)).not.toContain("Private full article");
    expect(JSON.stringify(result)).not.toContain("photo.jpg");
    expect(item).not.toHaveProperty("imageUrl");
  });

  it.each(["javascript:alert(1)", "data:text/html,news", "//www.cityoffrederickmd.gov/news", "/CivicAlerts.aspx?AID=1",
    "https:county.example/news", "https://", "https://county.example\\news", "https://reader:secret@cityoffrederickmd.gov/news",
    "https://www.cityoffrederickmd.gov/line\nbreak", "https://www.frederickcountymd.gov/CivicAlerts.aspx?AID=1",
    "https://www.cityoffrederickmd.gov.evil.test/CivicAlerts.aspx?AID=1", "https://www.cityoffrederickmd.gov:444/news",
    "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=not-an-id"])("rejects unsupported or misattributed article links: %s", async (url) => {
    vi.stubGlobal("fetch", officialFetch({ city: rss(cityRow({ url })), county: rss() }));
    const result = await getCivicPressReleasesResult();
    expect(result.items).toEqual([]);
    expect(result.sourceHealth).toEqual({ degraded: false, unavailable: [] });
  });

  it("bounds declared and streamed XML size without letting one newsroom hide the other", async () => {
    vi.stubGlobal("fetch", officialFetch({ city: new Response("too large", { headers: { "content-length": String(512 * 1024 + 1) } }),
      safety: new Response("x".repeat(512 * 1024 + 1)) }));
    const result = await getCivicPressReleasesResult();
    expect(officialCivicNews(result).status).toBe("partial");
    expect(result.items.map((item) => item.source)).toEqual(["Frederick County"]);
    expect(result.sourceChecks?.filter((source) => source.status === "unavailable")).toHaveLength(2);
  });

  it("bounds a stalled fetch even when it ignores cancellation, retaining the healthy other newsroom", async () => {
    const fallback = officialFetch();
    const fetch = vi.fn((url: string, options: RequestInit) => {
      expect(options.cache).toBe("no-store");
      return url.includes(CITY_NEWS) ? new Promise<Response>(() => {}) : fallback(url);
    });
    vi.stubGlobal("fetch", fetch);
    const pending = getCivicPressReleasesResult();
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    expect(officialCivicNews(result).status).toBe("partial");
    expect(result.items[0].source).toBe("Frederick County");
    const options = fetch.mock.calls.find(([url]) => url.includes(CITY_NEWS))?.[1];
    expect(options?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled response body and cancels its stream", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("<rss>")); }, cancel });
    vi.stubGlobal("fetch", officialFetch({ city: new Response(body) }));
    const pending = getCivicPressReleasesResult();
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    expect(result.sourceChecks?.[0].status).toBe("unavailable");
    expect(result.items[0].source).toBe("Frederick County");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
