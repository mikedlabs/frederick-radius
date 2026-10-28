// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/lib/search/index";

const navigation = vi.hoisted(() => ({ leaveTo: vi.fn(), dismiss: vi.fn(), recent: vi.fn() }));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({
  useReversibleHistoryLayer: () => navigation,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => null }));
vi.mock("@/hooks/useRecentSearches", () => ({
  useRecentSearches: () => [], useRecentSearchStatus: () => ({ available: true, clearFailed: false }),
  usePushRecentSearch: () => navigation.recent, useClearRecentSearches: () => vi.fn(),
}));
import SearchOverlay from "./SearchOverlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const requests: Array<{ url: string; signal: AbortSignal; resolve: (value: Response) => void }> = [];
const gravel = { id: "place:gravel-and-grind-frederick", type: "place", title: "Gravel & Grind",
  subtitle: "Coffee · Frederick", href: "/places/gravel-and-grind-frederick", score: 100 } as SearchResult;
beforeEach(() => {
  vi.useFakeTimers(); requests.length = 0;
  navigation.leaveTo.mockReset(); navigation.recent.mockReset();
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
async function respond(index: number, results: SearchResult[]) {
  await act(async () => requests[index].resolve(new Response(JSON.stringify({ results }), { status: 200 })));
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
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Searching");
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
});
