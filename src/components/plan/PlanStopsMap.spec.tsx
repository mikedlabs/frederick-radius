// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@/lib/integrations/planner";

const mocks = vi.hoisted(() => ({ map: vi.fn(), fail: false }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/map/AppMapClient", () => ({ default: (props: unknown) => {
  mocks.map(props);
  if (mocks.fail) throw new Error("Map chunk unavailable");
  return <div data-testid="stops-map">Real map shell boundary</div>;
} }));
import PlanStopsMap from "./PlanStopsMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const plan: Plan = {
  title: "An outing", summary: "Two real stops", share: "exact-plan-token",
  stops: [
    { order: 1, at: "2026-10-12T20:00:00Z", duration_min: 40, why: "Coffee", open: "open", place: { slug: "coffee", name: "Coffee stop", category: "coffee", geom: { lng: -77.41, lat: 39.414 }, source: "manual", municipality: "frederick", short_blurb: "Coffee", is_verified: true } as NonNullable<Plan["stops"][number]["place"]> },
    { order: 2, spec_index: 3, at: "2026-10-12T21:00:00Z", duration_min: 90, why: "Music", open: "open", event: { slug: "music", title: "Evening music", category: "music", starts_at: "2026-10-12T21:00:00Z", ends_at: "2026-10-12T22:30:00Z", geom: { lng: -77.413, lat: 39.416 }, venue_name: "Music venue" } as NonNullable<Plan["stops"][number]["event"]> },
  ],
};

describe("on-demand planned stop map", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mocks.map.mockClear(); mocks.fail = false;
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  const render = (value: Plan = plan) => act(() => root.render(<PlanStopsMap plan={value} returnTo="/plan?p=exact-plan-token&in=frederick" />));
  const toggle = () => host.querySelector<HTMLButtonElement>("button")!;
  const expand = async () => { await act(async () => { toggle().click(); await new Promise((resolve) => setTimeout(resolve, 0)); }); };

  it("mounts the provider map only after an explicit expansion and removes it on close", async () => {
    render();
    expect(mocks.map).not.toHaveBeenCalled();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("[data-testid=stops-map]")).toBeNull();
    await expand();
    expect(mocks.map).toHaveBeenCalled();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("[data-testid=stops-map]")).not.toBeNull();
    act(() => toggle().click());
    expect(host.querySelector("[data-testid=stops-map]")).toBeNull();
  });

  it("frames actual place and event coordinates without turning scheduled hours into open-now claims", async () => {
    render(); await expand();
    const props = mocks.map.mock.calls.at(-1)![0];
    expect(props.places).toHaveLength(1); expect(props.events).toHaveLength(1);
    expect(props.places[0].geom).toEqual(plan.stops[0].place!.geom);
    expect(props.places[0].open_status).toEqual({ state: "unknown" });
    expect(props.events[0]).toMatchObject({ slug: "music", lng: -77.413, lat: 39.416 });
    expect(props.initialBounds[0][0]).toBeLessThan(-77.413);
    expect(props.initialBounds[1][1]).toBeGreaterThan(39.416);
    expect(props).toMatchObject({ compactSubjectMap: true, fullBleed: true, showSearchControls: false, recenterToKnownLocation: false });
    expect(props.trailLines).toBeUndefined();
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links).toHaveLength(2);
    expect(new URL(links[1].href).pathname).toBe("/events/music");
    expect(new URL(links[1].href).searchParams.get("returnTo")).toBe("/plan?p=exact-plan-token&in=frederick");
  });

  it("keeps canonical detail actions available when the map fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fail = true;
    render(); await expand();
    expect(host.textContent).toContain("The map could not load");
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links.map((link) => new URL(link.href).pathname)).toEqual(["/places/coffee", "/events/music"]);
    expect(toggle().disabled).toBe(false);
  });

  it("does not offer a misleading map for held or invalid-location stops", () => {
    render({ ...plan, stops: [], notices: [{ spec_index: 0, code: "unavailable", message: "Held event" }] });
    expect(host.textContent).toBe(""); expect(mocks.map).not.toHaveBeenCalled();
    render({ ...plan, stops: [{ ...plan.stops[0], place: { ...plan.stops[0].place!, geom: { lng: Number.NaN, lat: 39.4 } } }] });
    expect(host.querySelector("button")).toBeNull(); expect(mocks.map).not.toHaveBeenCalled();
  });
});
