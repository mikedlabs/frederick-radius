// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan, PlanSpec } from "@/lib/integrations/planner";
import { decodeSpec, encodeSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), check: vi.fn(), generate: vi.fn(), swapOptions: vi.fn(), share: vi.fn(), params: new URLSearchParams("returnTo=%2Fevents%2Fruntime-concert") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: new Set() }) }));
vi.mock("@/components/ui/BottomDrawer", () => ({ default: () => null }));
vi.mock("@/components/place/PlaceMedallion", () => ({ PlaceMedallion: () => <span /> }));
vi.mock("@/lib/events/event-identity", () => ({ archivedEventsBySlugs: vi.fn(async () => ({ matches: [], unresolvedSlugs: [] })) }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: vi.fn(async () => null) }));
vi.mock("./actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actions")>();
  mocks.remove.mockImplementation(actual.removeStop);
  mocks.swapOptions.mockImplementation(actual.stopSwapOptions);
  return { ...actual, stopSwapOptions: mocks.swapOptions, removeStop: mocks.remove, planFromToken: mocks.check, generatePlan: mocks.generate };
});
import PlanBuilder from "./PlanBuilder";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const spec: PlanSpec = { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 4, start_at: "2026-10-06T23:00:00Z", event_anchor_slug: "runtime-concert" }, s: [{ e: "runtime-concert" }] };
const unavailable = (): Plan => ({ title: "An evening with friends", summary: "Your choices are saved.", stops: [], share: encodeSpec(spec), notices: [{ spec_index: 0, code: "unavailable", message: "Radius could not confirm this event right now. Its place in your plan is saved. Try again shortly." }] });
const recovered = (): Plan => ({ title: "An outing around Evening concert", summary: "A full published event visit.", share: encodeSpec(spec), stops: [{ order: 1, spec_index: 0, at: spec.i.start_at!, duration_min: 180, why: "The current published event time.", open: "open", event: { slug: "runtime-concert", title: "Evening concert", starts_at: spec.i.start_at!, ends_at: "2026-10-07T02:00:00Z", geom: { lng: -77.4126, lat: 39.4142 }, category: "music", venue_name: "Weinberg Center", source_url: "https://example.org/concert" } as NonNullable<Plan["stops"][number]["event"]> }] });
describe("event outing recovery and edit presentation", () => {
  let root: Root; let host: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    Object.defineProperty(navigator, "share", { configurable: true, value: mocks.share.mockResolvedValue(undefined) });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    window.history.replaceState({}, "", "/plan?returnTo=%2Fevents%2Fruntime-concert");
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  const render = (plan: Plan) => act(() => root.render(<PlanBuilder initialPlan={plan} initialInputs={spec.i} />));
  const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
  it("preserves a missing event for share and removes its actual saved reference without directions", async () => {
    const plan = unavailable(); render(plan);
    expect(host.textContent).toContain("Its place in your plan is saved");
    expect(host.textContent).not.toContain("The event keeps its published start and full duration.");
    expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Share this plan"]')!.click());
    const shared = new URL(mocks.share.mock.calls[0][0].url);
    expect([...shared.searchParams.keys()]).toEqual(["p"]);
    expect(shared.searchParams.get("p")).toBe(plan.share);
    await act(async () => button("Remove saved reference").click());
    expect(mocks.remove).toHaveBeenCalledWith(plan.share, 0);
    const edited = decodeSpec(new URL(window.location.href).searchParams.get("p")!)!;
    expect(edited.s).toEqual([]);
    expect(edited.i.event_anchor_slug).toBeUndefined();
    expect(host.textContent).not.toContain("Its place in your plan is saved");
  });
  it("re-checks a missing event into a recovered full stop and removes the unavailable notice", async () => {
    const plan = unavailable(); render(plan);
    mocks.check.mockResolvedValue(recovered());
    await act(async () => button("Check event again").click());
    expect(mocks.check).toHaveBeenCalledWith(plan.share);
    expect(host.textContent).toContain("Evening concert");
    expect(host.textContent).toContain("The event keeps its published start and full duration.");
    expect(host.textContent).toContain("The event listing has been checked again.");
    expect(host.textContent).not.toContain("could not confirm this event");
    expect(host.textContent).not.toContain("Review your event");
    expect(host.querySelector('a[href*="google.com/maps"]')).not.toBeNull();
  });
  it("removes a displayed stop by its real token slot rather than display position", async () => {
    const plan: Plan = { title: "An outing", summary: "One stop.", share: encodeSpec({ ...spec, s: [{ e: "unresolved" }, { p: "dinner" }] }), notices: unavailable().notices, stops: [{ order: 1, spec_index: 1, at: spec.i.start_at!, duration_min: 80, why: "A local choice.", open: "unknown", place: { slug: "dinner", name: "Dinner", address: "24 W Patrick Street", city: "Frederick", category: "restaurant", geom: { lng: -77.4128, lat: 39.4142 } } as NonNullable<Plan["stops"][number]["place"]> }] };
    render(plan);
    await act(async () => button("Remove").click());
    expect(mocks.remove).toHaveBeenCalledWith(plan.share, 1);
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.s).toEqual([{ e: "unresolved" }]);
    expect(host.textContent).not.toContain("Dinner");
  });
  it("keeps both nearby controls disabled in the server preview and usable after hydration", async () => {
    const plan = unavailable();
    plan.notices = [];
    plan.share = encodeSpec({ ...spec, s: [...spec.s, { p: "nearby" }] });
    plan.unscheduled = [{ spec_index: 1, place: { slug: "nearby", name: "Nearby dinner", category: "restaurant" } as NonNullable<Plan["unscheduled"]>[number]["place"], why: "Confirm hours before visiting." }];
    act(() => root.unmount());
    const preview = <PlanBuilder initialPlan={plan} initialInputs={spec.i} />;
    host.innerHTML = renderToString(preview);
    for (const name of ["Change nearby option", "Remove nearby option"]) {
      expect(button(name).disabled).toBe(true);
      button(name).click();
    }
    expect(mocks.swapOptions).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { root = hydrateRoot(host, preview); });
    expect(button("Change nearby option").disabled).toBe(false);
    expect(button("Remove nearby option").disabled).toBe(false);
    await act(async () => button("Change nearby option").click());
    expect(mocks.swapOptions).toHaveBeenCalledWith(plan.share, 1);
    await act(async () => button("Remove nearby option").click());
    expect(mocks.remove).toHaveBeenCalledWith(plan.share, 1);
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.s).toEqual(spec.s);
    expect(host.textContent).not.toContain("Nearby dinner");
  });
  it("removes an untimed nearby option from a matching real token slot", async () => {
    const plan = unavailable();
    plan.notices = [];
    plan.share = encodeSpec({ ...spec, s: [...spec.s, { p: "nearby" }] });
    plan.unscheduled = [{ spec_index: 1, place: { slug: "nearby", name: "Nearby dinner", category: "restaurant" } as NonNullable<Plan["unscheduled"]>[number]["place"], why: "Confirm hours before visiting." }];
    render(plan);
    expect(host.textContent).toContain("Not included in the timed route");
    expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    await act(async () => button("Remove nearby option").click());
    expect(mocks.remove).toHaveBeenCalledWith(plan.share, 1);
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.s).toEqual(spec.s);
    expect(host.textContent).not.toContain("Nearby dinner");
  });
  it("starts another outing with unlocked time controls and no retained event anchor", async () => {
    render(recovered());
    await act(async () => button("Start another").click());
    expect(host.querySelector('[aria-label="Start time"]')).not.toBeNull();
    const plain: PlanSpec = { ...spec, i: { ...spec.i }, s: [] };
    delete plain.i.event_anchor_slug;
    mocks.generate.mockResolvedValue({ title: "New outing", summary: "Your new choices.", stops: [], share: encodeSpec(plain) });
    await act(async () => button("Build my plan").click());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].event_anchor_slug).toBeUndefined();
    expect(host.textContent).toContain("New outing");
    expect(host.textContent).not.toContain("Evening concert");
  });
});
