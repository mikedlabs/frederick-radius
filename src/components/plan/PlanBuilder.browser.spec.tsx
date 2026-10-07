// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan, PlanSpec } from "@/lib/integrations/planner";
import { encodeSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), check: vi.fn(), share: vi.fn(), params: new URLSearchParams("returnTo=%2Fevents%2Fruntime-concert") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: new Set() }) }));
vi.mock("@/components/ui/BottomDrawer", () => ({ default: () => null }));
vi.mock("@/components/place/PlaceMedallion", () => ({ PlaceMedallion: () => <span /> }));
vi.mock("./actions", () => ({ removeStop: mocks.remove, planFromToken: mocks.check, addStop: vi.fn(), generatePlan: vi.fn(), setStop: vi.fn(), stopAlternatives: vi.fn(), stopSwapOptions: vi.fn() }));
import PlanBuilder from "./PlanBuilder";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const spec: PlanSpec = { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 4, start_at: "2026-10-06T23:00:00Z", event_anchor_slug: "runtime-concert" }, s: [{ e: "runtime-concert" }] };
const unavailable = (): Plan => ({ title: "An evening with friends", summary: "Your choices are saved.", stops: [], share: encodeSpec(spec), notices: [{ spec_index: 0, code: "unavailable", message: "Radius could not confirm this event right now. Its place in your plan is saved. Try again shortly." }] });
describe("event outing recovery and edit presentation", () => {
  let root: Root; let host: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); Object.defineProperty(navigator, "share", { configurable: true, value: mocks.share.mockResolvedValue(undefined) }); window.history.replaceState({}, "", "/plan?returnTo=%2Fevents%2Fruntime-concert"); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const render = (plan: Plan) => act(() => root.render(<PlanBuilder initialPlan={plan} initialInputs={spec.i} />));
  const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
  it("preserves a missing event and offers retry, removal, and share without directions", async () => {
    const plan = unavailable(); render(plan);
    expect(host.textContent).toContain("Its place in your plan is saved"); expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    mocks.check.mockResolvedValue(plan); await act(async () => button("Check event again").click());
    expect(mocks.check).toHaveBeenCalledWith(plan.share); expect(host.textContent).toContain("Review your event");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Share this plan"]')!.click());
    const shared = new URL(mocks.share.mock.calls[0][0].url); expect([...shared.searchParams.keys()]).toEqual(["p"]); expect(shared.searchParams.get("p")).toBe(plan.share);
    mocks.remove.mockResolvedValue({ ...plan, notices: [], share: encodeSpec({ ...spec, s: [] }) });
    await act(async () => button("Remove saved reference").click()); expect(mocks.remove).toHaveBeenCalledWith(plan.share, 0);
  });
  it("removes a displayed stop by its preserved token slot rather than display position", async () => {
    const plan: Plan = { title: "An outing", summary: "One stop.", share: encodeSpec({ ...spec, s: [{ e: "unresolved" }, { p: "dinner" }] }), notices: unavailable().notices, stops: [{ order: 1, spec_index: 1, at: spec.i.start_at!, duration_min: 80, why: "A local choice.", open: "unknown", place: { slug: "dinner", name: "Dinner", address: "24 W Patrick Street", city: "Frederick", category: "restaurant", geom: { lng: -77.4128, lat: 39.4142 } } as NonNullable<Plan["stops"][number]["place"]> }] };
    mocks.remove.mockResolvedValue(unavailable()); render(plan);
    const remove = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Remove");
    expect(remove).toBeTruthy(); await act(async () => remove!.click()); expect(mocks.remove).toHaveBeenCalledWith(plan.share, 1);
  });
  it("leaves unconfirmed nearby hours outside the timed route and uses the correct removal slot", async () => {
    const plan = unavailable(); plan.notices = []; plan.unscheduled = [{ spec_index: 1, place: { slug: "nearby", name: "Nearby dinner", category: "restaurant" } as NonNullable<Plan["unscheduled"]>[number]["place"], why: "Confirm hours before visiting." }];
    render(plan); expect(host.textContent).toContain("Not included in the timed route"); expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    mocks.remove.mockResolvedValue(unavailable()); await act(async () => button("Remove nearby option").click()); expect(mocks.remove).toHaveBeenCalledWith(plan.share, 1);
  });
});
