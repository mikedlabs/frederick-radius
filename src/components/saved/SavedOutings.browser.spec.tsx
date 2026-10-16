// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSavedLocks } from "../../../tests/helpers/saved-locks";
import { encodeSpec, decodeSavedPlanToken, type PlanSpec } from "@/lib/plan/plan-token";
import { SAVED_OUTINGS_KEY } from "@/lib/saved-outings";
import { refreshSavedOutings, saveOuting, useSavedOutings } from "@/hooks/useSavedOutings";
import SaveOutingButton from "./SaveOutingButton";
import SavedOutings from "./SavedOutings";
import SavedList from "./SavedList";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), followed: new Set<string>(), fetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => { void _prefetch; return <a href={href} {...props}>{children}</a>; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/my-radius", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: mocks.followed, loading: false, authed: false, truncated: false }) }));
vi.mock("@/components/pwa/KeepRadiusCard", () => ({ default: () => null }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: vi.fn() }));
vi.mock("./useSavedJourney", () => ({ useSavedJourney: () => ({ journey: { sort: "town", view: "list", organizerOpen: false, selectedList: null, showPast: false, eventSlug: null, pastEventSlug: null, placeSlug: null, scrollY: 0 }, updateJourney: vi.fn() }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const spec: PlanSpec = { v: 1, i: { audience: "date", vibe: "cultural", duration_hours: 3, municipality: "brunswick", start_at: "2026-10-12T18:20:00.000Z", require_verified_hours: false, max_stops: 3, local_only: true, budget: "value", seed: 4 }, s: [{ p: "brunswick-heritage-museum" }, { p: "beans-in-the-belfry-brunswick" }, { p: "city-of-brunswick-maryland-train-viewing-platform-brunswick" }] };
const token = encodeSpec(spec);
function Wallet() { return <SavedOutings snapshot={useSavedOutings()} />; }
function Journey({ planToken = token }: { planToken?: string }) { return <><SaveOutingButton key={planToken} token={planToken} title="Our Brunswick date" /><Wallet /></>; }

describe("saved-outing real-store controls and return cards", () => {
  let host: HTMLDivElement;
  let root: Root;
  let locks: ReturnType<typeof installSavedLocks>;
  beforeEach(() => {
    localStorage.clear();
    refreshSavedOutings();
    locks = installSavedLocks();
    mocks.toast.mockClear();
    mocks.fetch.mockReset();
    mocks.fetch.mockImplementation(() => { throw new Error("Unexpected network dependency"); });
    vi.stubGlobal("fetch", mocks.fetch);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    locks.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    refreshSavedOutings();
  });
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const render = async () => act(async () => root.render(<Journey />));

  it("keeps Save honestly disabled in the server preview until handlers and storage are ready", async () => {
    await act(async () => root.unmount());
    const markup = <SaveOutingButton token={token} title="Our Brunswick date" />;
    host.innerHTML = renderToString(markup);
    expect(button("Save outing").disabled).toBe(true);
    button("Save outing").click();
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBeNull();
    await act(async () => { root = hydrateRoot(host, markup); });
    expect(button("Save outing").disabled).toBe(false);
    expect(button("Save outing").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("shows pending instead of success until the real device write is confirmed", async () => {
    await render();
    const release = locks.hold();
    await act(async () => button("Save outing").click());
    expect(button("Save outing").disabled).toBe(true);
    expect(button("Save outing").getAttribute("aria-busy")).toBe("true");
    expect(host.textContent).not.toContain("Saved on this device. Open");
    expect(host.querySelector('a[aria-label="Open outing: Our Brunswick date"]')).toBeNull();
    await act(async () => { release(); });
    expect(button("Remove outing from Saved").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Saved on this device");
    expect(host.querySelector('[role="status"]')?.className).toBe("sr-only");
    expect(mocks.toast).toHaveBeenCalledWith("Saved on this device. Open this outing from Saved.");
    expect(host.textContent).toContain("3 saved stops");
    expect(host.textContent).toContain("Draft outing · Brunswick");
    expect(host.textContent).toContain("Oct 12, 2026, 2:20 PM");
    expect(host.textContent).toContain("Review current sources and venue hours");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not retain a save or removal confirmation that another tab has reversed", async () => {
    await render();
    await act(async () => button("Save outing").click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Saved on this device");
    const savedBytes = localStorage.getItem(SAVED_OUTINGS_KEY)!;
    localStorage.removeItem(SAVED_OUTINGS_KEY);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: SAVED_OUTINGS_KEY, storageArea: localStorage })));
    expect(button("Save outing").disabled).toBe(false);
    expect(host.querySelector('[role="status"]')).toBeNull();
    localStorage.setItem(SAVED_OUTINGS_KEY, savedBytes);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: SAVED_OUTINGS_KEY, storageArea: localStorage })));
    await act(async () => button("Remove outing from Saved").click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Removed from Saved");
    localStorage.setItem(SAVED_OUTINGS_KEY, savedBytes);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: SAVED_OUTINGS_KEY, storageArea: localStorage })));
    expect(button("Remove outing from Saved").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("reopens the identical ordered dated choices after navigation and a fresh Saved mount", async () => {
    await render();
    await act(async () => button("Save outing").click());
    await act(async () => root.render(<SavedList />));
    expect(host.querySelector("[data-saved-empty-state]")).toBeNull();
    expect(host.textContent).toContain("1 outing on this device");
    let link = host.querySelector<HTMLAnchorElement>('a[aria-label="Open outing: Our Brunswick date"]')!;
    expect(new URL(link.href).searchParams.get("p")).toBe(token);
    expect(decodeSavedPlanToken(new URL(link.href).searchParams.get("p"))).toEqual(spec);
    await act(async () => root.unmount());
    host.innerHTML = "";
    root = createRoot(host);
    const reads = vi.spyOn(Storage.prototype, "getItem");
    await act(async () => root.render(<SavedList />));
    expect(reads).toHaveBeenCalledWith(SAVED_OUTINGS_KEY);
    link = host.querySelector<HTMLAnchorElement>('a[aria-label="Open outing: Our Brunswick date"]')!;
    expect(new URL(link.href).searchParams.get("p")).toBe(token);
    expect(new URL(link.href).searchParams.get("returnTo")).toBe("/my-radius");
    expect(host.querySelector('section[aria-label="Saved outings"] h2')?.textContent).toBe("Saved outings");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns keyboard focus to the next outing and then Saved after the last confirmed removal", async () => {
    await act(async () => saveOuting(token, "Our Brunswick date"));
    await act(async () => saveOuting(encodeSpec({ ...spec, i: { ...spec.i, seed: 9 } }), "A second outing"));
    await act(async () => root.render(<SavedList />));
    let remove = button("Remove outing: A second outing");
    remove.focus();
    await act(async () => { remove.click(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(host.querySelector('a[aria-label="Open outing: Our Brunswick date"]'));
    remove = button("Remove outing: Our Brunswick date");
    remove.focus();
    await act(async () => { remove.click(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(host.querySelector("#saved-page-heading"));
    expect(host.querySelector('[data-saved-empty-state] a[href="/plan?returnTo=%2Fmy-radius"]')?.textContent).toContain("Plan an outing");
  });

  it("does not overwrite a newer keyboard focus while removal waits for the lock", async () => {
    await act(async () => saveOuting(token, "Our Brunswick date"));
    await act(async () => root.render(<SavedList />));
    const release = locks.hold();
    const remove = button("Remove outing: Our Brunswick date");
    remove.focus();
    await act(async () => remove.click());
    const nextAction = document.createElement("button");
    nextAction.textContent = "Another action";
    host.append(nextAction);
    nextAction.focus();
    await act(async () => { release(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(nextAction);
  });

  it("keeps local outing cards usable while unrelated saved places are still hydrating", async () => {
    await act(async () => saveOuting(token, "Our Brunswick date"));
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "cafe-nola", saved_at: "2026-10-12" }]));
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    await act(async () => root.render(<SavedList />));
    expect(host.querySelector('a[aria-label="Open outing: Our Brunswick date"]')).not.toBeNull();
    expect(host.textContent).toContain("Loading saved places");
    expect(host.querySelector("[data-saved-empty-state]")).toBeNull();
  });

  it("never displays a success confirmation when the write is refused", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => button("Save outing").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not confirm");
    expect(host.textContent).not.toContain("Saved on this device. Open");
    expect(button("Saved outing state unavailable").hasAttribute("aria-pressed")).toBe(false);
    expect(button("Saved outing state unavailable").disabled).toBe(true);
    expect(host.querySelector('a[aria-label^="Open outing:"]')).toBeNull();
  });

  it("offers an actual reread for unreadable device records without pretending the list is empty", async () => {
    localStorage.setItem(SAVED_OUTINGS_KEY, "{broken");
    await act(async () => refreshSavedOutings());
    await render();
    expect(button("Saved outing state unavailable").disabled).toBe(true);
    expect(host.textContent).toContain("could not confirm saved outings");
    expect(localStorage.getItem(SAVED_OUTINGS_KEY)).toBe("{broken");
    localStorage.setItem(SAVED_OUTINGS_KEY, "[]");
    const retry = [...host.querySelectorAll("button")].find((control) => control.textContent === "Try again")!;
    await act(async () => retry.click());
    expect(button("Save outing").disabled).toBe(false);
  });

  it("confirms removal of the last card through the existing global live feedback and restores the honest empty state", async () => {
    await act(async () => saveOuting(token, "Our Brunswick date"));
    await act(async () => root.render(<SavedList />));
    await act(async () => button("Remove outing: Our Brunswick date").click());
    expect(mocks.toast).toHaveBeenCalledWith("The outing was removed from Saved on this device.");
    expect(host.querySelector("[data-saved-empty-state]")).not.toBeNull();
    expect(host.textContent).toContain("Save an outing");
    expect(JSON.parse(localStorage.getItem(SAVED_OUTINGS_KEY)!)).toEqual([]);
  });

  it("retains the card and presents an error if removal is not confirmed", async () => {
    await act(async () => saveOuting(token, "Our Brunswick date"));
    await act(async () => root.render(<SavedList />));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => button("Remove outing: Our Brunswick date").click());
    expect(host.querySelector('a[aria-label="Open outing: Our Brunswick date"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not confirm");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(button("Remove outing: Our Brunswick date").disabled).toBe(true);
  });

  it("does not turn a delayed save of a previous plan into a confirmation for newer choices", async () => {
    await render();
    const release = locks.hold();
    await act(async () => button("Save outing").click());
    const nextToken = encodeSpec({ ...spec, i: { ...spec.i, audience: "family", duration_hours: 2 } });
    await act(async () => root.render(<Journey planToken={nextToken} />));
    await act(async () => { release(); });
    expect(button("Save outing").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(SAVED_OUTINGS_KEY)!)[0].token).toBe(token);
    expect(new URL(host.querySelector<HTMLAnchorElement>('a[aria-label^="Open outing:"]')!.href).searchParams.get("p")).toBe(token);
  });
});
