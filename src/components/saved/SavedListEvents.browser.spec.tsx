// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSavedLocks } from "../../../tests/helpers/saved-locks";
import SavedList from "./SavedList";

// The Saved page itself, with the real device store: the event notice's
// Remove, Undo and Try again must reach the page's saved rows and its
// catalog request, not only the notice rendered on its own.
const mocks = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), fetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => { void _prefetch; return <a href={href} {...props}>{children}</a>; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/my-radius", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: new Set<string>(), loading: false, authed: false, truncated: false }) }));
vi.mock("@/components/pwa/KeepRadiusCard", () => ({ default: () => null }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: vi.fn() }));
vi.mock("./useSavedJourney", () => ({ useSavedJourney: () => ({ journey: { sort: "town", view: "list", organizerOpen: false, selectedList: null, showPast: false, eventSlug: null, pastEventSlug: null, placeSlug: null, scrollY: 0 }, updateJourney: vi.fn() }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "fr:saved:v1";
const SAVED_AT = "2026-11-18T15:00:00.000Z";
const answer = (body: { unresolvedSlugs?: string[]; missingSlugs?: string[] }) =>
  new Response(JSON.stringify({ events: [], unresolvedSlugs: [], missingSlugs: [], ...body }), { status: 200, headers: { "Content-Type": "application/json" } });

describe("the Saved page acts on saved events the catalog cannot show", () => {
  let host: HTMLDivElement;
  let root: Root;
  let locks: ReturnType<typeof installSavedLocks>;
  beforeEach(() => {
    localStorage.clear();
    locks = installSavedLocks();
    vi.clearAllMocks();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    locks.restore();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  const settle = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === name);
  const eventRequests = () => mocks.fetch.mock.calls.filter(([url]) => String(url) === "/api/events/by-slugs");
  const stand = () => host.querySelector(".sv-stand")?.textContent ?? "";

  it("removes an unlisted event's saved row from the page and puts it back from Undo", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ type: "event", id: "gone-event", saved_at: SAVED_AT }]));
    mocks.fetch.mockImplementation(async () => answer({ missingSlugs: ["gone-event"] }));
    await act(async () => root.render(<SavedList />));
    await settle();

    // The headline counts the event its notice says is still saved.
    expect(stand()).toBe("1 event");
    expect(host.textContent).toContain("1 saved event is no longer listed.");
    expect(host.textContent).toContain("when you saved it (Nov 18)");
    await act(async () => button("Remove from Saved: the event that is no longer listed")!.click());
    await settle();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
    expect(host.textContent).not.toContain("no longer listed");

    const [title, options] = mocks.toast.mock.calls[0];
    expect(title).toBe("Removed from Saved · 1 unlisted event");
    await act(async () => options.action.onClick());
    await settle();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ type: "event", id: "gone-event", saved_at: SAVED_AT }]);
    expect(host.textContent).toContain("when you saved it (Nov 18)");
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("asks the catalog again from Try again and lets it be pressed once the answer arrives", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ type: "event", id: "slow-event", saved_at: SAVED_AT }]));
    let second!: (response: Response) => void;
    mocks.fetch
      .mockImplementationOnce(async () => answer({ unresolvedSlugs: ["slow-event"] }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { second = resolve; }));
    await act(async () => root.render(<SavedList />));
    await settle();

    expect(stand()).toBe("1 event");
    expect(host.textContent).toContain("We could not refresh 1 saved event right now. It is still saved.");
    expect(eventRequests()).toHaveLength(1);
    await act(async () => button("Try again: saved events")!.click());
    await settle();
    expect(eventRequests()).toHaveLength(2);
    expect(JSON.parse(String(eventRequests()[1][1]?.body))).toEqual({ slugs: ["slow-event"] });
    expect(button("Trying again: saved events")!.disabled).toBe(true);

    await act(async () => second(answer({ unresolvedSlugs: ["slow-event"] })));
    await settle();
    expect(button("Try again: saved events")!.disabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
  });
});
