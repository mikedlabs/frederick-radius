import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentFcpsOperationsNotices,
  getFcpsAlerts,
  getFcpsAlertsResult,
  type FcpsAlert,
} from "@/lib/integrations/fcps";

function rss(items: string, lastBuildDate = "Tue, 21 Jul 2026 18:00:00 GMT"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0">
      <channel>
        <title>FCPS News</title>
        <lastBuildDate>${lastBuildDate}</lastBuildDate>
        ${items}
      </channel>
    </rss>`;
}

function item(
  title: string,
  description: string,
  pubDate = "Tue, 21 Jul 2026 17:30:00 GMT",
): string {
  return `<item>
    <title><![CDATA[${title}]]></title>
    <description><![CDATA[${description}]]></description>
    <link>https://www.fcps.org/update</link>
    <guid>${title}</guid>
    <pubDate>${pubDate}</pubDate>
  </item>`;
}

describe("FCPS RSS availability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T19:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("distinguishes a successful feed with no closure from a failed feed", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(rss(item("Board approves budget", "The board met Tuesday.")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFcpsAlertsResult()).resolves.toEqual({
      data: [],
      available: true,
      asOf: "2026-07-21T18:00:00.000Z",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/syndication/rss.aspx");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/news.rss");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("parses closure, delay, and early-dismissal notices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(rss([
          item("FCPS schools closed Wednesday", "All schools and offices are closed."),
          item("Two-hour delay", "FCPS will open on a two-hour delay."),
          item("Early dismissal", "Schools will dismiss early today."),
        ].join("")), { status: 200 }),
      ),
    );

    const result = await getFcpsAlertsResult();
    expect(result.available).toBe(true);
    expect(result.data.map((alert) => alert.status)).toEqual([
      "closed",
      "delayed",
      "early_dismissal",
    ]);
    expect(result.data[0].published_at).toBe("2026-07-21T17:30:00.000Z");
  });

  it("marks HTTP errors and 200 HTML error pages unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 })),
    );
    expect((await getFcpsAlertsResult()).available).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("<html>temporarily unavailable</html>", { status: 200 })),
    );
    expect((await getFcpsAlertsResult()).available).toBe(false);
  });

  it("ignores unrelated delays and operational notices that are no longer current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(rss([
          item("Bus route delay", "Transit riders should expect a delay."),
          item(
            "FCPS schools closed Monday",
            "All schools are closed.",
            "Mon, 20 Jul 2026 07:00:00 GMT",
          ),
        ].join("")), { status: 200 }),
      ),
    );

    await expect(getFcpsAlertsResult()).resolves.toMatchObject({
      data: [],
      available: true,
    });
  });

  it("keeps the existing alerts wrapper compatible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(rss(item("FCPS schools closed", "Schools are closed.")), { status: 200 }),
      ),
    );
    await expect(getFcpsAlerts()).resolves.toMatchObject([{ status: "closed" }]);
  });
});

describe("current FCPS operations state", () => {
  const alert = (
    id: string,
    status: FcpsAlert["status"],
    publishedAt: string,
  ): FcpsAlert => ({
    id,
    title: id,
    description: "",
    status,
    published_at: publishedAt,
    url: `https://www.fcps.org/${id}`,
  });

  it("lets a newer reopening supersede an older closure", () => {
    const notices = currentFcpsOperationsNotices([
      alert("closed", "closed", "2026-07-27T12:00:00.000Z"),
      alert("reopened", "open", "2026-07-27T15:00:00.000Z"),
    ]);

    expect(notices.map((notice) => notice.id)).toEqual(["reopened"]);
  });

  it("retains multiple notices that share the newest operating state", () => {
    const notices = currentFcpsOperationsNotices([
      alert("old-open", "open", "2026-07-27T11:00:00.000Z"),
      alert("delay-a", "delayed", "2026-07-27T15:00:00.000Z"),
      alert("delay-b", "delayed", "2026-07-27T14:00:00.000Z"),
    ]);

    expect(notices.map((notice) => notice.id)).toEqual(["delay-a", "delay-b"]);
  });
});
