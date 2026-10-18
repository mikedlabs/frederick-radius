import "server-only";
import {
  askAiDailyCallLimit,
  askAiRuntimeRequested,
  askTextProvider,
  reserveAskModelCall,
} from "./runtime-budget";

/** A reviewed decision SKU, separate from Ask's text-generation models. */
export const ASK_DECISION_MODEL = "typesafe-ai/jev-1.14.0" as const;
export const ASK_DECISION_TIMEOUT_MS = 1_200;
const DECISION_ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
const MAX_STATE_LENGTH = 300;
const MAX_RESPONSE_LENGTH = 16_384;
const PROBABILITY_SUM_TOLERANCE = 0.01;

export type AskDecisionQuestions = {
  route: {
    type: "choice";
    instructions: string;
    criteria: Readonly<Record<string, string>>;
  };
};

export type AskDecisionRequest = {
  /** Only the current query. Callers must exclude location/profile context. */
  state: string;
  questions: AskDecisionQuestions;
};

export type AskDecisionResult =
  | {
      ok: true;
      attempted: true;
      model: typeof ASK_DECISION_MODEL;
      choice: string;
      probabilities: Readonly<Record<string, number>>;
      usage: { inputTokens: number; outputTokens: number };
    }
  | {
      ok: false;
      attempted: boolean;
      reason:
        | "disabled"
        | "invalid-input"
        | "budget-unavailable"
        | "request-failed"
        | "invalid-response"
        | "timeout";
    };

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validRequest(request: unknown): request is AskDecisionRequest {
  if (!record(request) || !exactKeys(request, ["state", "questions"])) return false;
  if (
    typeof request.state !== "string" ||
    request.state.trim().length === 0 ||
    request.state.length > MAX_STATE_LENGTH ||
    !record(request.questions) ||
    !exactKeys(request.questions, ["route"])
  ) return false;
  const route = request.questions.route;
  if (
    !record(route) ||
    !exactKeys(route, ["type", "instructions", "criteria"]) ||
    route.type !== "choice" ||
    typeof route.instructions !== "string" ||
    route.instructions.trim().length === 0 ||
    route.instructions.length > 1_200 ||
    !record(route.criteria)
  ) return false;
  const criteria = Object.entries(route.criteria);
  return (
    criteria.length >= 2 &&
    criteria.length <= 16 &&
    criteria.every(([key, description]) =>
      /^[a-z][a-z0-9_]{0,39}$/.test(key) &&
      typeof description === "string" &&
      description.trim().length > 0 &&
      description.length <= 300,
    )
  );
}

function parseResult(
  value: unknown,
  choices: readonly string[],
): Extract<AskDecisionResult, { ok: true }> | null {
  if (
    !record(value) ||
    value.model !== ASK_DECISION_MODEL ||
    !record(value.answers) ||
    !exactKeys(value.answers, ["route"]) ||
    !record(value.answers.route) ||
    !record(value.usage)
  ) return null;
  const answer = value.answers.route;
  if (
    !exactKeys(answer, ["type", "choice", "probabilities"]) ||
    answer.type !== "choice" ||
    typeof answer.choice !== "string" ||
    !choices.includes(answer.choice) ||
    !record(answer.probabilities) ||
    !exactKeys(answer.probabilities, choices)
  ) return null;
  const probabilities: Record<string, number> = {};
  let sum = 0;
  for (const choice of choices) {
    const probability = answer.probabilities[choice];
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 || probability > 1
    ) return null;
    probabilities[choice] = probability;
    sum += probability;
  }
  const winningProbability = probabilities[answer.choice];
  if (
    Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE ||
    choices.some((choice) => probabilities[choice] > winningProbability + 1e-9)
  ) return null;
  const { inputTokens, outputTokens } = value.usage;
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    (inputTokens as number) < 0 || (outputTokens as number) < 0
  ) return null;
  return {
    ok: true,
    attempted: true,
    model: ASK_DECISION_MODEL,
    choice: answer.choice,
    probabilities,
    usage: { inputTokens: inputTokens as number, outputTokens: outputTokens as number },
  };
}

function gatewayCredential(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
}

/** Check before reading a cached decision, not only before network work. */
export function askDecisionRuntimeConfigured(): boolean {
  return (
    process.env.ASK_JEV_ROUTING_ENABLED === "1" &&
    askAiRuntimeRequested() &&
    askAiDailyCallLimit() > 0 &&
    askTextProvider() === "gateway" &&
    Boolean(gatewayCredential())
  );
}

/**
 * One bounded HTTP decision, never a text-model fallback or retry. The existing
 * shared reservation counts this attempt before any provider request begins.
 * No query, credentials, response prose, or provider metadata is logged.
 */
export async function executeAskDecision(
  request: AskDecisionRequest,
): Promise<AskDecisionResult> {
  if (!askDecisionRuntimeConfigured()) {
    return { ok: false, attempted: false, reason: "disabled" };
  }
  const credential = gatewayCredential();
  if (!validRequest(request)) {
    return { ok: false, attempted: false, reason: "invalid-input" };
  }
  // Snapshot the validated input before awaiting the shared reservation. A
  // caller cannot change the rubric or add context while that store responds.
  const questions: AskDecisionQuestions = {
    route: {
      type: "choice",
      instructions: request.questions.route.instructions,
      criteria: { ...request.questions.route.criteria },
    },
  };
  const choices = Object.keys(questions.route.criteria);
  const body = JSON.stringify({
    model: ASK_DECISION_MODEL,
    state: request.state.trim(),
    questions,
    providerOptions: {
      gateway: { zeroDataRetention: true, only: ["typesafe-ai"] },
    },
  });
  try {
    const reservation = await reserveAskModelCall();
    if (!reservation?.reserved) {
      return { ok: false, attempted: false, reason: "budget-unavailable" };
    }
  } catch {
    return { ok: false, attempted: false, reason: "budget-unavailable" };
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Decision deadline exceeded"));
    }, ASK_DECISION_TIMEOUT_MS);
  });
  try {
    const work = async (): Promise<AskDecisionResult> => {
      const response = await fetch(DECISION_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, attempted: true, reason: "request-failed" };
      }
      const declaredLength = response.headers.get("content-length");
      if (declaredLength && Number(declaredLength) > MAX_RESPONSE_LENGTH) {
        return { ok: false, attempted: true, reason: "invalid-response" };
      }
      const responseText = await response.text();
      if (responseText.length > MAX_RESPONSE_LENGTH) {
        return { ok: false, attempted: true, reason: "invalid-response" };
      }
      let value: unknown;
      try {
        value = JSON.parse(responseText);
      } catch {
        return { ok: false, attempted: true, reason: "invalid-response" };
      }
      return parseResult(value, choices) ??
        { ok: false, attempted: true, reason: "invalid-response" };
    };
    return await Promise.race([work(), deadline]);
  } catch {
    return {
      ok: false,
      attempted: true,
      reason: controller.signal.aborted ? "timeout" : "request-failed",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
