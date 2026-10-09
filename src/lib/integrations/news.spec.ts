import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalHeadlines, getLocalHeadlinesResult, isPublishableHeadline } from "./news";

const NOW = new Date("2026-07-26T16:00:00.000Z");

describe("isPublishableHeadline", () => {
  it("keeps a current local-government headline", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Frederick County opens a new cooling center",
          source: "Frederick County Government",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects obituary and funeral-home listings", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Mary Alice Smith Obituary May 30, 2026",
          source: "Stauffer Funeral Homes",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects real-estate listings", () => {
    expect(
      isPublishableHeadline(
        {
          title: "5986 Passend Dr, Frederick, MD 21703",
          source: "Realtor.com",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects an old notice republished with a fresh feed timestamp", () => {
    expect(
      isPublishableHeadline(
        {
          title: "Frederick Police Invites Residents to Join National Night Out 2024",
          source: "The City of Frederick, MD",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a future-year planning story", () => {
    expect(
      isPublishableHeadline(
        {
          title: "County presents the proposed 2027 capital plan",
          source: "The Frederick News-Post",
        },
        NOW,
      ),
    ).toBe(true);
  });
});


const rss = (...items: string[]) => `<rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const item = (title: string, date?: string, url = "https://news.google.com/rss/articles/fixture") =>
  `<item><title>${title} - The Frederick News-Post</title><link>${url}</link><source>The Frederick News-Post</source>${date === undefined ? "" : `<pubDate>${date}</pubDate>`}</item>`;
const response = (xml: string) => ({ ok: true, text: async () => xml });

describe("local news publication and availability boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("RADIUS_DATA_MODE", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rss())));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("leaves a missing publication date unknown instead of stamping the read time", async () => {
    vi.mocked(fetch).mockResolvedValue(response(rss(item("County announces a public workshop"))) as Response);
    const rows = await getLocalHeadlines();
    expect(rows).toHaveLength(1);
    expect(rows[0].published_at).toBeNull();
  });

  it("keeps a valid sibling when another item has an invalid publication date", async () => {
    vi.mocked(fetch).mockResolvedValue(response(rss(
      item("County announces a public workshop", "not-a-date", "https://news.google.com/rss/articles/unknown"),
      item("Library announces new weekend hours", "Fri, 24 Jul 2026 16:00:00 GMT", "https://news.google.com/rss/articles/dated"),
    )) as Response);
    const rows = await getLocalHeadlines();
    expect(rows.map((row) => row.title)).toEqual([
      "Library announces new weekend hours", "County announces a public workshop",
    ]);
    expect(rows[0].published_at).toBe("2026-07-24T16:00:00.000Z");
    expect(rows[1].published_at).toBeNull();
  });

  it("distinguishes all failed feeds from a successful empty RSS response", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await getLocalHeadlinesResult()).toEqual({ items: [], status: "unavailable" });
    for (const xml of [rss(), "<rss version=\"2.0\"><channel/></rss>"]) {
      vi.mocked(fetch).mockResolvedValue(response(xml) as Response);
      expect(await getLocalHeadlinesResult()).toEqual({ items: [], status: "available" });
    }
  });

  it("retains usable headlines and records a partial feed failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(rss(
      item("County announces a public workshop", "Fri, 24 Jul 2026 16:00:00 GMT"),
    )) as Response).mockRejectedValueOnce(new Error("offline"));
    const result = await getLocalHeadlinesResult();
    expect(result.status).toBe("partial");
    expect(result.items).toHaveLength(1);
  });

  it("does not label an HTTP error page or malformed XML as a successful empty feed", async () => {
    for (const xml of ["<html><body>Try again later</body></html>", "<rss><channel><item></channel></rss>"]) {
      vi.mocked(fetch).mockResolvedValue(response(xml) as Response);
      expect(await getLocalHeadlinesResult()).toEqual({ items: [], status: "unavailable" });
    }
  });

  it("bounds stalled reads and aborts the four existing RSS requests", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation((_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    const pending = getLocalHeadlinesResult();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await pending).toEqual({ items: [], status: "unavailable" });
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled RSS response body and consumes its later failure", async () => {
    let rejectBody: (reason: Error) => void = () => {};
    const body = new Promise<string>((_resolve, reject) => { rejectBody = reject; });
    const signals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return { ok: true, text: () => body } as Response;
    });
    const pending = getLocalHeadlinesResult();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await pending).toEqual({ items: [], status: "unavailable" });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    rejectBody(new Error("late body failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats refused HTTP reads as unavailable without parsing their bodies", async () => {
    const body = vi.fn();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, text: body } as unknown as Response);
    expect(await getLocalHeadlinesResult()).toEqual({ items: [], status: "unavailable" });
    expect(body).not.toHaveBeenCalled();
  });

  it("preserves the existing query set and hourly cache without activating publisher feeds", async () => {
    await getLocalHeadlinesResult();
    const queries = vi.mocked(fetch).mock.calls.map(([url, init]) => {
      const parsed = new URL(String(url));
      expect(parsed.origin).toBe("https://news.google.com");
      expect(parsed.pathname).toBe("/rss/search");
      expect(init).toEqual(expect.objectContaining({ next: { revalidate: 3600 } }));
      return parsed.searchParams.get("q");
    });
    expect(queries).toEqual([
      "Frederick County Maryland",
      '\"Frederick, Md.\" OR \"Frederick, Maryland\"',
      "Thurmont OR Brunswick OR Walkersville OR Middletown OR Emmitsburg OR Woodsboro Maryland",
      '\"Mount Airy\" OR \"New Market\" OR Myersville OR Burkittsville Maryland',
    ]);
  });

  it("makes no provider request in a promoted-data build", async () => {
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    expect(await getLocalHeadlinesResult()).toEqual({ items: [], status: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cleans RSS title entities at the boundary while preserving the article outlink", async () => {
    vi.mocked(fetch).mockResolvedValue(response(rss(item(
      "Arts &amp; culture workshop opens", "Fri, 24 Jul 2026 16:00:00 GMT",
      "https://news.google.com/rss/articles/original?one=1&amp;two=2",
    ))) as Response);
    const { items } = await getLocalHeadlinesResult();
    expect(items[0]).toEqual({
      title: "Arts & culture workshop opens", source: "The Frederick News-Post",
      url: "https://news.google.com/rss/articles/original?one=1&two=2",
      published_at: "2026-07-24T16:00:00.000Z",
    });
  });

  it("keeps the actual local reforestation story while excluding corroborated obituary and comparison-only global matches", async () => {
    vi.setSystemTime(new Date("2026-10-09T14:00:00.000Z"));
    const sourceItem = (title: string, source: string, date: string, key: string) =>
      `<item><title>${title} - ${source}</title><source>${source}</source><link>https://news.google.com/rss/articles/${key}</link><pubDate>${date}</pubDate></item>`;
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(rss(
        sourceItem("Doris Marie Kotchenreuther", "The Frederick News-Post", "Fri, 09 Oct 2026 05:00:00 GMT", "name"),
        sourceItem("Frederick County Secures New Funding To Expand Reforestation Program", "Conduit Street Blog", "Thu, 08 Oct 2026 20:54:33 GMT", "local"),
      )) as Response)
      .mockResolvedValueOnce(response(rss(sourceItem(
        "Doris Kotchenreuther Obituary (2026) - Frederick, MD - The Frederick News-Post", "Legacy | Obituary",
        "Sat, 03 Oct 2026 07:00:00 GMT", "obituary",
      ))) as Response)
      .mockResolvedValueOnce(response(rss(sourceItem(
        "Trump wants a new Camp David-like retreat at his Florida golf club", "Graphic Online",
        "Thu, 08 Oct 2026 10:37:08 GMT", "global",
      ))) as Response);
    const result = await getLocalHeadlinesResult();
    expect(result.status).toBe("available");
    expect(result.items.map((row) => row.title)).toEqual([
      "Frederick County Secures New Funding To Expand Reforestation Program",
    ]);
    expect(result.items[0].published_at).toBe("2026-10-08T20:54:33.000Z");
  });

  it.each([
    ["Frederick County, Virginia approves a new courthouse", "WJLA"],
    ["Virginia's Frederick County approves a new courthouse", "The Frederick News-Post"],
    ["Frederick, Colorado opens a new recreation center", "Local publisher"],
    ["Mount Airy, North Carolina announces a festival", "WJLA"],
    ["Woodsboro, Texas changes its school schedule", "Local publisher"],
    ["Prince Frederick opens a community center", "DC News Now"],
    ["East New Market announces a network expansion", "Local publisher"],
    ["Brunswick approves a school budget", "Global publisher"],
    ["New Market announces a downtown project", "Global publisher"],
    ["40 miles for 40 acres: Maryland minister walks from Brunswick to Augusta for reparations", "Centralmaine.com"],
    ["Trump wants a new Camp David-like retreat at his Florida golf club", "WTOP"],
  ])("does not turn a wrong or ambiguous geography into local news: %s", async (title, source) => {
    vi.mocked(fetch).mockResolvedValue(response(rss(
      `<item><title>${title} - ${source}</title><source>${source}</source><link>https://news.google.com/rss/articles/geography</link><pubDate>Thu, 08 Oct 2026 14:00:00 GMT</pubDate></item>`,
    )) as Response);
    expect((await getLocalHeadlinesResult()).items).toEqual([]);
  });

  it.each([
    ["County council approves its capital plan", "The Frederick News-Post"],
    ["Mayor announces a community listening session", "WFMD"],
    ["Middletown, Maryland announces a community meeting", "Global publisher"],
    ["Frederick County, Maryland announces a public workshop", "Global publisher"],
    ["Thurmont library announces weekend hours", "Global publisher"],
    ["Brunswick announces a community meeting", "WJLA"],
    ["NORAD F-16 deploys flares while intercepting aircraft near Camp David", "WJLA"],
    ["Frederick resident Doris Kotchenreuther receives a volunteer award", "The Frederick News-Post"],
  ])("retains a local profile or a supported local headline: %s", async (title, source) => {
    vi.mocked(fetch).mockResolvedValue(response(rss(
      `<item><title>${title} - ${source}</title><source>${source}</source><link>https://news.google.com/rss/articles/local</link><pubDate>Thu, 08 Oct 2026 14:00:00 GMT</pubDate></item>`,
    )) as Response);
    expect((await getLocalHeadlinesResult()).items[0]?.title).toBe(title);
  });

  it("does not remove an uncorroborated person-only title or a real profile about a corroborated person", async () => {
    const sourced = (title: string, source: string, key: string) =>
      `<item><title>${title} - ${source}</title><source>${source}</source><link>https://news.google.com/rss/articles/${key}</link></item>`;
    vi.mocked(fetch).mockResolvedValue(response(rss(
      sourced("Doris Marie Kotchenreuther", "The Frederick News-Post", "uncorroborated"),
      sourced("David Kotchenreuther", "The Frederick News-Post", "other-person"),
    )) as Response);
    expect((await getLocalHeadlinesResult()).items.map((row) => row.title)).toEqual([
      "Doris Marie Kotchenreuther", "David Kotchenreuther",
    ]);
    vi.mocked(fetch).mockResolvedValue(response(rss(
      sourced("Doris Kotchenreuther receives a volunteer award", "The Frederick News-Post", "profile"),
      sourced("Doris remembers Kotchenreuther", "The Frederick News-Post", "action"),
      sourced("David Kotchenreuther", "The Frederick News-Post", "other-person"),
      sourced("Doris Kotchenreuther Obituary (2026)", "Legacy | Obituary", "corroboration"),
    )) as Response);
    expect((await getLocalHeadlinesResult()).items.map((row) => row.title)).toEqual([
      "Doris Kotchenreuther receives a volunteer award", "Doris remembers Kotchenreuther", "David Kotchenreuther",
    ]);
  });

  it("uses obituary corroboration only from this current feed set", async () => {
    const named = `<item><title>Doris Marie Kotchenreuther - The Frederick News-Post</title><source>The Frederick News-Post</source><link>https://news.google.com/rss/articles/person</link></item>`;
    const obituary = `<item><title>Doris Kotchenreuther Obituary (2026)</title><source>Legacy | Obituary</source><link>https://news.google.com/rss/articles/obituary</link></item>`;
    vi.mocked(fetch).mockResolvedValue(response(rss(named, obituary)) as Response);
    expect((await getLocalHeadlinesResult()).items).toEqual([]);
    vi.mocked(fetch).mockResolvedValue(response(rss(named)) as Response);
    expect((await getLocalHeadlinesResult()).items[0]?.title).toBe("Doris Marie Kotchenreuther");
  });

});
