import "server-only";
import { askTextProvider, type AskTextProvider } from "./runtime-budget";

/** Reviewed text models only. A provider switch cannot select an arbitrary
 * premium model or change which account owns the request. */
const ASK_TEXT_MODELS = {
  gateway: "anthropic/claude-haiku-4.5",
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
} as const satisfies Record<AskTextProvider, string>;

export type AskTextModelSelection = {
  [Provider in AskTextProvider]: {
    provider: Provider;
    model: (typeof ASK_TEXT_MODELS)[Provider];
  };
}[AskTextProvider];

export function selectAskTextModel(
  provider: AskTextProvider | null = askTextProvider(),
): AskTextModelSelection | null {
  if (!provider || !Object.hasOwn(ASK_TEXT_MODELS, provider)) return null;
  return { provider, model: ASK_TEXT_MODELS[provider] } as AskTextModelSelection;
}

/** Cache arguments are also checked before a reservation or provider call.
 * Do not trust a serialized model identity as permission to use that SKU. */
export function isReviewedAskTextModelSelection(
  selection: unknown,
): selection is AskTextModelSelection {
  if (!selection || typeof selection !== "object") return false;
  const candidate = selection as { provider?: unknown; model?: unknown };
  if (
    typeof candidate.provider !== "string" ||
    !Object.hasOwn(ASK_TEXT_MODELS, candidate.provider)
  ) return false;
  const provider = candidate.provider as AskTextProvider;
  return candidate.model === ASK_TEXT_MODELS[provider];
}
