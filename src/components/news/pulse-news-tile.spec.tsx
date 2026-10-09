// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PulseBoard, { pulseTileState } from "@/components/pulse/PulseBoard";
import type { NewsHeadlinesResult } from "@/lib/integrations/news";
import LocalNewsBriefView, { type OfficialNewsResult } from "./LocalNewsBriefView";
import { pulseNewsTile } from "./pulse-news-tile";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
// Keep the actual tile, row and news body; only the canonical Sheet transport
// is replaced because its native focus/Back behavior has browser acceptance.
vi.mock("@/components/ui/Sheet", () => ({ default: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) => open
  ? createElement("section", { role: "dialog", "aria-label": title }, children) : null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const headline = { title: "County publishes its meeting schedule", source: "Local publisher", url: "https://news.google.com/rss/articles/fixture", published_at: "2026-10-09T12:00:00.000Z" };
const update = { title: "City announces a public workshop", source: "City of Frederick", sourceShort: "City", lane: "civic", url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=fixture", publishedAt: "2026-10-09T11:00:00.000Z" } as const;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { window.history.replaceState({}, "", "/pulse"); window.localStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.history.replaceState({}, "", "/"); });

async function mount(news: NewsHeadlinesResult, official: OfficialNewsResult) {
  const tile = pulseNewsTile(news, official, createElement(LocalNewsBriefView, { news, official, headlineLimit: 6, showHeading: false }));
  await act(async () => root.render(createElement(PulseBoard, {
    hero: { allClear: true, line: "No major disruption is reported.", sub: "Open the source details for context.", renderedAt: Date.now() }, chips: [], tiles: [tile],
  })));
  const row = container.querySelector<HTMLButtonElement>('[data-pulse-key="news"]')!;
  row.closest("details")?.setAttribute("open", "");
  return { tile, row };
}
describe("Pulse combined local-news availability", () => {
  it.each([
    ["partial", "available"], ["available", "unavailable"], ["unavailable", "partial"],
  ] as const)("keeps the real news row and drawer usable for %s headlines / %s official feeds", async (newsStatus, officialStatus) => {
    const news = { status: newsStatus, items: newsStatus === "unavailable" ? [] : [headline] };
    const official = { status: officialStatus, items: officialStatus === "unavailable" ? [] : [update] };
    const { tile, row } = await mount(news, official);
    expect(pulseTileState(tile)).toBe("Partial data");
    expect(row.textContent).toContain("Partial data");
    expect(row.textContent).not.toContain("Feed unavailable");
    expect(row.textContent).toContain(news.items.length ? "1 story" : "Official updates");
    expect(row.disabled).toBe(false);
    await act(async () => row.click());
    expect(window.location.search).toBe("?open=news");
    const drawer = container.querySelector('[role="dialog"][aria-label="In the news"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain(news.items.length ? headline.title : update.title);
    expect(drawer?.querySelector("a[target='_blank']")?.getAttribute("href")).toBe(news.items.length ? headline.url : update.url);
    expect(drawer?.textContent).toContain("Published Oct 9, 2026");
    expect(drawer?.textContent).toContain("unavailable");
  });
  it.each(["available", "partial"] as const)("keeps successful empty %s checks distinct from all feeds unavailable", async (newsStatus) => {
    const { tile, row } = await mount({ status: newsStatus, items: [] }, { status: "unavailable", items: [] });
    expect(pulseTileState(tile)).toBe("Partial data");
    expect(row.textContent).toContain("No headlines returned");
    expect(row.textContent).not.toContain("Feed unavailable");
  });
  it("marks the combined tile unavailable only when neither feed family answered", async () => {
    const { tile, row } = await mount({ status: "unavailable", items: [] }, { status: "unavailable", items: [] });
    expect(pulseTileState(tile)).toBe("Feed unavailable");
    expect(row.textContent).toContain("Unavailable");
    expect(row.textContent).not.toContain("No headlines returned");
  });
  it("keeps two fully healthy empty feed families current and explicitly empty", async () => {
    const { tile, row } = await mount({ status: "available", items: [] }, { status: "available", items: [] });
    expect(pulseTileState(tile)).toBe("Current");
    expect(row.textContent).toContain("No headlines returned");
  });
});
