import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import {
  askAgentRuntimeConfigured,
  askAiDailyCallLimit,
  askAiEmbeddingDailyLimit,
  askAiMaxOutputTokens,
  askRuntimeEmbeddingsConfigured,
  askTextGenerationRuntimeConfigured,
  askTextProvider,
  askTextProviderCredentialConfigured,
  reserveAskEmbeddingCall,
  reserveAskModelCall,
  DEFAULT_ASK_AI_DAILY_CALL_LIMIT,
  DEFAULT_ASK_AI_EMBEDDING_DAILY_LIMIT,
  DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS,
  MAX_ASK_AI_DAILY_CALL_LIMIT,
  MAX_ASK_AI_EMBEDDING_DAILY_LIMIT,
  MAX_ASK_AI_MAX_OUTPUT_TOKENS,
} from "./runtime-budget";

const ENV_KEYS = [
  "ASK_AI_RUNTIME_ENABLED",
  "ASK_AI_DAILY_CALL_LIMIT",
  "ASK_AI_RUNTIME_EMBEDDINGS_ENABLED",
  "ASK_AI_EMBEDDING_DAILY_LIMIT",
  "ASK_AI_MAX_OUTPUT_TOKENS",
  "ASK_AI_PROVIDER",
  "ASK_RADIUS_AGENT",
  "RADIUS_HYBRID_SEARCH",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;

describe("public Ask runtime budgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("keeps every configurable allowance below a code-owned maximum", () => {
    expect(askAiDailyCallLimit()).toBe(DEFAULT_ASK_AI_DAILY_CALL_LIMIT);
    expect(askAiDailyCallLimit("not-a-number")).toBe(
      DEFAULT_ASK_AI_DAILY_CALL_LIMIT,
    );
    expect(askAiDailyCallLimit("   ")).toBe(
      DEFAULT_ASK_AI_DAILY_CALL_LIMIT,
    );
    expect(askAiDailyCallLimit(99_999)).toBe(MAX_ASK_AI_DAILY_CALL_LIMIT);
    expect(askAiDailyCallLimit(0)).toBe(0);

    expect(askAiEmbeddingDailyLimit()).toBe(
      DEFAULT_ASK_AI_EMBEDDING_DAILY_LIMIT,
    );
    expect(askAiEmbeddingDailyLimit(99_999)).toBe(
      MAX_ASK_AI_EMBEDDING_DAILY_LIMIT,
    );
    expect(askAiEmbeddingDailyLimit(0)).toBe(0);

    expect(askAiMaxOutputTokens()).toBe(DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS);
    expect(askAiMaxOutputTokens(99_999)).toBe(
      MAX_ASK_AI_MAX_OUTPUT_TOKENS,
    );
    expect(askAiMaxOutputTokens(0)).toBe(
      DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS,
    );
  });

  it("requires an explicit global switch and only the selected text provider", () => {
    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    process.env.ANTHROPIC_API_KEY = "anthropic-test";

    // Gateway is the safe default. A direct Anthropic key is not an implicit
    // fallback and cannot silently change which bill receives the request.
    expect(askTextProvider()).toBe("gateway");
    expect(askTextGenerationRuntimeConfigured()).toBe(false);

    process.env.ASK_AI_PROVIDER = "anthropic";
    expect(askTextProvider()).toBe("anthropic");
    expect(askTextGenerationRuntimeConfigured()).toBe(true);

    process.env.ASK_AI_RUNTIME_ENABLED = "0";
    expect(askTextGenerationRuntimeConfigured()).toBe(false);
  });

  it("fails closed for an explicitly unsupported text provider", () => {
    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    process.env.VERCEL_OIDC_TOKEN = "injected-vercel-credential";

    for (const invalidProvider of ["antrhopic", "", "   ", "other"]) {
      process.env.ASK_AI_PROVIDER = invalidProvider;
      expect(askTextProvider()).toBeNull();
      expect(askTextProviderCredentialConfigured()).toBe(false);
      expect(askTextGenerationRuntimeConfigured()).toBe(false);
      expect(askAgentRuntimeConfigured()).toBe(false);
    }

    delete process.env.ASK_AI_PROVIDER;
    expect(askTextProvider()).toBe("gateway");
    expect(askTextGenerationRuntimeConfigured()).toBe(true);
  });

  it("keeps the Gateway agent behind the same switch and cap", () => {
    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    process.env.AI_GATEWAY_API_KEY = "gateway-test";
    expect(askAgentRuntimeConfigured()).toBe(false);

    process.env.ASK_RADIUS_AGENT = "1";
    expect(askAgentRuntimeConfigured()).toBe(true);

    process.env.ASK_AI_DAILY_CALL_LIMIT = "0";
    expect(askAgentRuntimeConfigured()).toBe(false);

    process.env.ASK_AI_DAILY_CALL_LIMIT = "10";
    process.env.ASK_RADIUS_AGENT = "0";
    expect(askAgentRuntimeConfigured()).toBe(false);
  });

  it("keeps runtime embeddings explicitly opt-in and direct-OpenAI only", () => {
    process.env.OPENAI_API_KEY = "openai-test";
    expect(askRuntimeEmbeddingsConfigured()).toBe(false);

    process.env.ASK_AI_RUNTIME_EMBEDDINGS_ENABLED = "1";
    expect(askRuntimeEmbeddingsConfigured()).toBe(true);

    process.env.ASK_AI_EMBEDDING_DAILY_LIMIT = "0";
    expect(askRuntimeEmbeddingsConfigured()).toBe(false);

    process.env.ASK_AI_EMBEDDING_DAILY_LIMIT = "10";
    process.env.RADIUS_HYBRID_SEARCH = "0";
    expect(askRuntimeEmbeddingsConfigured()).toBe(false);
  });

  it("reserves one shared Eastern-day model-call unit before provider work", async () => {
    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    process.env.ASK_AI_DAILY_CALL_LIMIT = "17";

    await expect(reserveAskModelCall()).resolves.toEqual({
      reserved: true,
      count: 1,
    });
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "ask_model_call",
      17,
    );
  });

  it("fails closed when the shared counter cannot confirm a reservation", async () => {
    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    mocks.reserveDailyUsage.mockResolvedValueOnce(null);

    await expect(reserveAskModelCall()).resolves.toBeNull();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "ask_model_call",
      DEFAULT_ASK_AI_DAILY_CALL_LIMIT,
    );
  });

  it("does not touch the counter when generation is switched off", async () => {
    await expect(reserveAskModelCall()).resolves.toEqual({
      reserved: false,
      count: 0,
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();

    process.env.ASK_AI_RUNTIME_ENABLED = "1";
    process.env.ASK_AI_DAILY_CALL_LIMIT = "0";
    await expect(reserveAskModelCall()).resolves.toEqual({
      reserved: false,
      count: 0,
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("reserves runtime embedding attempts and fails locally when disabled", async () => {
    await expect(reserveAskEmbeddingCall()).resolves.toEqual({
      reserved: false,
      count: 0,
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();

    process.env.ASK_AI_RUNTIME_EMBEDDINGS_ENABLED = "1";
    process.env.ASK_AI_EMBEDDING_DAILY_LIMIT = "9";
    process.env.OPENAI_API_KEY = "openai-test";
    await expect(reserveAskEmbeddingCall()).resolves.toEqual({
      reserved: true,
      count: 1,
    });
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("ask_embedding", 9);
  });
});
