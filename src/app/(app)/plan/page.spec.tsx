import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSpec, type Plan, type PlanSpec } from "@/lib/integrations/planner";
const mocks = vi.hoisted(() => ({ around: vi.fn(), shared: vi.fn() }));
vi.mock("@/lib/plan/resolve-shared-plan", () => ({ planAroundEvent: mocks.around, resolveSharedPlan: mocks.shared }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaceBySlug: () => null, clientPlaces: () => [] }));
vi.mock("@/components/plan/PlanBuilder", () => ({ default: () => null }));
vi.mock("@/components/ui/PageBloom", () => ({ default: () => null }));
vi.mock("@/components/place/MapReturnLink", () => ({ default: () => null }));
import PlanBuilder from "@/components/plan/PlanBuilder";
import PlanPage from "./page";
function builderProps(node: ReactNode): { initialPlan?: Plan; initialInputs?: PlanSpec["i"] } | undefined {
  if (Array.isArray(node)) return node.map(builderProps).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; initialPlan?: Plan; initialInputs?: PlanSpec["i"] }>(node)) return undefined;
  return node.type === PlanBuilder ? node.props : builderProps(node.props.children);
}
beforeEach(() => vi.clearAllMocks());
describe("event plan page identity entry", () => {
  it.each([160, 200])("opens an accepted %s-character event slug with its event inputs", async (length) => {
    const slug = "a".repeat(length);
    const spec: PlanSpec = { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 4, event_anchor_slug: slug }, s: [{ e: slug }] };
    const plan: Plan = { title: "An event outing", summary: "Your choices.", stops: [], share: encodeSpec(spec) };
    mocks.around.mockResolvedValue(plan);
    const page = await PlanPage({ searchParams: Promise.resolve({ event: slug }) });
    expect(mocks.around).toHaveBeenCalledWith(slug);
    expect(builderProps(page)?.initialPlan).toBe(plan);
    expect(builderProps(page)?.initialInputs?.event_anchor_slug).toBe(slug);
  });
  it.each(["constructor", "prototype", "a".repeat(201), "event/secret"])("does not request a rejected event entry: %s", async (event) => {
    const page = await PlanPage({ searchParams: Promise.resolve({ event }) });
    expect(mocks.around).not.toHaveBeenCalled();
    expect(builderProps(page)?.initialPlan).toBeUndefined();
  });
});
