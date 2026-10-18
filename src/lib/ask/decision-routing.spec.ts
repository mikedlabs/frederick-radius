import "next/dist/server/node-environment-baseline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), execute: vi.fn() }));
vi.mock("./decision-model", () => ({
  ASK_DECISION_MODEL: "typesafe-ai/jev-1.14.0",
  askDecisionRuntimeConfigured: mocks.configured,
  executeAskDecision: mocks.execute,
}));

import { parseAskIntent } from "./intent";
import { resolveAskDecisionRoute } from "./decision-routing";

const now = new Date("2026-10-18T18:00:00Z");
const query = "What can I attend tomorrow?";
const entries = new Map<string, { value: unknown; isStale: false }>();
function decision(choice = "event", probabilities = { place: 0.02, event: 0.95, civic: 0.01, explore: 0.02 }) {
  return {
    ok: true, attempted: true, model: "typesafe-ai/jev-1.14.0",
    choice, probabilities, usage: { inputTokens: 400, outputTokens: 20 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entries.clear();
  mocks.configured.mockReturnValue(true);
  mocks.execute.mockResolvedValue(decision());
  vi.stubGlobal("__incrementalCache", {
    isOnDemandRevalidate: false,
    generateSimpleCacheKey: async (input: string) => input,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: unknown) => entries.set(key, { value, isStale: false }),
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("Jev routing with the actual Next cache", () => {
  it("changes only the ambiguous retrieval kind and label", async () => {
    const baseline = parseAskIntent(query, now);
    expect(baseline.kind).toBe("explore");
    const result = await resolveAskDecisionRoute(query, now);
    expect(result).toMatchObject({ handled: true, usedDecision: true, applied: true });
    expect(result.intent).toEqual({ ...baseline, kind: "event", label: "Current events" });
    const request = mocks.execute.mock.calls[0][0];
    expect(Object.keys(request)).toEqual(["state", "questions"]);
    expect(request.state).toBe(query);
    expect(request).not.toHaveProperty("origin");
    expect(request).not.toHaveProperty("taste");
  });

  it("reuses a successful model decision but reparses relative dates at request time", async () => {
    const first = await resolveAskDecisionRoute(query, now);
    const nextDay = new Date("2026-10-19T18:00:00Z");
    const second = await resolveAskDecisionRoute(query, nextDay);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(entries.size).toBe(1);
    expect(first.intent.requestedDate).not.toBe(second.intent.requestedDate);
    expect(second.intent).toEqual({ ...parseAskIntent(query, nextDay), kind: "event", label: "Current events" });
  });

  it("checks the kill switch before returning a previously cached decision", async () => {
    await resolveAskDecisionRoute(query, now);
    mocks.configured.mockReturnValue(false);
    expect(await resolveAskDecisionRoute(query, now)).toEqual({
      intent: parseAskIntent(query, now), handled: false, usedDecision: false, applied: false,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it.each([
    "Where can I get coffee near me?",
    "Plan a walkable afternoon under $40",
    "Which events are happening tonight?",
    "How do I report a pothole?",
    "My dog ate chocolate and needs help",
    "I cannot breathe and need help",
    "A nice dinner before my 7:30 show",
    "Surprise me with somewhere local",
    "Carroll Creek",
    "",
    "a ".repeat(151),
  ])("keeps the existing free/safety path for %s", async (q) => {
    const result = await resolveAskDecisionRoute(q, now);
    expect(result.handled).toBe(false);
    expect(result.intent).toEqual(parseAskIntent(q.trim(), now));
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    decision("event", { place: 0.08, event: 0.84, civic: 0.03, explore: 0.05 }),
    decision("explore", { place: 0.02, event: 0.01, civic: 0.02, explore: 0.95 }),
  ])("retains the original kind and caches a valid uncertain result", async (response) => {
    mocks.execute.mockResolvedValue(response);
    const result = await resolveAskDecisionRoute(query, now);
    expect(result).toEqual({ intent: parseAskIntent(query, now), handled: true, usedDecision: true, applied: false });
    await resolveAskDecisionRoute(query, now);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it.each(["timeout", "budget-unavailable", "invalid-response"])("does not cache %s or permit a second paid path", async (reason) => {
    mocks.execute.mockResolvedValue({ ok: false, attempted: reason !== "budget-unavailable", reason });
    const result = await resolveAskDecisionRoute(query, now);
    expect(result).toEqual({ intent: parseAskIntent(query, now), handled: true, usedDecision: false, applied: false });
    expect(entries.size).toBe(0);
    mocks.execute.mockResolvedValue(decision());
    expect((await resolveAskDecisionRoute(query, now)).applied).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});
