// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan, PlanInputs, PlanSpec } from "@/lib/integrations/planner";
import { decodeSpec, encodeSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), check: vi.fn(), generate: vi.fn(), regenerate: vi.fn(), visit: vi.fn(), swapOptions: vi.fn(), share: vi.fn(), params: new URLSearchParams("returnTo=%2Fevents%2Fruntime-concert") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: new Set() }) }));
vi.mock("@/components/ui/BottomDrawer", () => ({ default: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }));
vi.mock("./visit-check-action", () => ({ checkPlanBeforeVisit: mocks.visit }));
vi.mock("@/components/place/PlaceMedallion", () => ({ PlaceMedallion: () => <span /> }));
vi.mock("@/lib/events/event-identity", () => ({ archivedEventsBySlugs: vi.fn(async () => ({ matches: [], unresolvedSlugs: [] })) }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: vi.fn(async () => null) }));
vi.mock("./actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actions")>();
  mocks.remove.mockImplementation(actual.removeStop);
  mocks.swapOptions.mockImplementation(actual.stopSwapOptions);
  return { ...actual, stopSwapOptions: mocks.swapOptions, removeStop: mocks.remove, planFromToken: mocks.check, generatePlan: mocks.generate, regeneratePinnedPlan: mocks.regenerate };
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
    await act(async () => button("Check saved choices again").click());
    expect(mocks.check).toHaveBeenCalledWith(plan.share);
    expect(host.textContent).toContain("Evening concert");
    expect(host.textContent).toContain("The event keeps its published start and full duration.");
    expect(host.textContent).toContain("Your saved choices have been checked again.");
    expect(host.textContent).not.toContain("could not confirm this event");
    expect(host.textContent).not.toContain("Review your saved choices");
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
    for (const name of ["Change this choice", "Remove this choice"]) {
      expect(button(name).disabled).toBe(true);
      button(name).click();
    }
    expect(mocks.swapOptions).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { root = hydrateRoot(host, preview); });
    expect(button("Change this choice").disabled).toBe(false);
    expect(button("Remove this choice").disabled).toBe(false);
    await act(async () => button("Change this choice").click());
    expect(mocks.swapOptions).toHaveBeenCalledWith(plan.share, 1);
    await act(async () => button("Remove this choice").click());
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
    expect(host.textContent).toContain("This choice is outside the timed route");
    expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    await act(async () => button("Remove this choice").click());
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
  it("rebuilds after removing the last pinned stop instead of retaining an empty pin", async () => {
    const plain: PlanSpec = { v: 1, i: { audience: "friends", vibe: "food", duration_hours: 3, municipality: "brunswick", max_distance_m: 1200, budget: "free", require_wheelchair_access: true }, s: [{ p: "dinner" }] };
    const initial: Plan = { title: "An outing", summary: "A stop.", share: encodeSpec(plain), stops: [{ order: 1, spec_index: 0, at: spec.i.start_at!, duration_min: 60, why: "A choice.", open: "unknown", place: { slug: "dinner", name: "Dinner", category: "restaurant", address: "1 Main Street", city: "Brunswick", geom: { lng: -77.63, lat: 39.31 } } as NonNullable<Plan["stops"][number]["place"]> }] };
    await act(async () => root.render(<PlanBuilder initialPlan={initial} initialInputs={plain.i} />));
    await act(async () => button("Pin").click());
    const empty = { ...initial, stops: [], share: encodeSpec({ ...plain, s: [] }) };
    mocks.remove.mockResolvedValueOnce(empty);
    await act(async () => button("Remove").click());
    await act(async () => button("Adjust").click());
    mocks.generate.mockResolvedValueOnce(empty);
    await act(async () => button("Update this plan").click());
    expect(mocks.regenerate).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ max_distance_m: 1200, budget: "free", require_wheelchair_access: true, municipality: "brunswick" }));
  });
  it("keeps the current plan when a pre-trip check fails and prevents a pending reset", async () => {
    render(recovered());
    let reject!: (reason: Error) => void;
    mocks.visit.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await act(async () => button("Check this plan").click());
    expect(button("Start another").disabled).toBe(true);
    await act(async () => reject(new Error("Unavailable")));
    expect(host.textContent).toContain("Your choices are still here");
    expect(host.textContent).toContain("Evening concert");
    expect(button("Start another").disabled).toBe(false);
  });
  it("does not let a late location result override a newer selected town", async () => {
    let success!: PositionCallback;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (callback: PositionCallback) => { success = callback; } } });
    await act(async () => root.render(<PlanBuilder />));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Use my current location"]')!.click());
    const area = host.querySelector<HTMLSelectElement>('select[aria-label="Planning area"]')!;
    await act(async () => { area.value = "brunswick"; area.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => success({ coords: { longitude: -77.4, latitude: 39.4 } } as GeolocationPosition));
    expect(area.value).toBe("brunswick");
    expect(host.textContent).not.toContain("The route will start near your current location");
  });
});

describe("explicit confirmed-hours planning preference", () => {
  let root: Root;
  let host: HTMLDivElement;
  const hoursLabel = "Only include stops with confirmed hours";
  const draftIntro = "Draft outing. Times are suggestions; confirm venue hours before setting out.";
  const strictIntro = "Only stops with confirmed hours will be included.";
  const draftResult = "Draft outing. These times are suggestions. Confirm each venue’s hours before setting out.";
  const ordinaryInputs = (overrides: Partial<PlanInputs> = {}): PlanInputs => ({
    audience: "friends", vibe: "easy", duration_hours: 3, municipality: "frederick", ...overrides,
  });
  const ordinaryPlan = (inputs: PlanInputs, empty = false): Plan => ({
    title: "An outing in Frederick", summary: empty ? "No stops fit." : "A local dinner choice.",
    share: encodeSpec({ v: 1, i: inputs, s: empty ? [] : [{ p: "dinner" }] }),
    stops: empty ? [] : [{
      order: 1, spec_index: 0, at: inputs.start_at ?? "2026-10-12T17:00:00Z", duration_min: 60,
      why: "A local choice.", open: inputs.require_verified_hours ? "open" : "unknown",
      place: { slug: "dinner", name: "Dinner", address: "24 W Patrick Street", city: "Frederick", category: "restaurant", geom: { lng: -77.4128, lat: 39.4142 } } as NonNullable<Plan["stops"][number]["place"]>,
    }],
  });
  const render = (initialInputs?: Partial<PlanInputs>, initialPlan?: Plan) => act(() => root.render(
    <PlanBuilder initialInputs={initialInputs} initialPlan={initialPlan} />,
  ));
  const button = (name: string) => {
    const found = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
    expect(found, `Expected the ${name} button`).toBeDefined();
    return found!;
  };
  const hoursCheckbox = () => {
    const label = [...host.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim() === hoursLabel);
    expect(label, "The confirmed-hours control has a visible associated label").toBeDefined();
    const input = label!.control as HTMLInputElement;
    expect(input?.type).toBe("checkbox");
    return input;
  };
  const openFineTune = async () => {
    const summary = [...host.querySelectorAll("summary")].find((candidate) => candidate.textContent?.includes("Fine-tune the outing"))!;
    expect(summary).toBeDefined();
    await act(async () => summary.click());
    expect(summary.parentElement?.hasAttribute("open")).toBe(true);
  };
  const setHoursOnly = async (checked: boolean) => {
    const input = hoursCheckbox();
    if (input.checked !== checked) await act(async () => input.click());
    expect(hoursCheckbox().checked).toBe(checked);
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockReset().mockImplementation(async (inputs: PlanInputs) => ordinaryPlan(inputs));
    mocks.regenerate.mockReset().mockImplementation(async (_token: string, inputs: PlanInputs) => ordinaryPlan(inputs));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    window.history.replaceState({}, "", "/plan");
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("keeps native editor fields and Build unavailable until their handlers are hydrated", async () => {
    act(() => root.unmount());
    const preview = <PlanBuilder />;
    host.innerHTML = renderToString(preview);
    const start = host.querySelector<HTMLSelectElement>('#plan-start')!;
    expect(host.querySelector('[data-plan-controls-ready]')?.getAttribute('data-plan-controls-ready')).toBe('false');
    expect([...host.querySelectorAll('select, input, button')].every((control) => control.matches(':disabled'))).toBe(true);
    expect(start.value).toBe('now');
    button('Build my plan').click();
    expect(mocks.generate).not.toHaveBeenCalled();

    await act(async () => { root = hydrateRoot(host, preview); });
    expect(start.matches(':disabled')).toBe(false);
    expect(button('Build my plan').disabled).toBe(false);
    await act(async () => {
      start.value = 'custom';
      start.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('input[aria-label="Custom start date and time in Frederick"]')).not.toBeNull();
  });

  it("gates every server-rendered outing action while leaving real destination links available", async () => {
    act(() => root.unmount());
    const inputs = ordinaryInputs();
    const preview = <PlanBuilder initialInputs={inputs} initialPlan={ordinaryPlan(inputs)} />;
    host.innerHTML = renderToString(preview);
    const actions = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(actions.length).toBeGreaterThan(6);
    expect(actions.every((control) => control.disabled)).toBe(true);
    expect(host.querySelector('a[href*="google.com/maps"]')).not.toBeNull();
    expect(host.querySelector('a[href^="/places/"]')).not.toBeNull();
    actions.forEach((control) => control.click());
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.visit).not.toHaveBeenCalled();

    await act(async () => { root = hydrateRoot(host, preview); });
    const pin = button('Pin');
    expect(pin.disabled).toBe(false);
    await act(async () => pin.click());
    expect(button('Pinned').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('button[aria-label="Share this plan"]')?.hasAttribute('disabled')).toBe(false);
    expect(button('Show stops on map').disabled).toBe(false);
  });

  it("starts as an explicit draft and puts the hours warning before route directions", async () => {
    render();
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(false);
    expect(host.textContent).toContain(draftIntro);
    expect(host.textContent).not.toContain(strictIntro);
    await act(async () => button("Build my plan").click());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ require_verified_hours: false }));
    const warning = [...host.querySelectorAll("p")].find((paragraph) => paragraph.textContent?.trim() === draftResult);
    const route = [...host.querySelectorAll("a")].find((anchor) => anchor.textContent?.trim() === "Open full route");
    expect(warning).toBeDefined();
    expect(route).toBeDefined();
    expect(warning!.compareDocumentPosition(route!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.i.require_verified_hours).toBe(false);
  });

  it("keeps an inherited confirmed-hours requirement checked through Build and Adjust", async () => {
    render(ordinaryInputs({ require_verified_hours: true }));
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(true);
    expect(host.textContent).toContain(strictIntro);
    expect(host.textContent).not.toContain(draftIntro);
    await act(async () => button("Build my plan").click());
    expect(mocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ require_verified_hours: true }));
    expect(host.textContent).not.toContain(draftResult);
    await act(async () => button("Adjust").click());
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(true);
    expect(host.textContent).toContain(strictIntro);
    await act(async () => button("Update this plan").click());
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ require_verified_hours: true }));
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.i.require_verified_hours).toBe(true);
  });

  it.each([true, false])("uses the current token's explicit %s requirement over opposite initial inputs", async (confirmedOnly) => {
    const inputs = ordinaryInputs({ start_at: "2026-10-12T17:00:00Z", require_verified_hours: confirmedOnly });
    const plan = ordinaryPlan(inputs);
    render({ ...inputs, require_verified_hours: !confirmedOnly }, plan);
    await act(async () => button("Adjust").click());
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(confirmedOnly);
    expect(host.textContent).toContain(confirmedOnly ? strictIntro : draftIntro);
    await act(async () => button("Update this plan").click());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ require_verified_hours: confirmedOnly }));
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.i.require_verified_hours).toBe(confirmedOnly);
  });

  it("treats a dated legacy token with an omitted hours flag as strict despite initial draft inputs", async () => {
    const inputs = ordinaryInputs({ start_at: "2026-10-12T17:00:00Z" });
    render({ ...inputs, require_verified_hours: false }, ordinaryPlan(inputs));
    await act(async () => button("Adjust").click());
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(true);
    expect(host.textContent).toContain(strictIntro);
    await act(async () => button("Update this plan").click());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ require_verified_hours: true }));
  });

  it("lets a strict empty outing become a clearly labeled draft through the hours control", async () => {
    render(ordinaryInputs());
    await openFineTune();
    await setHoursOnly(true);
    expect(host.textContent).toContain(strictIntro);
    mocks.generate.mockImplementationOnce(async (inputs: PlanInputs) => ordinaryPlan(inputs, true));
    await act(async () => button("Build my plan").click());
    expect(mocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ require_verified_hours: true }));
    expect(host.textContent).toContain("Radius could not confirm venue hours for this outing.");
    expect(host.textContent).toContain("Choose Adjust, open Fine-tune the outing");
    expect(host.textContent).not.toContain("longer drive");
    expect(host.querySelector('a[href*="google.com/maps"]')).toBeNull();
    await act(async () => button("Adjust").click());
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(true);
    await setHoursOnly(false);
    expect(host.textContent).toContain(draftIntro);
    await act(async () => button("Update this plan").click());
    expect(mocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ require_verified_hours: false }));
    expect(host.textContent).toContain(draftResult);
  });

  it.each([true, false])("passes an explicit %s hours preference when regenerating a pinned stop", async (confirmedOnly) => {
    const inputs = ordinaryInputs({ require_verified_hours: !confirmedOnly });
    const plan = ordinaryPlan(inputs);
    render(inputs, plan);
    await act(async () => button("Pin").click());
    await act(async () => button("Adjust").click());
    await openFineTune();
    await setHoursOnly(confirmedOnly);
    await act(async () => button("Update this plan").click());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.regenerate).toHaveBeenCalledWith(plan.share, expect.objectContaining({ require_verified_hours: confirmedOnly }), ["dinner"]);
    expect(decodeSpec(new URL(window.location.href).searchParams.get("p")!)?.i.require_verified_hours).toBe(confirmedOnly);
    await act(async () => button("Adjust").click());
    await openFineTune();
    expect(hoursCheckbox().checked).toBe(confirmedOnly);
  });
});
