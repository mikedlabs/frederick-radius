import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const answerSource = readFileSync("src/lib/ask/answer.ts", "utf8");
const agentSource = readFileSync("src/lib/ask/intelligence.ts", "utf8");
const routeSource = readFileSync("src/app/api/ask/route.ts", "utf8");

describe("public Ask paid-provider contract", () => {
  it("reserves before the one selected single-shot provider", () => {
    const reserveAt = answerSource.indexOf("await reserveAskModelCall()");
    const providerAt = answerSource.indexOf("const provider = askTextProvider()");
    const gatewayAt = answerSource.indexOf('if (provider === "gateway")');
    const anthropicAt = answerSource.indexOf('if (provider === "anthropic")');

    expect(reserveAt).toBeGreaterThan(-1);
    expect(providerAt).toBeGreaterThan(reserveAt);
    expect(gatewayAt).toBeGreaterThan(providerAt);
    expect(anthropicAt).toBeGreaterThan(gatewayAt);
    expect(answerSource).not.toContain("fall through to a direct provider");
    expect(answerSource).not.toContain("fall through to OpenAI");
  });

  it("caps output and disables hidden SDK retries on every generation path", () => {
    expect(answerSource).toContain("const maxOutputTokens = askAiMaxOutputTokens()");
    expect(answerSource).toContain("max_tokens: maxOutputTokens");
    expect(answerSource.match(/maxOutputTokens,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(answerSource.match(/maxRetries: 0/g)?.length).toBe(2);

    expect(agentSource).toContain("maxOutputTokens: askAiMaxOutputTokens()");
    expect(agentSource).toContain("maxRetries: 0");
  });

  it("reserves every tool-agent step and never meters only after success", () => {
    const prepareAt = agentSource.indexOf("prepareStep: async");
    const reserveAt = agentSource.indexOf(
      "await reserveAskModelCall()",
      prepareAt,
    );
    expect(prepareAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeGreaterThan(prepareAt);
    expect(agentSource).toContain('throw new Error("ask:budget-unavailable")');
    expect(routeSource).not.toContain('meterUsage("anthropic_ask")');
  });

  it("keeps the deterministic answer at the model failure boundary", () => {
    expect(answerSource).toContain(
      "const renderedAnswer = answer ?? deterministicAnswer",
    );
  });
});
