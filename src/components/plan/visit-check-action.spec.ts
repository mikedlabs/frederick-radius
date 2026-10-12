import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";
import type { Plan, PlanSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), weather: vi.fn() }));
vi.mock("@/lib/plan/resolve-shared-plan", () => ({ resolveSharedPlan: mocks.resolve }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: mocks.weather }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaces: () => [], clientPlaceBySlug: () => undefined }));
import { encodeSpec, decodeSpec } from "@/lib/integrations/planner";
import { checkPlanBeforeVisit } from "./visit-check-action";
const now = new Date("2026-10-12T12:00:00-04:00");
const spec = (): PlanSpec => ({ v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 2, start_at: "2026-10-12T13:00:00-04:00", municipality: "frederick" }, s: [{ p: "lunch" }] });
const p: Place = { slug: "lunch", name: "Local lunch", category: "restaurant", short_blurb: "A local restaurant.", address: "24 W Patrick Street", city: "Frederick", state: "MD", postal_code: "21701", municipality: "frederick", geom: { lng: -77.4126, lat: 39.4142 }, source: "manual", is_verified: true, feature_score: 5, updated_at: now.toISOString() };
const plan = (): Plan => ({ title: "Local outing", summary: "Your outing.", share: "reencoded-current-token", stops: [{ order: 1, spec_index: 0, at: spec().i.start_at!, duration_min: 80, place: p, why: "A local stop.", open: "unknown" }] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); mocks.resolve.mockResolvedValue(plan()); mocks.weather.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());
describe("bounded visit check action", () => {
  it("returns refreshed exact choices while preserving the incoming share token", async () => {
    const token = encodeSpec(spec()); const result = await checkPlanBeforeVisit(token);
    expect(mocks.resolve).toHaveBeenCalledWith(spec(), { timeoutMs: 1000 });
    expect(mocks.weather).toHaveBeenCalledWith(p.geom); expect(result?.plan.share).toBe(token);
    expect(decodeSpec(result!.plan.share)).toEqual(spec()); expect(result?.briefing.stops[0].status).toBe("unavailable");
  });
  it("retains an unavailable event token and notices without falling back to another event", async () => {
    const original = { ...spec(), s: [{ e: "runtime-concert" }] };
    const saved = { ...plan(), stops: [], notices: [{ spec_index: 0, code: "unavailable" as const, message: "Unable to verify the event. Your reference is saved." }] };
    mocks.resolve.mockResolvedValue(saved); const token = encodeSpec(original);
    const result = await checkPlanBeforeVisit(token);
    expect(result?.plan.share).toBe(token); expect(decodeSpec(result!.plan.share)?.s).toEqual(original.s);
    expect(result?.plan.notices).toEqual(saved.notices); expect(mocks.weather).not.toHaveBeenCalled();
  });
  it("returns the refreshed plan with an unavailable weather state when NWS fails", async () => {
    mocks.weather.mockRejectedValue(new Error("Source unavailable"));
    const token = encodeSpec(spec()); const result = await checkPlanBeforeVisit(token);
    expect(result?.plan.share).toBe(token); expect(result?.plan.stops).toEqual(plan().stops);
    expect(result?.briefing.weather.status).toBe("unavailable");
  });
  it("skips NWS work for a future outing outside the returned hourly horizon", async () => {
    const future = "2026-10-16T13:00:00-04:00"; const original = { ...spec(), i: { ...spec().i, start_at: future } };
    const saved = plan(); saved.stops[0].at = future; mocks.resolve.mockResolvedValue(saved);
    const result = await checkPlanBeforeVisit(encodeSpec(original));
    expect(mocks.weather).not.toHaveBeenCalled(); expect(result?.briefing.weather.coverage).toBe("outside");
  });
  it("returns null on a resolver error so the client can retain its existing plan", async () => {
    mocks.resolve.mockRejectedValue(new Error("Catalog read failed"));
    expect(await checkPlanBeforeVisit(encodeSpec(spec()))).toBeNull(); expect(mocks.weather).not.toHaveBeenCalled();
  });
  it.each(["invalid", "a".repeat(8001), encodeSpec({ ...spec(), i: { ...spec().i, municipality: "outside-town" } }), encodeSpec({ ...spec(), s: [] })])("rejects invalid or empty scope before source work", async (token) => {
    expect(await checkPlanBeforeVisit(token)).toBeNull(); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.weather).not.toHaveBeenCalled();
  });
});
