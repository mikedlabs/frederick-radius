// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCivicPressReleasesResult, officialCivicNews } from "@/lib/integrations/civic-press";
import LocalNewsBrief from "./LocalNewsBrief";
import LocalNewsBriefView from "./LocalNewsBriefView";

// Only the independent Google headline family is stubbed. The official RSS
// adapter, bounded reader, source projection and mounted Today view are real.
vi.mock("@/lib/integrations/news", () => ({ getLocalHeadlinesResult: async () => ({ items: [], status: "unavailable" }) }));
const NOW = "2026-10-12T12:00:00.000Z";
const rss = (host: string, title: string, id: number, date = "Wed, 07 Oct 2026 14:23:00 -0500") =>
  `<rss><channel><item><title>${title}</title><link>https://www.${host}/CivicAlerts.aspx?AID=${id}</link><pubDate>${date}</pubDate><description>Full article body is not copied</description><enclosure url="https://example.test/image.jpg" /></item></channel></rss>`;
const docOf = (html: string) => new DOMParser().parseFromString(html, "text/html");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv("RADIUS_DATA_MODE", "");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(
    url.includes("frederickcountymd.gov") ? rss("frederickcountymd.gov", "County reforestation program", 202, "Thu, 08 Oct 2026 12:00:00 GMT")
      : url.includes("Frederick-News-1") ? rss("cityoffrederickmd.gov", "City Freecycle event", 101)
      : rss("cityoffrederickmd.gov", "Frederick Police Investigate Shooting", 301),
    { headers: { "content-type": "application/rss+xml" } },
  )));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("official RSS through mounted news consumers", () => {
  it("shows real adapter results on Today immediately with distinct checks/publications and canonical attribution", async () => {
    const doc = docOf(renderToStaticMarkup(await LocalNewsBrief()));
    const official = doc.querySelector("details");
    expect(official?.hasAttribute("open")).toBe(true);
    const links = [...official!.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.frederickcountymd.gov/CivicAlerts.aspx?aid=202",
      "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?aid=101",
    ]);
    expect(links[0].textContent).toContain("Frederick County");
    expect(links[1].textContent).toContain("City of Frederick");
    expect(links[1].textContent).toContain("Published Oct 7, 2026, 3:23 PM EDT");
    const checks = official?.querySelector("ul[aria-label='Official newsroom source checks']");
    expect(checks?.querySelectorAll("li")).toHaveLength(3);
    expect(checks?.textContent?.match(/Checked Oct 12, 2026, 8:00 AM EDT/g)).toHaveLength(3);
    expect(checks?.textContent).toContain("Latest publication Oct 7, 2026, 3:23 PM EDT");
    expect(doc.body.textContent).not.toContain("Police Investigate");
    expect(doc.body.textContent).not.toContain("Full article body");
    expect(doc.querySelector("img")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps a County update usable in the Pulse reading when the dedicated City subscription is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.includes("frederickcountymd.gov")
      ? rss("frederickcountymd.gov", "County reforestation program", 202) : "<html>Temporarily unavailable</html>")));
    const official = officialCivicNews(await getCivicPressReleasesResult());
    const doc = docOf(renderToStaticMarkup(createElement(LocalNewsBriefView, {
      news: { items: [], status: "unavailable" }, official, headlineLimit: 6, officialLimit: 6, showHeading: false,
    })));
    expect(official.status).toBe("partial");
    expect(doc.querySelector("a[target='_blank']")?.textContent).toContain("County reforestation program");
    const city = doc.querySelector("[data-source-id='city_official_news']");
    expect(city?.getAttribute("data-source-state")).toBe("unavailable");
    expect(city?.textContent).toContain("Unable to verify this feed.");
    expect(city?.textContent).toContain("Attempted Oct 12, 2026, 8:00 AM EDT");
    expect(city?.textContent).not.toContain("Latest publication");
    expect(doc.querySelector("[data-source-id='county_official_news']")?.textContent).toContain("Checked Oct 12");
    expect(doc.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("mounts a dated broad City recreation notice with its actual subscription and does not treat its title as a current alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(
      url.includes("frederickcountymd.gov") ? rss("frederickcountymd.gov", "County reforestation program", 202, "Thu, 08 Oct 2026 12:00:00 GMT")
        : url.includes("Frederick-News-1") ? rss("cityoffrederickmd.gov", "City Freecycle event", 101)
        : rss("cityoffrederickmd.gov", "ALL CITY SPORTS FIELDS ARE CLOSED TODAY 10-11-2026", 303, "Sun, 11 Oct 2026 07:29:15 -0500"),
    )));
    const doc = docOf(renderToStaticMarkup(await LocalNewsBrief()));
    const links = [...doc.querySelectorAll("details a")];
    expect(links.map((link) => link.getAttribute("data-news-source-id"))).toEqual(["city_official_releases", "county_official_news"]);
    expect(links[0].textContent).toContain("City releases");
    expect(links[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-10-11T12:29:15.000Z");
    expect(links[0].textContent).toContain("Published Oct 11, 2026, 8:29 AM EDT");
    expect(doc.querySelector("[data-source-id='city_official_releases']")?.textContent).toContain("City releases");
    expect(doc.querySelector("[data-source-id='city_official_news']")?.textContent).toContain("City newsroom");
    expect(doc.querySelector("[data-source-id='county_official_news']")?.textContent).toContain("County newsroom");
    expect(doc.querySelector("[role='alert']")).toBeNull();
    expect(doc.body.textContent).not.toContain("Published Oct 12");
  });

  it("keeps older cached reports dated without calling their expired checks current", async () => {
    const press = await getCivicPressReleasesResult();
    vi.setSystemTime(new Date("2026-10-12T14:00:00.000Z"));
    const official = officialCivicNews(press);
    const doc = docOf(renderToStaticMarkup(createElement(LocalNewsBriefView, {
      news: { items: [], status: "unavailable" }, official,
    })));
    expect(official.status).toBe("unavailable");
    expect(doc.body.textContent?.match(/The last check is older/g)).toHaveLength(3);
    expect(doc.querySelector("[data-source-id='city_official_news'] time")?.getAttribute("datetime")).toBe(NOW);
    expect(doc.querySelector("a[href*='aid=101'] time")?.getAttribute("datetime")).toBe("2026-10-07T19:23:00.000Z");
    expect(doc.body.textContent).not.toContain("Checked Oct 12, 2026, 10:00 AM EDT");
  });
});
