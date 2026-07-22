import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runRadiusAgent: vi.fn(),
  shouldUseRadiusAgent: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/ask/intelligence", () => ({
  runRadiusAgent: mocks.runRadiusAgent,
  shouldUseRadiusAgent: mocks.shouldUseRadiusAgent,
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));

import { askFrederick } from "./answer";

describe("Ask Radius agent timeout fallback", () => {
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    mocks.shouldUseRadiusAgent.mockReturnValue(true);
    mocks.runRadiusAgent.mockResolvedValue(null);
    mocks.generateText.mockResolvedValue({ text: "This legacy model should not run." });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalGatewayKey == null) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
  });

  it("returns grounded deterministic results instead of starting a second model", async () => {
    const result = await askFrederick("Tell me something interesting in Frederick County");

    expect(mocks.runRadiusAgent).toHaveBeenCalledOnce();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(result.usedModel).toBe(false);
  });

  it("does not fake a two-option plan when live timing cannot be verified", async () => {
    const result = await askFrederick(
      "Compare two date-night options near downtown for tomorrow, including dinner timing, parking, and live music",
      {
        origin: { lng: -77.4109, lat: 39.4137 },
        municipality: "frederick",
        contextLabel: "Downtown Frederick",
      },
    );

    expect(mocks.runRadiusAgent).toHaveBeenCalledOnce();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "empty",
      usedModel: false,
      plan: null,
    });
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("can’t reliably compare two");
    expect(result.answer).not.toMatch(/\d+ strong matches/i);
  });

  it("returns downtown dinner choices when a timed show is only an appointment anchor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T05:00:00.000Z"));
    const result = await askFrederick(
      "I need a quiet dinner downtown before a 7:30 show tonight",
      {
        origin: { lng: -77.4109, lat: 39.4137 },
        municipality: "frederick",
        contextLabel: "Downtown Frederick",
      },
    );
    expect(mocks.runRadiusAgent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "matches",
      usedModel: false,
      intent: { kind: "place", label: "Dinner", timeNeed: "tonight" },
    });
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.category === "restaurant")).toBe(true);
    expect(result.sources.map((source) => source.name)).not.toContain("K Town Takeout");
    expect(result.sources.map((source) => source.name)).not.toContain("The Original Popcorn House");
    expect(result.sources.every((source) => /^At 6:00 PM · (?:Open|Closing soon)\b/.test(source.status ?? ""))).toBe(true);
    expect(result.answer).toContain("scheduled to be open around 6:00 PM");
    expect(result.answer).toContain("90 minutes before your 7:30 PM show");
    expect(result.answer).toContain("does not have verified noise-level data");
    expect(result.answer).not.toMatch(/(?:is|are|feels?|should be) quiet/i);
    expect(result.answer).not.toMatch(/live[- ]music|music calendar|can.t verify/i);
  });

  it("evaluates a direct dinner time and removes obvious counter-service results", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T21:00:00.000Z"));
    const result = await askFrederick(
      "I want a quiet dinner near downtown Frederick at 7:30 tonight",
      {
        origin: { lng: -77.4109, lat: 39.4137 },
        municipality: "frederick",
        contextLabel: "Downtown Frederick",
      },
    );

    expect(result.status).toBe("matches");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.map((source) => source.name)).not.toContain("K Town Takeout");
    expect(result.sources.map((source) => source.name)).not.toContain("The Original Popcorn House");
    expect(result.sources.every((source) => /^At 7:30 PM · (?:Open|Closing soon)\b/.test(source.status ?? ""))).toBe(true);
    expect(result.answer).toContain("scheduled to be open at 7:30 PM");
  });
});
