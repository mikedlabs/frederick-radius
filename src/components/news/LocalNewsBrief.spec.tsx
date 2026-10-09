// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsHeadline } from "@/lib/integrations/news";
import type { CivicPressItem } from "@/lib/integrations/civic-press";
import LocalNewsBrief, { LOCAL_NEWS_BRIEF_DEADLINE_MS, LocalNewsLoading } from "./LocalNewsBrief";
import LocalNewsBriefView from "./LocalNewsBriefView";

const providers = vi.hoisted(() => ({ news: vi.fn(), press: vi.fn() }));
vi.mock("@/lib/integrations/news", () => ({ getLocalHeadlinesResult: providers.news }));
vi.mock("@/lib/integrations/civic-press", () => ({ getCivicPressReleasesResult: providers.press }));

const HEADLINES: NewsHeadline[] = Array.from({ length: 4 }, (_, i) => ({
  title: `Local publisher headline ${i + 1}`,
  source: "Local publisher",
  url: `https://news.google.com/rss/articles/original-${i + 1}`,
  published_at: "2026-10-08T14:15:00.000Z",
}));
const PRESS: CivicPressItem[] = Array.from({ length: 3 }, (_, i) => ({
  title: `County civic announcement ${i + 1}`,
  source: "Frederick County", sourceShort: "County", lane: "civic",
  url: `https://www.frederickcountymd.gov/CivicAlerts.aspx?AID=fixture-${i + 1}`,
  publishedAt: "2026-10-07T15:00:00.000Z",
}));
const parser = new DOMParser();
const documentOf = (html: string) => parser.parseFromString(html, "text/html");
const renderBrief = async () => renderToStaticMarkup(await LocalNewsBrief());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T20:00:00.000Z"));
  providers.news.mockResolvedValue({ items: HEADLINES, status: "available" });
  providers.press.mockResolvedValue({ items: PRESS, sourceHealth: { degraded: false, unavailable: [] } });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected provider request"))));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("compact local news composition", () => {
  it("shows three source-attributed headlines with real dates and original article outlinks", async () => {
    const doc = documentOf(await renderBrief());
    const links = [...doc.querySelectorAll("a[target='_blank']")];
    expect(links).toHaveLength(5);
    expect(links[0].getAttribute("href")).toBe(HEADLINES[0].url);
    expect(links[0].textContent).toContain("Local publisher");
    expect(links[0].textContent).toContain("Published Oct 8, 2026, 10:15 AM EDT");
    expect(links[0].querySelector("time")?.getAttribute("datetime")).toBe(HEADLINES[0].published_at);
    expect(links.every((link) => link.getAttribute("rel") === "noopener noreferrer")).toBe(true);
    expect(doc.body.textContent).not.toContain(HEADLINES[3].title);
    expect(doc.body.textContent).not.toContain(PRESS[2].title);
    expect(doc.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps official civic updates separate from police and safety advisory lanes", async () => {
    providers.press.mockResolvedValue({
      items: [{ ...PRESS[0], title: "Safety advisory fixture", lane: "advisory" },
        { ...PRESS[0], title: "Police fixture", lane: "police" }, ...PRESS],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    const doc = documentOf(await renderBrief());
    const official = doc.querySelector("details");
    expect(official?.textContent).toContain("Official updates");
    expect(official?.textContent).toContain("Frederick County");
    expect(official?.textContent).not.toContain("Safety advisory fixture");
    expect(official?.textContent).not.toContain("Police fixture");
  });

  it("does not fabricate dates for unknown news dates or legacy undated civic rows", async () => {
    providers.news.mockResolvedValue({ items: [{ ...HEADLINES[0], published_at: null }], status: "available" });
    providers.press.mockResolvedValue({
      items: [{ ...PRESS[0], publishedAt: "1970-01-01T00:00:00.000Z" }],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    const doc = documentOf(await renderBrief());
    expect(doc.querySelectorAll("time")).toHaveLength(0);
    expect(doc.body.textContent?.match(/Publication date unavailable/g)).toHaveLength(2);
    expect(doc.body.textContent).not.toContain("Oct 9");
    expect(doc.body.textContent).not.toContain("Just now");
  });

  it("shows unavailable copy without claiming a successful empty response", async () => {
    providers.news.mockRejectedValue(new Error("offline"));
    providers.press.mockRejectedValue(new Error("offline"));
    const html = await renderBrief();
    expect(html).toContain("Local headlines are unavailable right now.");
    expect(html).toContain("Official city and county updates are unavailable right now.");
    expect(html).not.toContain("No local headlines were returned");
    expect(html).not.toContain("No civic updates were returned");
  });

  it("labels a successful empty read as empty rather than unavailable", async () => {
    providers.news.mockResolvedValue({ items: [], status: "available" });
    providers.press.mockResolvedValue({ items: [], sourceHealth: { degraded: false, unavailable: [] } });
    const html = await renderBrief();
    expect(html).toContain("No local headlines were returned by these feeds.");
    expect(html).toContain("No civic updates were returned by these newsrooms.");
    expect(html).not.toContain("are unavailable");
  });

  it("retains readable results and identifies a partial feed failure", async () => {
    providers.news.mockResolvedValue({ items: HEADLINES, status: "partial" });
    providers.press.mockResolvedValue({ items: PRESS, sourceHealth: { degraded: true, unavailable: ["City of Frederick"] } });
    const html = await renderBrief();
    expect(html).toContain("Some local headline feeds are unavailable.");
    expect(html).toContain("Some official newsroom feeds are unavailable.");
    expect(html).toContain(HEADLINES[0].title);
    expect(html).toContain(PRESS[0].title);
  });

  it("does not claim partial empty results are shown below", async () => {
    providers.news.mockResolvedValue({ items: [], status: "partial" });
    providers.press.mockResolvedValue({ items: [], sourceHealth: { degraded: true, unavailable: ["City of Frederick"] } });
    const html = await renderBrief();
    expect(html).toContain("No headlines were returned by the feeds that responded.");
    expect(html).toContain("No civic updates were returned by the newsrooms that responded.");
    expect(html).not.toContain("shown below");
  });

  it("does not wait for the whole Pulse or a stalled official newsroom before showing news", async () => {
    providers.press.mockImplementation(() => new Promise(() => {}));
    const pending = renderBrief();
    await vi.advanceTimersByTimeAsync(LOCAL_NEWS_BRIEF_DEADLINE_MS);
    const html = await pending;
    expect(html).toContain(HEADLINES[0].title);
    expect(html).toContain("Official city and county updates are unavailable right now.");
    expect(providers.news).toHaveBeenCalledTimes(1);
    expect(providers.press).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds both slow optional reads and renders honest unavailable states", async () => {
    providers.news.mockImplementation(() => new Promise(() => {}));
    providers.press.mockImplementation(() => new Promise(() => {}));
    const pending = renderBrief();
    await vi.advanceTimersByTimeAsync(LOCAL_NEWS_BRIEF_DEADLINE_MS);
    expect(await pending).toContain("Local headlines are unavailable right now.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["javascript:alert(1)", "data:text/html,news", "//county.example/news", "https:county.example/news"])("does not turn an unsupported cached article URL into an outlink: %s", (url) => {
    const doc = documentOf(renderToStaticMarkup(createElement(LocalNewsBriefView, {
      news: { items: [{ ...HEADLINES[0], url }], status: "available" },
      official: { items: [{ ...PRESS[0], url }], status: "available" },
    })));
    expect(doc.querySelectorAll("a[target='_blank']")).toHaveLength(0);
    expect(doc.body.textContent).toContain(HEADLINES[0].title);
    expect(doc.body.textContent).toContain(PRESS[0].title);
    expect(doc.body.textContent?.match(/Article link unavailable/g)).toHaveLength(2);
    expect(doc.querySelectorAll("time")).toHaveLength(2);
    expect(doc.body.textContent).toContain("Local publisher");
    expect(doc.body.textContent).toContain("Frederick County");
  });

  it("keeps loading distinct from feed failure and leaves Pulse with its six-story limit", () => {
    const loading = documentOf(renderToStaticMarkup(createElement(LocalNewsLoading)));
    expect(loading.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
    expect(loading.body.textContent).toContain("Local headlines are loading.");
    const html = renderToStaticMarkup(createElement(LocalNewsBriefView, {
      news: { items: [...HEADLINES, ...HEADLINES.map((item) => ({ ...item, url: `${item.url}-extra` }))], status: "available" },
      official: { items: [], status: "available" }, headlineLimit: 6, showHeading: false,
    }));
    const doc = documentOf(html);
    expect(doc.querySelectorAll("a[target='_blank']")).toHaveLength(6);
    expect(doc.querySelector("h2")).toBeNull();
    expect(doc.querySelector("a[href='/pulse?open=news']")).toBeNull();
  });
});
