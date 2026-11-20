// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/lib/search/index";
import { track } from "@/lib/track";

const navigation = vi.hoisted(() => ({ leaveTo: vi.fn(), dismiss: vi.fn(), recent: vi.fn() }));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({
  useReversibleHistoryLayer: () => navigation,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
const geo = vi.hoisted(() => ({ cached: null as { lat: number; lng: number } | null }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => geo.cached }));
vi.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => [], useRecentSearchStatus: () => ({ available: true, clearFailed: false }),
  usePushRecentSearch: () => navigation.recent, useClearRecentSearches: () => vi.fn(),
}));
import SearchOverlay from "./SearchOverlay";
import { setScope } from "@/lib/scope";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const requests: Array<{ url: string; signal: AbortSignal; resolve: (value: Response) => void }> = [];
const gravel = { id: "place:gravel-and-grind-frederick", type: "place", title: "Gravel & Grind",
  subtitle: "Coffee · Frederick", href: "/places/gravel-and-grind-frederick", score: 100 } as SearchResult;
beforeEach(() => {
  vi.useFakeTimers(); requests.length = 0;
  navigation.leaveTo.mockReset(); navigation.recent.mockReset();
  vi.mocked(track).mockClear();
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => new Promise<Response>(resolve => {
    if (!String(url).startsWith("/api/search?")) throw new Error("Unexpected request");
    requests.push({ url: String(url), signal: options.signal as AbortSignal, resolve });
  })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function render(query: string) {
  await act(async () => root.render(<SearchOverlay open onClose={vi.fn()} initialQuery={query} historyLayerId="retrieval-test" />));
}
async function tick() { await act(async () => vi.advanceTimersByTimeAsync(160)); }
async function respond(index: number, results: SearchResult[], meta?: Record<string, unknown>) {
  await act(async () => requests[index].resolve(new Response(JSON.stringify({ results, meta }), { status: 200 })));
}
async function enter() {
  await act(async () => host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
}
async function type(query: string) {
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Find retrieval-first interactions", () => {
  it("retrieves a punctuated name, describes pending work and sends early Enter to full Search", async () => {
    await render("Gravel & Grind?"); await tick();
    expect(new URL(requests[0].url, "https://test.local").searchParams.get("q")).toBe("Gravel & Grind");
    expect([...host.querySelectorAll('[role="status"]')].some(node => node.textContent === "Searching")).toBe(true);
    await enter();
    expect(navigation.leaveTo).toHaveBeenCalledWith("/search?q=Gravel%20%26%20Grind%3F");
    expect(navigation.recent).toHaveBeenCalledWith("Gravel & Grind?");
    await respond(0, [gravel]); await enter();
    expect(navigation.leaveTo).toHaveBeenLastCalledWith(gravel.href);
  });

  it("uses the same category answer for a polite request's card and Enter", async () => {
    await render("I'm looking for pizza"); await tick();
    expect(new URL(requests[0].url, "https://test.local").searchParams.get("q")).toBe("pizza");
    await respond(0, []);
    const answer = Array.from(host.querySelectorAll<HTMLAnchorElement>("a")).find(a => a.getAttribute("href") === "/nearby?c=food&facet=pizza")!;
    expect(answer).toBeDefined();
    await act(async () => answer.click());
    const cardDestination = navigation.leaveTo.mock.lastCall?.[0];
    await enter();
    expect(navigation.leaveTo).toHaveBeenLastCalledWith(cardDestination);
    expect(navigation.recent).toHaveBeenCalledWith("I'm looking for pizza");
  });

  it("treats a bare category question as the same retrieval, not an exact business probe", async () => {
    await render("museums?"); await tick();
    expect(new URL(requests[0].url, "https://test.local").searchParams.get("q")).toBe("museums");
    const museum = { ...gravel, id: "place:bjorlee-museum", title: "Bjorlee Museum", href: "/places/bjorlee-museum" };
    await respond(0, [museum]);
    expect(host.querySelector('a[href="/nearby?c=art"]')).toBeNull();
    await enter();
    expect(navigation.leaveTo).toHaveBeenLastCalledWith(museum.href);
    expect(navigation.recent).toHaveBeenCalledWith("museums?");
  });

  it("does not let a superseded exact lookup replace a constrained reasoning request", async () => {
    await render("Gravel & Grind?"); await tick();
    await type("I need wheelchair accessible coffee");
    expect(requests[0].signal.aborted).toBe(true);
    await respond(0, [gravel]);
    expect(host.textContent).not.toContain("Gravel & Grind");
    expect(requests).toHaveLength(1);
    await enter();
    expect(navigation.leaveTo).toHaveBeenLastCalledWith("/ask?q=I%20need%20wheelchair%20accessible%20coffee");
  });

  it.each(["partial", "unavailable"])("shows %s event coverage beside usable results without replacing the query or place action", async coverage => {
    await render("Gravel & Grind"); await tick();
    const persistent = host.querySelector('[data-search-event-status]');
    expect(persistent?.getAttribute("role")).toBe("status");
    expect(persistent?.getAttribute("aria-live")).toBe("polite");
    expect(persistent?.textContent).toBe("");
    await respond(0, [gravel], { eventCoverage: coverage, liveEventsUnavailable: true, scopeMunicipality: "brunswick", qualifiers: {} });
    expect(host.querySelector('[data-search-event-status]')).toBe(persistent);
    const caveat = host.querySelector(`[data-search-event-coverage="${coverage}"]`)!;
    expect(caveat.textContent).toContain(coverage === "partial" ? "Some events could not be verified" : "The current event schedule could not be checked");
    expect(caveat.querySelector("a")?.getAttribute("href")).toBe("/events?in=brunswick");
    expect(host.querySelector("input")?.value).toBe("Gravel & Grind");
    expect(host.querySelector(`a[href="${gravel.href}"]`)).not.toBeNull();
    await enter();
    expect(navigation.leaveTo).toHaveBeenLastCalledWith(gravel.href);
    await act(async () => (caveat.querySelector("a") as HTMLAnchorElement).click());
    expect(navigation.leaveTo).toHaveBeenLastCalledWith("/events?in=brunswick");
    expect(navigation.recent).toHaveBeenLastCalledWith("Gravel & Grind");
  });

  it("labels next-weekend recovery as a broader date choice while preserving county and free filters", async () => {
    await render("free events next weekend"); await tick();
    await respond(0, [], { eventCoverage: "unavailable", scopeMunicipality: null,
      eventWindow: { label: "Next weekend", date: "2026-11-14", freeOnly: true }, qualifiers: {} });
    const recovery = host.querySelector('[data-search-event-coverage] a') as HTMLAnchorElement;
    expect(recovery.textContent).toBe("Choose dates in Events");
    expect(recovery.getAttribute("href")).toBe("/events?in=county&free=1");
    await act(async () => recovery.click());
    expect(navigation.leaveTo).toHaveBeenLastCalledWith("/events?in=county&free=1");
  });

  it("keeps explicit county and the supported afternoon/free filters on event recovery", async () => {
    await render("free events this afternoon"); await tick();
    await respond(0, [], { eventCoverage: "unavailable", scopeMunicipality: null,
      eventWindow: { label: "This afternoon", date: "2026-11-02", freeOnly: true }, qualifiers: {} });
    const recovery = host.querySelector('[data-search-event-coverage] a') as HTMLAnchorElement;
    expect(recovery.getAttribute("href")).toBe("/events?in=county&d=2026-11-02&tod=midday&free=1");
    await act(async () => recovery.click());
    expect(navigation.leaveTo).toHaveBeenLastCalledWith("/events?in=county&d=2026-11-02&tod=midday&free=1");
    expect(navigation.recent).toHaveBeenLastCalledWith("free events this afternoon");
  });

  it.each(["partial", "unavailable"])("does not report a false miss or an exact-listing absence for %s event coverage", async coverage => {
    await render("zzqxwvnotreal"); await tick();
    await respond(0, [], { eventCoverage: coverage, scopeMunicipality: "brunswick", qualifiers: {} });
    expect(host.textContent).not.toContain("Nothing matches");
    expect(host.textContent).not.toContain("No exact listing matched");
    expect([...host.querySelectorAll('[role="status"]')].some(node => node.textContent === "No matches")).toBe(false);
    expect(host.querySelector('[data-search-event-coverage]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1600));
    expect(vi.mocked(track).mock.calls.some(([event]) => event === "search_empty")).toBe(false);
  });
});

describe("Find states the shared area", () => {
  // Inner hooks run before the outer unmount, so reset inside act.
  afterEach(async () => { geo.cached = null; await act(async () => setScope(null)); });
  const field = () => host.querySelector<HTMLInputElement>('input[role="searchbox"]')!;
  const areaLine = () => host.querySelector("[data-find-area]")?.textContent;

  it("names the whole county for an unset area, in the field and on an unqualified answer", async () => {
    await render("Gravel & Grind"); await tick();
    expect(field().getAttribute("aria-label")).toBe("Ask or find across the whole county");
    expect(areaLine()).toBeUndefined();
    await respond(0, [gravel], { qualifiers: { constrained: false }, contextLabel: null });
    expect(areaLine()).toBe("Whole county");
  });

  it("follows a header change to a town and prints the server's area label", async () => {
    setScope("town:thurmont");
    await render("coffee"); await tick();
    expect(field().getAttribute("aria-label")).toBe("Ask or find in Thurmont");
    await respond(0, [gravel], { qualifiers: { constrained: true, categoryLabel: "Coffee" }, contextLabel: "Thurmont" });
    expect(areaLine()).toBe("Coffee · Thurmont");
    await act(async () => setScope("nearme"));
    expect(field().getAttribute("aria-label")).toBe("Ask or find near you");
  });

  it("refetches when the area changes while Find is open", async () => {
    await render("coffee"); await tick();
    expect(requests).toHaveLength(1);
    await act(async () => setScope("town:thurmont"));
    await tick();
    // The endpoint reads the area cookie when a request starts, so the old
    // area's request is abandoned and a new one goes out.
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("says near you when no area is chosen and the browser already shared a location", async () => {
    geo.cached = { lat: 39.4143, lng: -77.4105 };
    await render("Gravel & Grind"); await tick();
    expect(field().getAttribute("aria-label")).toBe("Ask or find near you");
    await respond(0, [gravel], { qualifiers: { constrained: false }, contextLabel: null });
    expect(areaLine()).toBe("Near me");
  });

  it("names the area a near-me question fell back to when no location is usable", async () => {
    await render("coffee near me"); await tick();
    await respond(0, [gravel], {
      qualifiers: { constrained: true, categoryLabel: "Coffee", nearMe: true },
      nearMeApplied: false, fallbackReason: null, contextLabel: "Whole county",
    });
    expect(areaLine()).toBe("Coffee · Location unavailable · not distance-ranked · Whole county");
  });

  it("adds the area to a category answer that the server did not scope", async () => {
    setScope("county");
    await render("pizza"); await tick();
    await respond(0, [gravel], { qualifiers: { constrained: true, categoryLabel: "Pizza" }, contextLabel: null });
    expect(areaLine()).toBe("Pizza · Whole county");
  });
});
