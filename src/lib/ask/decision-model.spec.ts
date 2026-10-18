import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), fetch: vi.fn() }));
vi.mock("./runtime-budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runtime-budget")>()),
  reserveAskModelCall: mocks.reserve,
}));

import {
  ASK_DECISION_MODEL,
  ASK_DECISION_TIMEOUT_MS,
  askDecisionRuntimeConfigured,
  executeAskDecision,
  type AskDecisionRequest,
} from "./decision-model";

function request(): AskDecisionRequest {
  return {
    state: "  Find something fun for my kids  ",
    questions: {
      route: {
        type: "choice",
        instructions: "Choose which local discovery surface addresses this query.",
        criteria: {
          events: "The user wants a scheduled activity or event.",
          places: "The user wants a permanent local venue or place.",
          explore: "The request is ambiguous or asks for another kind of help.",
        },
      },
    },
  };
}

function responseBody() {
  return {
    model: ASK_DECISION_MODEL,
    answers: {
      route: {
        type: "choice",
        choice: "events",
        probabilities: { events: 0.9, places: 0.08, explore: 0.02 },
      },
    },
    usage: { inputTokens: 275, outputTokens: 20 },
    providerMetadata: { gateway: { routing: { finalProvider: "typesafe-ai" } } },
  };
}

function response(body: unknown = responseBody(), init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

const environmentKeys = [
  "ASK_JEV_ROUTING_ENABLED",
  "ASK_AI_RUNTIME_ENABLED",
  "ASK_AI_GENERATION_ENABLED",
  "ASK_AI_DAILY_CALL_LIMIT",
  "ASK_AI_PROVIDER",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
] as const;

describe("budget-gated Jev decision transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of environmentKeys) vi.stubEnv(key, "");
    vi.stubEnv("ASK_JEV_ROUTING_ENABLED", "1");
    vi.stubEnv("ASK_AI_RUNTIME_ENABLED", "1");
    vi.stubEnv("ASK_AI_PROVIDER", "gateway");
    vi.stubEnv("AI_GATEWAY_API_KEY", " gateway-test ");
    mocks.reserve.mockResolvedValue({ reserved: true, count: 1 });
    mocks.fetch.mockResolvedValue(response());
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["ASK_JEV_ROUTING_ENABLED", "0"],
    ["ASK_JEV_ROUTING_ENABLED", ""],
    ["ASK_AI_RUNTIME_ENABLED", "0"],
    ["ASK_AI_DAILY_CALL_LIMIT", "0"],
    ["ASK_AI_PROVIDER", "anthropic"],
    ["ASK_AI_PROVIDER", "openai"],
    ["ASK_AI_PROVIDER", "gatewy"],
    ["ASK_AI_PROVIDER", ""],
    ["AI_GATEWAY_API_KEY", "   "],
  ] as const)("does no provider or reservation work when %s is %j", async (key, value) => {
    vi.stubEnv(key, value);
    expect(askDecisionRuntimeConfigured()).toBe(false);
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: false, reason: "disabled",
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([null, { reserved: false, count: 250 }])(
    "makes no provider request without a confirmed shared reservation: %j",
    async (reservation) => {
      mocks.reserve.mockResolvedValueOnce(reservation);
      await expect(executeAskDecision(request())).resolves.toEqual({
        ok: false, attempted: false, reason: "budget-unavailable",
      });
      expect(mocks.reserve).toHaveBeenCalledOnce();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the reservation store throws", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("store unavailable"));
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: false, reason: "budget-unavailable",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reserves first and sends only the bounded query and finite routing rubric once", async () => {
    const order: string[] = [];
    mocks.reserve.mockImplementationOnce(async () => {
      order.push("reserved");
      return { reserved: true, count: 1 };
    });
    mocks.fetch.mockImplementationOnce(async () => {
      order.push("provider");
      return response();
    });
    expect(askDecisionRuntimeConfigured()).toBe(true);
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: true,
      attempted: true,
      model: ASK_DECISION_MODEL,
      choice: "events",
      probabilities: { events: 0.9, places: 0.08, explore: 0.02 },
      usage: { inputTokens: 275, outputTokens: 20 },
    });
    expect(order).toEqual(["reserved", "provider"]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
    expect(options).toMatchObject({
      method: "POST", cache: "no-store", redirect: "error",
      headers: { Authorization: "Bearer gateway-test", "Content-Type": "application/json" },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      model: ASK_DECISION_MODEL,
      state: "Find something fun for my kids",
      questions: request().questions,
      providerOptions: { gateway: { zeroDataRetention: true, only: ["typesafe-ai"] } },
    });
  });

  it("keeps the validated input fixed while the reservation is pending", async () => {
    const input = request();
    mocks.reserve.mockImplementationOnce(async () => {
      input.state = "x".repeat(301);
      input.questions.route.instructions = "Changed instructions";
      input.questions.route.criteria = { other: "Other", unexpected: "Unexpected" };
      return { reserved: true, count: 1 };
    });
    expect((await executeAskDecision(input)).ok).toBe(true);
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.state).toBe("Find something fun for my kids");
    expect(sent.questions).toEqual(request().questions);
  });

  it("uses the existing OIDC credential only when a Gateway API key is absent", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "   ");
    vi.stubEnv("VERCEL_OIDC_TOKEN", " injected-oidc-test ");
    expect(askDecisionRuntimeConfigured()).toBe(true);
    expect((await executeAskDecision(request())).ok).toBe(true);
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer injected-oidc-test");
  });

  it("prefers the explicit Gateway API key over OIDC", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "injected-oidc-test");
    await executeAskDecision(request());
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer gateway-test");
  });

  it.each([
    ["empty state", () => ({ ...request(), state: "   " })],
    ["oversized state", () => ({ ...request(), state: "x".repeat(301) })],
    ["unrequested context", () => ({ ...request(), scope: "frederick" })],
    ["another question", () => ({ ...request(), questions: { ...request().questions, secret: {} } })],
    ["wrong type", () => ({ ...request(), questions: { route: { ...request().questions.route, type: "boolean" } } })],
    ["oversized instruction", () => ({ ...request(), questions: { route: { ...request().questions.route, instructions: "x".repeat(1201) } } })],
    ["one choice", () => ({ ...request(), questions: { route: { ...request().questions.route, criteria: { events: "Only choice" } } } })],
    ["oversized criteria", () => ({ ...request(), questions: { route: { ...request().questions.route, criteria: { events: "x".repeat(301), places: "Places" } } } })],
    ["bad choice name", () => ({ ...request(), questions: { route: { ...request().questions.route, criteria: { "bad/key": "Events", places: "Places" } } } })],
  ])("rejects %s before reservation or provider work", async (_, invalid) => {
    await expect(executeAskDecision(invalid() as AskDecisionRequest)).resolves.toEqual({
      ok: false, attempted: false, reason: "invalid-input",
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a different model", (body: ReturnType<typeof responseBody>) => { body.model = "typesafe-ai/jev" as typeof ASK_DECISION_MODEL; }],
    ["undeclared choice", (body: ReturnType<typeof responseBody>) => { body.answers.route.choice = "billing"; }],
    ["wrong declared winner", (body: ReturnType<typeof responseBody>) => { body.answers.route.choice = "places"; }],
    ["wrong question type", (body: ReturnType<typeof responseBody>) => { body.answers.route.type = "boolean"; }],
    ["missing probability", (body: ReturnType<typeof responseBody>) => { delete (body.answers.route.probabilities as Record<string, number>).explore; }],
    ["additional probability", (body: ReturnType<typeof responseBody>) => { (body.answers.route.probabilities as Record<string, number>).billing = 0; }],
    ["negative probability", (body: ReturnType<typeof responseBody>) => { body.answers.route.probabilities.explore = -0.02; }],
    ["probability above one", (body: ReturnType<typeof responseBody>) => { body.answers.route.probabilities.events = 1.1; }],
    ["nonfinite probability", (body: ReturnType<typeof responseBody>) => { body.answers.route.probabilities.events = Number.NaN; }],
    ["probabilities not normalized", (body: ReturnType<typeof responseBody>) => { body.answers.route.probabilities.events = 0.6; }],
    ["negative usage", (body: ReturnType<typeof responseBody>) => { body.usage.inputTokens = -1; }],
    ["fractional usage", (body: ReturnType<typeof responseBody>) => { body.usage.outputTokens = 0.5; }],
    ["unsafe usage", (body: ReturnType<typeof responseBody>) => { body.usage.inputTokens = Number.MAX_SAFE_INTEGER + 1; }],
  ])("rejects a provider response with %s without another paid call", async (_, change) => {
    const body = responseBody();
    change(body);
    mocks.fetch.mockResolvedValueOnce(response(body));
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: true, reason: "invalid-response",
    });
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    new Response("not-json"),
    response({ ...responseBody(), answers: { ...responseBody().answers, extra: {} } }),
    response({ ...responseBody(), usage: null }),
    new Response(" ".repeat(16_385)),
    response(responseBody(), { headers: { "Content-Length": "16385" } }),
  ])("rejects malformed or oversized response data", async (providerResponse) => {
    mocks.fetch.mockResolvedValueOnce(providerResponse);
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: true, reason: "invalid-response",
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([301, 401, 429, 500, 503])("does not retry or follow an HTTP %i failure", async (status) => {
    mocks.fetch.mockResolvedValueOnce(response({}, { status }));
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: true, reason: "request-failed",
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("does not throw or retry a failed fetch", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(executeAskDecision(request())).resolves.toEqual({
      ok: false, attempted: true, reason: "request-failed",
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("aborts and returns at the deadline even if the transport ignores cancellation", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockReturnValueOnce(new Promise(() => {}));
    const pending = executeAskDecision(request());
    await vi.advanceTimersByTimeAsync(ASK_DECISION_TIMEOUT_MS - 1);
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: false, attempted: true, reason: "timeout" });
    expect(signal.aborted).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("keeps response body parsing inside the same deadline", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      text: () => new Promise(() => {}),
    });
    const pending = executeAskDecision(request());
    await vi.advanceTimersByTimeAsync(ASK_DECISION_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, attempted: true, reason: "timeout" });
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("keeps the decision path available when prose and agents are explicitly disabled", async () => {
    vi.stubEnv("ASK_AI_GENERATION_ENABLED", "0");
    expect(askDecisionRuntimeConfigured()).toBe(true);
    expect((await executeAskDecision(request())).ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

});
