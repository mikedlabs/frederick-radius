// Install the same AsyncLocalStorage baseline Next uses before importing its
// real cache wrapper. The storage below replaces only the persistence backend.
import "next/dist/server/node-environment-baseline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskTextModelSelection } from "./model-selection";

const mocks = vi.hoisted(() => ({
  reserveDailyUsage: vi.fn(),
  generateText: vi.fn(),
  openai: vi.fn((model: string) => ({ testOpenAiModel: model })),
  fetch: vi.fn(),
  // This simulates two reviewed application versions, not an environment
  // override or a real model. Every generation function remains mocked.
  reviewedGatewayVersion: null as null | string,
}));

vi.mock("@/lib/usage-meter", () => ({ reserveDailyUsage: mocks.reserveDailyUsage }));
vi.mock("@/lib/ask/intelligence", () => ({
  runRadiusAgent: vi.fn(), shouldUseRadiusAgent: () => false,
}));
vi.mock("ai", () => ({ generateText: mocks.generateText, embed: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ openai: mocks.openai }));
vi.mock("./model-selection", async (importOriginal) => {
  const original = await importOriginal<typeof import("./model-selection")>();
  return {
    ...original,
    selectAskTextModel: () => mocks.reviewedGatewayVersion
      ? { provider: "gateway", model: mocks.reviewedGatewayVersion }
      : original.selectAskTextModel(),
    isReviewedAskTextModelSelection: (selection: unknown) => {
      const candidate = selection as { provider?: unknown; model?: unknown } | null;
      if (mocks.reviewedGatewayVersion && candidate?.provider === "gateway") {
        return candidate.model === mocks.reviewedGatewayVersion;
      }
      return original.isReviewedAskTextModelSelection(selection);
    },
  };
});

import {
  callAskModelWithBudget,
  callCachedAskModelWithBudget,
} from "./answer";

const PROMPT = "A visitor wants a source-grounded Frederick recommendation.";
const entries = new Map<string, { value: unknown; isStale: false }>();

beforeEach(() => {
  vi.clearAllMocks();
  entries.clear();
  mocks.reviewedGatewayVersion = null;
  vi.stubEnv("ASK_AI_RUNTIME_ENABLED", "1");
  vi.stubEnv("ASK_AI_DAILY_CALL_LIMIT", "17");
  vi.stubEnv("ASK_AI_PROVIDER", "gateway");
  vi.stubEnv("ASK_AI_MAX_OUTPUT_TOKENS", "400");
  vi.stubEnv("AI_GATEWAY_API_KEY", "offline-test-gateway");
  vi.stubEnv("ANTHROPIC_API_KEY", "offline-test-anthropic");
  vi.stubEnv("OPENAI_API_KEY", "offline-test-openai");
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("__incrementalCache", {
    isOnDemandRevalidate: false,
    generateSimpleCacheKey: async (input: string) => input,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      entries.set(key, { value, isStale: false });
    },
  });
  mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
  mocks.generateText.mockImplementation(async ({ model }) => ({
    text: typeof model === "string"
      ? `Gateway answer for ${model}.`
      : "Direct OpenAI answer for its reviewed model.",
  }));
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
    content: [{ text: "Direct Anthropic answer for its reviewed model." }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mocks.reviewedGatewayVersion = null;
});

describe("actual Next Ask cache identity", () => {
  it("reuses only matching provider/model prose and reserves only misses", async () => {
    const gateway = await callCachedAskModelWithBudget(PROMPT);
    expect(await callCachedAskModelWithBudget(PROMPT)).toBe(gateway);
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();

    vi.stubEnv("ASK_AI_PROVIDER", "openai");
    const openai = await callCachedAskModelWithBudget(PROMPT);
    expect(openai).toBe("Direct OpenAI answer for its reviewed model.");
    expect(openai).not.toBe(gateway);
    expect(mocks.openai).toHaveBeenCalledWith("gpt-4o-mini");

    vi.stubEnv("ASK_AI_PROVIDER", "anthropic");
    expect(await callCachedAskModelWithBudget(PROMPT))
      .toBe("Direct Anthropic answer for its reviewed model.");
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).model)
      .toBe("claude-haiku-4-5-20251001");

    vi.stubEnv("ASK_AI_PROVIDER", "gateway");
    expect(await callCachedAskModelWithBudget(PROMPT)).toBe(gateway);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(3);
    expect(entries.size).toBe(3);
  });

  it("separates two reviewed versions of one provider without a prompt or TTL change", async () => {
    mocks.reviewedGatewayVersion = "offline-fixture/reviewed-first";
    const first = await callCachedAskModelWithBudget(PROMPT);
    mocks.reviewedGatewayVersion = "offline-fixture/reviewed-second";
    const second = await callCachedAskModelWithBudget(PROMPT);
    expect(second).not.toBe(first);
    expect(second).toContain("reviewed-second");
    mocks.reviewedGatewayVersion = "offline-fixture/reviewed-first";
    expect(await callCachedAskModelWithBudget(PROMPT)).toBe(first);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(2);
    expect(entries.size).toBe(2);
  });

  it("still separates changed Frederick evidence for the same model", async () => {
    await callCachedAskModelWithBudget(PROMPT);
    await callCachedAskModelWithBudget(`${PROMPT} The source now reports closed.`);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(entries.size).toBe(2);
  });

  it.each([null, { reserved: false, count: 17 }])("does not cache an unconfirmed reservation %j", async (reservation) => {
    mocks.reserveDailyUsage.mockResolvedValue(reservation);
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(2);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    expect(await callCachedAskModelWithBudget(PROMPT)).toContain("Gateway answer");
    expect(entries.size).toBe(1);
  });

  it("does not cache a failed provider or make a second-provider attempt", async () => {
    mocks.generateText.mockRejectedValue(new Error("Declared offline provider failure"));
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
    mocks.generateText.mockResolvedValue({ text: "Recovered reviewed answer." });
    expect(await callCachedAskModelWithBudget(PROMPT)).toBe("Recovered reviewed answer.");
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(3);
    expect(entries.size).toBe(1);
  });

  it("does not cache an empty provider answer", async () => {
    mocks.generateText.mockResolvedValue({ text: "" });
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(entries.size).toBe(0);
  });

  it.each(["ASK_AI_RUNTIME_ENABLED", "ASK_AI_GENERATION_ENABLED"])("honors %s even after successful prose was cached", async (setting) => {
    await callCachedAskModelWithBudget(PROMPT);
    vi.stubEnv(setting, "0");
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it("rejects invalid configured providers before cache or reservation work", async () => {
    vi.stubEnv("ASK_AI_PROVIDER", "antrhopic");
    expect(await callCachedAskModelWithBudget(PROMPT)).toBeNull();
    expect(entries.size).toBe(0);
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { model: "premium/unreviewed" },
    { provider: "openai", model: "gpt-4o-mini" },
  ])("preserves the reviewed selection while reservation mutates %j", async (mutation) => {
    const selection: AskTextModelSelection = {
      provider: "gateway", model: "anthropic/claude-haiku-4.5",
    };
    mocks.reserveDailyUsage.mockImplementationOnce(async () => {
      Object.assign(selection, mutation);
      return { reserved: true, count: 1 };
    });
    expect(await callAskModelWithBudget(PROMPT, selection))
      .toBe("Gateway answer for anthropic/claude-haiku-4.5.");
    expect(mocks.generateText).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      model: "anthropic/claude-haiku-4.5",
    }));
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { provider: "gateway", model: "premium/unreviewed" },
    { provider: "openai", model: "gpt-4o-mini" },
  ])("rejects an unreviewed or no-longer-selected identity %j before reserving", async (selection) => {
    expect(await callAskModelWithBudget(PROMPT, selection as AskTextModelSelection))
      .toBeNull();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
  });
});
