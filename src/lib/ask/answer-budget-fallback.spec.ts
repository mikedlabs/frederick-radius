import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runRadiusAgent: vi.fn(),
  shouldUseRadiusAgent: vi.fn(),
  reserveAskModelCall: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/ask/intelligence", () => ({
  runRadiusAgent: mocks.runRadiusAgent,
  shouldUseRadiusAgent: mocks.shouldUseRadiusAgent,
}));
vi.mock("@/lib/ask/runtime-budget", () => ({
  askAgentRuntimeConfigured: () => false,
  askAiMaxOutputTokens: () => 400,
  askTextGenerationRuntimeConfigured: () => true,
  askTextProvider: () => "gateway",
  reserveAskModelCall: mocks.reserveAskModelCall,
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));

import { askFrederick, callAskModelWithBudget } from "./answer";

describe("Ask deterministic fallback when the shared AI budget is unavailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldUseRadiusAgent.mockReturnValue(false);
    mocks.reserveAskModelCall.mockResolvedValue(null);
    mocks.generateText.mockResolvedValue({
      text: "This model answer must never be reached.",
    });
  });

  it("keeps a grounded local answer without touching a provider", async () => {
    await expect(
      callAskModelWithBudget("A fully assembled, source-grounded prompt"),
    ).resolves.toBeNull();

    const result = await askFrederick(
      "Where can I get coffee?",
      {},
    );

    expect(mocks.reserveAskModelCall).toHaveBeenCalledOnce();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(result.usedModel).toBe(false);
    expect(result.answer).not.toContain("must never be reached");
    expect(result.answer?.length ?? 0).toBeGreaterThan(0);
  });
});
