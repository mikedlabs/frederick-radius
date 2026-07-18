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
});
