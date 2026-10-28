// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Offline images expose error/load events without provider transport. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { SavedRef } from "@/hooks/useSaved";
import FromYourSaved from "./FromYourSaved";

const membership = vi.hoisted(() => ({ slugs: new Set<string>(), loading: false, authed: false, deviceSaves: [] as SavedRef[], reader: vi.fn() }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: (bootstrap: unknown, options: unknown) => {
  membership.reader(bootstrap, options); return membership;
} }));
vi.mock("@/hooks/useSaved", () => ({ useSavedList: () => membership.deviceSaves }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string; onLoad?: () => void; onError?: () => void }) => <img {...props} alt={props.alt} /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const place = (slug: string, name: string, municipality = "frederick"): PlaceCardData => ({
  slug, name, municipality, city: municipality, category: "coffee", tags: [], open_status: { state: "unknown" },
  short_blurb: "", state: "MD", postal_code: "21701", is_verified: false, feature_score: 0, source: "manual",
  updated_at: "2026-10-28", source_id: "offline-saved-fixture", source_url: null, license: "Demonstration fixture",
  confidence: "curated", first_seen_at: "2026-10-28T12:00:00Z", last_verified_at: "2026-10-28T12:00:00Z",
  address: "Frederick County, MD", geom: { lng: -77.41, lat: 39.41 },
});
let root: Root, host: HTMLDivElement;
const requests: Array<{ url: string; signal: AbortSignal; resolve: (value: Response) => void }> = [];
async function render() { await act(async () => root.render(<FromYourSaved />)); }
async function respond(index: number, places: PlaceCardData[]) {
  await act(async () => requests[index].resolve(new Response(JSON.stringify({ places }), { status: 200 })));
}
beforeEach(() => {
  membership.slugs = new Set(); membership.loading = false; membership.authed = false; membership.deviceSaves = []; membership.reader.mockClear(); requests.length = 0;
  window.history.replaceState(null, "", "/today?in=frederick&view=afternoon#today-saved");
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => new Promise<Response>(resolve => {
    if (!String(url).startsWith("/api/places/by-slugs?")) throw new Error("Unexpected saved request");
    requests.push({ url: String(url), signal: options.signal as AbortSignal, resolve });
  })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Today confirmed saved choices", () => {
  it("keeps unknown hours visible, uses passive membership and preserves the exact return context", async () => {
    membership.slugs = new Set(["saved-cafe"]); await render();
    expect(membership.reader).toHaveBeenCalledWith(undefined, { importLocalSavesOnMount: false });
    await respond(0, [place("saved-cafe", "Saved cafe", "brunswick")]);
    expect(host.textContent).toContain("Saved cafe"); expect(host.textContent).toContain("Hours not confirmed");
    expect(host.textContent).not.toMatch(/open now|likely open/i);
    const detail = new URL(host.querySelector('a[aria-label="View saved place: Saved cafe"]')!.getAttribute("href")!, "https://radius.test");
    expect(detail.searchParams.get("returnTo")).toBe("/today?in=frederick&view=afternoon#today-saved");
    const map = new URL(host.querySelector('a[aria-label="Map saved place: Saved cafe"]')!.getAttribute("href")!, "https://radius.test");
    expect(map.searchParams.get("in")).toBe("brunswick"); expect(map.searchParams.get("returnTo")).toBe(detail.searchParams.get("returnTo"));
    expect(host.querySelector("img")).toBeNull(); expect(host.querySelector("[data-place-category-art]")).not.toBeNull();
  });

  it("retains closed saves and never calls saved membership a current opening", async () => {
    membership.slugs = new Set(["closed-cafe"]); await render();
    await respond(0, [{ ...place("closed-cafe", "Closed cafe"), open_status: { state: "closed" } }]);
    expect(host.textContent).toContain("Closed cafe"); expect(host.textContent).toContain("Closed");
    expect(host.textContent).not.toContain("These saved places are open now");
  });

  it("distinguishes unknown/empty membership without sending a detail request", async () => {
    membership.loading = true; membership.slugs = new Set(["not-yet-confirmed"]); await render();
    expect(requests).toHaveLength(0); expect(host.textContent).toBe("");
    membership.loading = false; membership.slugs = new Set(); await render();
    expect(requests).toHaveLength(0); expect(host.textContent).toBe("");
  });

  it("bounds the lookup and visible cards, deduplicates response identities and ignores unrequested rows", async () => {
    membership.slugs = new Set(["a", "b", "c", "d", "e"]); await render();
    expect(new URL(requests[0].url, "https://radius.test").searchParams.get("slugs")).toBe("a,b,c,d");
    await respond(0, [place("a", "A"), place("a", "A"), place("b", "B"), place("c", "C"), place("unrequested", "Foreign")]);
    expect(host.querySelectorAll("[data-today-saved-place]")).toHaveLength(2);
    expect(host.textContent).not.toContain("Foreign"); expect(host.querySelector('[data-today-saved-place="c"]')).toBeNull();
  });

  it("brings a newly confirmed save into the visible preview after four older saves without another read on its state commit", async () => {
    membership.slugs = new Set(["a", "b", "c", "d"]);
    membership.deviceSaves = ["a", "b", "c", "d"].map((id, index) => ({ type: "place", id, saved_at: `2026-10-0${4 - index}T12:00:00Z` }));
    await render();
    expect(new URL(requests[0].url, "https://radius.test").searchParams.get("slugs")).toBe("a,b,c,d");
    await respond(0, [place("a", "A"), place("b", "B"), place("c", "C"), place("d", "D")]);
    expect([...host.querySelectorAll<HTMLElement>("[data-today-saved-place]")].map(card => card.dataset.todaySavedPlace)).toEqual(["a", "b"]);
    membership.slugs = new Set(["a", "b", "c", "d", "new"]);
    membership.deviceSaves = [...membership.deviceSaves, { type: "place", id: "new", saved_at: "2026-10-28T12:00:00Z" }];
    await render();
    expect(new URL(requests[1].url, "https://radius.test").searchParams.get("slugs")).toBe("new,a,b,c");
    await respond(1, [place("a", "A"), place("b", "B"), place("c", "C"), place("new", "New save")]);
    expect([...host.querySelectorAll<HTMLElement>("[data-today-saved-place]")].map(card => card.dataset.todaySavedPlace)).toEqual(["new", "a"]);
    membership.slugs = new Set(["a", "b", "c", "d", "new", "newer"]);
    membership.deviceSaves = [...membership.deviceSaves, { type: "place", id: "newer", saved_at: "2026-10-28T12:00:00Z" }];
    await render();
    expect(new URL(requests[2].url, "https://radius.test").searchParams.get("slugs")).toBe("newer,new,a,b");
    await respond(2, [place("newer", "Newer save"), place("new", "New save"), place("a", "A"), place("b", "B")]);
    expect([...host.querySelectorAll<HTMLElement>("[data-today-saved-place]")].map(card => card.dataset.todaySavedPlace)).toEqual(["newer", "new"]);
    expect(requests).toHaveLength(3);
    await act(async () => root.unmount()); root = createRoot(host);
    await render();
    expect(new URL(requests[3].url, "https://radius.test").searchParams.get("slugs")).toBe("newer,new,a,b");
    await respond(3, [place("newer", "Newer save"), place("new", "New save"), place("a", "A"), place("b", "B")]);
    expect([...host.querySelectorAll<HTMLElement>("[data-today-saved-place]")].map(card => card.dataset.todaySavedPlace)).toEqual(["newer", "new"]);
    expect(requests).toHaveLength(4);
  });

  it("preserves server order after unknown membership and account-mode boundaries", async () => {
    membership.slugs = new Set(["device-a", "device-b", "device-c", "device-d"]); await render();
    await respond(0, [place("device-a", "Device A"), place("device-b", "Device B")]);
    membership.slugs = new Set(["device-a", "device-b", "device-c", "device-d", "device-new"]);
    membership.deviceSaves = [{ type: "place", id: "device-new", saved_at: "2026-10-28T12:00:00Z" }];
    await render();
    await respond(1, [place("device-new", "Device new"), place("device-a", "Device A")]);
    membership.loading = true; await render();
    expect(host.querySelector("[data-today-saved]")).toBeNull();
    expect(requests).toHaveLength(2);
    membership.authed = true; membership.loading = false;
    membership.slugs = new Set(["account-b", "account-a", "account-c"]); await render();
    expect(new URL(requests[2].url, "https://radius.test").searchParams.get("slugs")).toBe("account-b,account-a,account-c");
    await respond(2, [place("account-a", "Account A"), place("account-b", "Account B"), place("account-c", "Account C")]);
    expect([...host.querySelectorAll<HTMLElement>("[data-today-saved-place]")].map(card => card.dataset.todaySavedPlace)).toEqual(["account-b", "account-a"]);
    expect(host.textContent).not.toContain("Device");
    expect(requests).toHaveLength(3);
  });

  it("keeps stable membership fallback when device save clocks are missing or invalid", async () => {
    membership.slugs = new Set(["a", "b", "c"]);
    membership.deviceSaves = [{ type: "place", id: "b", saved_at: "not-a-date" }];
    await render();
    expect(new URL(requests[0].url, "https://radius.test").searchParams.get("slugs")).toBe("a,b,c");
    expect(membership.deviceSaves[0].saved_at).toBe("not-a-date");
  });

  it("ignores a superseded body and removes an unsaved card immediately", async () => {
    membership.slugs = new Set(["old"]); await render();
    membership.slugs = new Set(["new"]); await render(); expect(requests[0].signal.aborted).toBe(true);
    await respond(1, [place("new", "New save")]); await respond(0, [place("old", "Old save")]);
    expect(host.textContent).toContain("New save"); expect(host.textContent).not.toContain("Old save");
    membership.slugs = new Set(); await render(); expect(host.querySelector("[data-today-saved]")).toBeNull();
  });

  it("keeps known membership on a failed detail read and supports one explicit retry", async () => {
    membership.slugs = new Set(["kept"]); await render();
    await act(async () => requests[0].resolve(new Response("unavailable", { status: 503 })));
    expect(host.textContent).toContain("Your saved list is kept"); expect(membership.slugs.has("kept")).toBe(true);
    await act(async () => host.querySelector("button")!.click()); expect(requests).toHaveLength(2);
    await respond(1, [place("kept", "Kept save")]); expect(host.textContent).toContain("Kept save");
  });

  it("releases a hung detail reader on its UI deadline even if the transport ignores abort", async () => {
    vi.useFakeTimers(); membership.slugs = new Set(["hung"]); await render();
    await act(async () => vi.advanceTimersByTimeAsync(8_001));
    expect(requests[0].signal.aborted).toBe(true); expect(host.textContent).toContain("could not load");
    await respond(0, [place("hung", "Late place")]); expect(host.textContent).not.toContain("Late place");
  });

  it("keeps unavailable catalog records distinct from an empty saved list", async () => {
    membership.slugs = new Set(["missing"]); await render(); await respond(0, []);
    expect(host.textContent).toContain("not available in the current guide");
    expect(host.querySelector('a[href="/my-radius"]')).not.toBeNull();
  });

  it("reuses an accepted scenic photo and keeps the named action after image failure", async () => {
    const slug = "joseph-dill-baker-memorial-carillon-bell-tower";
    membership.slugs = new Set([slug]); await render(); await respond(0, [place(slug, "Baker Park Carillon")]);
    expect(host.querySelector('img[src="/images/places/carillon-sunset.jpg"]')).not.toBeNull();
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("[data-place-category-art]")).not.toBeNull();
    expect(host.querySelector('a[aria-label="View saved place: Baker Park Carillon"]')).not.toBeNull();
    expect(requests).toHaveLength(1);
  });
});
