import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), runAgent: vi.fn(), shouldUseAgent: vi.fn(),
  generateText: vi.fn(), reserve: vi.fn(), assemble: vi.fn(),
}));
vi.mock("./decision-routing", () => ({ resolveAskDecisionRoute: mocks.resolve }));
vi.mock("./intelligence", () => ({ runRadiusAgent: mocks.runAgent, shouldUseRadiusAgent: mocks.shouldUseAgent }));
vi.mock("ai", () => ({ generateText: mocks.generateText, embed: vi.fn() }));
vi.mock("@/lib/usage-meter", () => ({ reserveDailyUsage: mocks.reserve }));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: mocks.assemble }));

import { askFrederick } from "./answer";
import { parseAskIntent } from "./intent";

const query = "What can I attend tomorrow?";
const now = new Date("2026-10-18T18:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ASK_AI_RUNTIME_ENABLED", "1");
  vi.stubEnv("ASK_AI_PROVIDER", "gateway");
  vi.stubEnv("AI_GATEWAY_API_KEY", "offline-only");
  mocks.shouldUseAgent.mockReturnValue(true);
  mocks.assemble.mockResolvedValue({ unified: [], publicEvents: [], sourceHealth: { degraded: true, unavailable: ["fixture"] } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Ask's decision-path paid-work boundary", () => {
  it.each([true, false])("never starts an agent or prose model after handled decision used=%s", async (usedDecision) => {
    mocks.resolve.mockResolvedValue({ intent: parseAskIntent(query, now), handled: true, usedDecision, applied: false });
    const result = await askFrederick(query, { contextLabel: "Frederick County" });
    expect(result.intent?.kind).toBe("explore");
    expect(result.answer).toBeTruthy();
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools.includes("decision-route") ?? false).toBe(usedDecision);
  });

  it("routes into the existing calendar without manufacturing an event during an outage", async () => {
    mocks.resolve.mockResolvedValue({
      intent: { ...parseAskIntent(query, now), kind: "event", label: "Current events" },
      handled: true, usedDecision: true, applied: true,
    });
    const result = await askFrederick(query, { contextLabel: "Frederick County" });
    expect(result.intent?.kind).toBe("event");
    expect(result.sources).toEqual([]);
    expect(result.actions?.some((action) => action.kind === "open" && action.href.startsWith("/events"))).toBe(true);
    expect(result.intelligence?.tools).toContain("decision-route");
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it.each(["Which gatherings can we attend?", "What can I attend tomorrow?"])("returns actual scoped calendar facts for %s without old event keywords", async (q) => {
    const baseline = parseAskIntent(q, now);
    expect(baseline.kind).toBe("explore");
    mocks.resolve.mockResolvedValue({ intent: { ...baseline, kind: "event", label: "Current events" }, handled: true, usedDecision: true, applied: true });
    const row = (slug: string, municipality: string, day = "19") => ({
      slug, title: "Community Gathering", description: "A scheduled community gathering.",
      starts_at: `2026-10-${day}T20:00:00Z`, ends_at: `2026-10-${day}T21:00:00Z`,
      venue_name: "Verified fixture hall", address: "1 Test Street", venue_slug: "fixture-hall",
      geom: { lng: -77.41, lat: 39.41 }, municipality, category: "community",
      source: "manual", is_verified: true, placement: "venue", geo_confidence: "venue_match",
      last_verified_at: "2026-10-18T17:00:00Z", is_free: true,
    });
    const local = row("local-gathering", "frederick");
    const otherTown = row("other-town-gathering", "brunswick");
    const ended = row("ended-gathering", "frederick", "17");
    mocks.assemble.mockResolvedValue({ unified: [local, otherTown, ended], publicEvents: [local, otherTown, ended], sourceHealth: { degraded: false, unavailable: [] } });
    const result = await askFrederick(q, { municipality: "frederick", contextLabel: "Frederick", canShowDistance: false });
    expect(mocks.assemble).toHaveBeenCalledOnce();
    expect(result.sources.map((source) => source.href)).toEqual(["/events/local-gathering"]);
    expect(result.answer).toContain("Community Gathering");
    expect(result.answer).toContain("one event");
    expect(result.sources[0].distance).toBeUndefined();
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("retains verified local place results for an accepted place category", async () => {
    const q = "Show me an independent art gallery";
    const baseline = parseAskIntent(q, now);
    expect(baseline.kind).toBe("explore");
    mocks.resolve.mockResolvedValue({ intent: { ...baseline, kind: "place", label: "Best local matches" }, handled: true, usedDecision: true, applied: true });
    const result = await askFrederick(q, { municipality: "frederick", contextLabel: "Frederick", canShowDistance: false });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.href.startsWith("/places/"))).toBe(true);
    expect(result.usedModel).toBe(false);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it.each(["Who handles solid waste in Brunswick?", "Who handles a noisy neighbor complaint?"])("keeps civic results official for %s", async (q) => {
    const baseline = parseAskIntent(q, now);
    expect(baseline.kind).toBe("explore");
    mocks.resolve.mockResolvedValue({ intent: { ...baseline, kind: "civic", label: "Official local help" }, handled: true, usedDecision: true, applied: true });
    const result = await askFrederick(q, { municipality: "brunswick", contextLabel: "Brunswick", canShowDistance: false });
    expect(result.intent?.kind).toBe("civic");
    expect(result.sources.every((source) => source.category === "civic" && !source.href.startsWith("/places/"))).toBe(true);
    if (q.includes("solid waste")) {
      expect(result.sources.length).toBeGreaterThan(0);
    } else {
      expect(result.sources).toEqual([]);
      expect(result.actions).toContainEqual({ label: "County & city services", kind: "open", href: "/contacts" });
      expect(result.answer).toContain("couldn’t match");
    }
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("does not treat unrelated community activities as an on-stage performance", async () => {
    const q = "Who is on stage tonight?";
    const baseline = parseAskIntent(q, now);
    expect(baseline.kind).toBe("explore");
    mocks.resolve.mockResolvedValue({ intent: { ...baseline, kind: "event", label: "Current events" }, handled: true, usedDecision: true, applied: true });
    const row = (slug: string, title: string, category: string) => ({
      slug, title, category, description: title,
      starts_at: "2026-10-18T23:00:00Z", ends_at: "2026-10-19T01:00:00Z",
      venue_name: "Verified fixture hall", address: "1 Test Street", venue_slug: "fixture-hall",
      geom: { lng: -77.41, lat: 39.41 }, municipality: "frederick",
      source: "manual", is_verified: true, placement: "venue", geo_confidence: "venue_match",
      last_verified_at: "2026-10-18T17:00:00Z", is_free: true,
    });
    const music = row("fixture-concert", "Acoustic Concert", "music");
    const library = row("fixture-book-club", "Library Book Club", "community");
    mocks.assemble.mockResolvedValue({ unified: [library, music], publicEvents: [library, music], sourceHealth: { degraded: false, unavailable: [] } });
    const result = await askFrederick(q, { municipality: "frederick", contextLabel: "Frederick" });
    expect(result.sources.map((source) => source.href)).toEqual(["/events/fixture-concert"]);
    expect(result.answer).toContain("Acoustic Concert");
    expect(result.answer).not.toContain("Book Club");
  });

});
