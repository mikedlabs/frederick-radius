import "server-only";
import {
  reserveDailyUsage,
  type UsageReservation,
} from "@/lib/usage-meter";

/**
 * Public Ask is an optional enhancement over deterministic Frederick data.
 * These defaults are deliberately modest, every environment value is clamped
 * below a code-owned maximum, and zero is always an immediate kill switch.
 */
export const DEFAULT_ASK_AI_DAILY_CALL_LIMIT = 250;
export const MAX_ASK_AI_DAILY_CALL_LIMIT = 1_000;
export const DEFAULT_ASK_AI_EMBEDDING_DAILY_LIMIT = 100;
export const MAX_ASK_AI_EMBEDDING_DAILY_LIMIT = 500;
export const DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS = 400;
export const MAX_ASK_AI_MAX_OUTPUT_TOKENS = 600;

export type AskTextProvider = "gateway" | "anthropic" | "openai";

function boundedInteger(
  raw: string | number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (raw === undefined) return fallback;
  const normalized = typeof raw === "number" ? raw : raw.trim();
  if (normalized === "") return fallback;
  const parsed = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

export function askAiDailyCallLimit(
  raw: string | number | undefined = process.env.ASK_AI_DAILY_CALL_LIMIT,
): number {
  return boundedInteger(
    raw,
    DEFAULT_ASK_AI_DAILY_CALL_LIMIT,
    MAX_ASK_AI_DAILY_CALL_LIMIT,
  );
}

export function askAiEmbeddingDailyLimit(
  raw: string | number | undefined =
    process.env.ASK_AI_EMBEDDING_DAILY_LIMIT,
): number {
  return boundedInteger(
    raw,
    DEFAULT_ASK_AI_EMBEDDING_DAILY_LIMIT,
    MAX_ASK_AI_EMBEDDING_DAILY_LIMIT,
  );
}

export function askAiMaxOutputTokens(
  raw: string | number | undefined = process.env.ASK_AI_MAX_OUTPUT_TOKENS,
): number {
  const bounded = boundedInteger(
    raw,
    DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS,
    MAX_ASK_AI_MAX_OUTPUT_TOKENS,
  );
  // Output cannot be disabled independently of the runtime. Treat zero as the
  // safe default rather than passing an invalid or provider-specific value.
  return bounded === 0 ? DEFAULT_ASK_AI_MAX_OUTPUT_TOKENS : bounded;
}

export function askAiRuntimeRequested(
  raw: string | undefined = process.env.ASK_AI_RUNTIME_ENABLED,
): boolean {
  return raw === "1";
}

export function askRuntimeEmbeddingsRequested(
  raw: string | undefined = process.env.ASK_AI_RUNTIME_EMBEDDINGS_ENABLED,
): boolean {
  return raw === "1";
}

export function askTextProvider(
  raw: string | undefined = process.env.ASK_AI_PROVIDER,
): AskTextProvider | null {
  // An omitted setting intentionally uses Gateway. Once an operator supplies a
  // value, however, it must be one of the documented providers. Silently
  // turning a typo into Gateway can send prompts to and bill the wrong account.
  if (raw === undefined) return "gateway";
  const normalized = raw.trim().toLowerCase();
  return normalized === "gateway" ||
    normalized === "anthropic" ||
    normalized === "openai"
    ? normalized
    : null;
}

export function askGatewayCredentialConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

export function askTextProviderCredentialConfigured(
  provider: AskTextProvider | null = askTextProvider(),
): boolean {
  if (!provider) return false;
  if (provider === "gateway") return askGatewayCredentialConfigured();
  if (provider === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Configuration only. Durable counter availability is checked atomically at
 * reservation time, immediately before provider work. */
export function askTextGenerationRuntimeConfigured(): boolean {
  return (
    askAiRuntimeRequested() &&
    askAiDailyCallLimit() > 0 &&
    askTextProviderCredentialConfigured()
  );
}

/** The tool agent uses AI Gateway, but shares the same global runtime switch
 * and daily call ceiling as the single-shot provider. */
export function askAgentRuntimeConfigured(): boolean {
  return (
    askAiRuntimeRequested() &&
    askAiDailyCallLimit() > 0 &&
    process.env.ASK_RADIUS_AGENT === "1" &&
    askTextProvider() === "gateway" &&
    askGatewayCredentialConfigured()
  );
}

/** Runtime semantic recall is direct OpenAI only. Postgres FTS remains the
 * baseline when this switch, credential, budget, or shared counter is absent. */
export function askRuntimeEmbeddingsConfigured(): boolean {
  return (
    askRuntimeEmbeddingsRequested() &&
    askAiEmbeddingDailyLimit() > 0 &&
    process.env.RADIUS_HYBRID_SEARCH !== "0" &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  );
}

export async function reserveAskModelCall(): Promise<UsageReservation | null> {
  if (!askAiRuntimeRequested()) {
    return { reserved: false, count: 0 };
  }
  const limit = askAiDailyCallLimit();
  if (limit === 0) return { reserved: false, count: 0 };
  return reserveDailyUsage("ask_model_call", limit);
}

export async function reserveAskEmbeddingCall(): Promise<UsageReservation | null> {
  if (!askRuntimeEmbeddingsConfigured()) {
    return { reserved: false, count: 0 };
  }
  return reserveDailyUsage("ask_embedding", askAiEmbeddingDailyLimit());
}
