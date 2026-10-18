import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isReviewedAskTextModelSelection,
  selectAskTextModel,
} from "./model-selection";

afterEach(() => vi.unstubAllEnvs());

describe("reviewed Ask text model selection", () => {
  it("preserves the Gateway default when the provider setting is omitted", () => {
    vi.stubEnv("ASK_AI_PROVIDER", undefined);
    expect(selectAskTextModel()).toEqual({
      provider: "gateway", model: "anthropic/claude-haiku-4.5",
    });
  });

  it.each([
    ["gateway", "anthropic/claude-haiku-4.5"],
    ["anthropic", "claude-haiku-4-5-20251001"],
    ["openai", "gpt-4o-mini"],
  ] as const)("keeps the existing %s model", (provider, model) => {
    vi.stubEnv("ASK_AI_PROVIDER", provider);
    expect(selectAskTextModel()).toEqual({ provider, model });
    expect(isReviewedAskTextModelSelection({ provider, model })).toBe(true);
  });

  it.each(["", "   ", "antrhopic", "other"])("fails closed for configured provider %j", (provider) => {
    vi.stubEnv("ASK_AI_PROVIDER", provider);
    expect(selectAskTextModel()).toBeNull();
  });

  it.each([
    null,
    undefined,
    "gateway",
    {},
    { provider: "gateway", model: "premium/unreviewed" },
    { provider: "openai", model: "anthropic/claude-haiku-4.5" },
    { provider: "anthropic", model: "gpt-4o-mini" },
    { provider: "toString", model: "gpt-4o-mini" },
    { provider: "__proto__", model: "gpt-4o-mini" },
  ])("rejects an unreviewed serialized selection %j", (selection) => {
    expect(isReviewedAskTextModelSelection(selection)).toBe(false);
  });

  it("does not select another model from an environment model override", () => {
    vi.stubEnv("ASK_AI_PROVIDER", "gateway");
    vi.stubEnv("ASK_AI_MODEL", "premium/unreviewed");
    expect(selectAskTextModel()).toEqual({
      provider: "gateway", model: "anthropic/claude-haiku-4.5",
    });
  });
});
