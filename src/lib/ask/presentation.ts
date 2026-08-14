import type {
  AskResponsePresentation,
  AskResult,
  AskSource,
} from "@/lib/ask/contracts";
import {
  parseAskIntent,
  type AskIntentKind,
} from "@/lib/ask/intent";

const DISCOVERY_KINDS = new Set(["place", "event", "explore"]);

function isDiscoverySource(source: AskSource): boolean {
  return source.href.startsWith("/places/") || source.href.startsWith("/events/");
}

function isSafetyLead(source: AskSource | undefined): boolean {
  return Boolean(
    source &&
    (
      source.slug === "airnow-aqi" ||
      source.slug === "outdoor-safety-unavailable" ||
      source.slug.startsWith("nws-alert-")
    )
  );
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionIndex(answer: string, source: AskSource): number {
  const answerText = ` ${normalized(answer)} `;
  const sourceName = normalized(source.name);
  if (!sourceName) return Number.POSITIVE_INFINITY;
  const index = answerText.indexOf(` ${sourceName} `);
  return index < 0 ? Number.POSITIVE_INFINITY : index;
}

/**
 * Make recommendation language a server assertion instead of a client guess.
 *
 * Deterministic discovery answers preserve the ranking produced by Radius, so
 * their first place or event is a real primary result. Model-assisted answers
 * can return citation slugs in a different order from the prose; in that case
 * the first exact place or event named in the answer earns the marker. Civic
 * evidence, weather, parking, and generic retrieval sources stay neutral.
 */
export function withPrimaryRankedResult(result: AskResult): AskResult {
  const sources = result.sources.map((source) => {
    const clean = { ...source };
    delete clean.isPrimaryRankedResult;
    return clean;
  });
  if (
    sources.length === 0 ||
    !result.intent ||
    !DISCOVERY_KINDS.has(result.intent.kind) ||
    isSafetyLead(sources[0])
  ) {
    return { ...result, sources };
  }

  const discoveryIndexes = sources.flatMap((source, index) =>
    isDiscoverySource(source) ? [index] : [],
  );
  if (discoveryIndexes.length === 0) return { ...result, sources };

  let primaryIndex = discoveryIndexes[0];
  if (result.usedModel) {
    const answer = result.answer ?? "";
    primaryIndex = discoveryIndexes
      .map((index) => ({ index, mention: mentionIndex(answer, sources[index]) }))
      .sort((left, right) => left.mention - right.mention || left.index - right.index)[0].index;
    if (!Number.isFinite(mentionIndex(answer, sources[primaryIndex]))) {
      return { ...result, sources };
    }
  }

  const ordered =
    primaryIndex === 0
      ? sources
      : [
          sources[primaryIndex],
          ...sources.slice(0, primaryIndex),
          ...sources.slice(primaryIndex + 1),
        ];
  return {
    ...result,
    sources: ordered.map((source, index) =>
      index === 0
        ? { ...source, isPrimaryRankedResult: true as const }
        : source,
    ),
  };
}

function firstCompleteSentence(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const sentenceEnd = /[.!?](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = sentenceEnd.exec(text)) !== null) {
    const candidate = text.slice(0, match.index + 1).trim();
    // Do not turn a road, place, or honorific abbreviation into a sentence.
    const remainder = text.slice(match.index + 1).trimStart();
    const honorific = /\b(?:Mr|Mrs|Ms|Dr)\.$/i.test(candidate);
    const addressDirection =
      /\b\d+\s+(?:N|S|E|W)\.$/i.test(candidate) &&
      /^[A-Z0-9]/.test(remainder);
    const contextualAbbreviation =
      /\b(?:St|Mt|Ave|Rd|U\.S|D\.C)\.$/i.test(candidate) &&
      (candidate.length <= 5 || /^[a-z0-9]/.test(remainder));
    if (honorific || addressDirection || contextualAbbreviation) {
      continue;
    }
    return candidate;
  }
  return text;
}

function answerRemainder(answer: string, summary: string): string | null {
  const text = answer.trim();
  if (!text || !summary || text === summary) return null;
  if (!text.startsWith(summary)) return text;
  const remaining = text.slice(summary.length).trim();
  return remaining || null;
}

export function askResponsePresentation(
  result: AskResult,
): AskResponsePresentation {
  const unsupportedLowConfidence =
    result.intelligence?.confidence === "medium" &&
    result.sources.length === 0 &&
    !result.plan;
  const layout: AskResponsePresentation["layout"] =
    result.status === "empty" || unsupportedLowConfidence
      ? "recovery"
      : result.intent?.kind === "plan" && result.plan
        ? "plan"
        : result.intent?.kind === "place"
          ? "place"
          : result.intent?.kind === "civic"
            ? "civic"
            : "standard";
  const answer = result.answer?.trim() ?? "";
  const summary = firstCompleteSentence(answer) || null;

  return {
    layout,
    summary,
    detail:
      answer && summary
        ? answerRemainder(answer, summary)
        : answer || null,
  };
}

/**
 * Decorate every API success with the same intent and reading-order contract.
 * Direct civic handlers bypass the general Ask engine, so the route can force
 * their known intent instead of making the client infer it from copy.
 */
export function withAskResponsePresentation(
  result: AskResult,
  query: string,
  options: { kind?: AskIntentKind } = {},
): AskResult {
  const parsedIntent = result.intent ?? parseAskIntent(query);
  const intent = options.kind
    ? {
        ...parsedIntent,
        kind: options.kind,
        label:
          options.kind === "civic"
            ? "Official local help"
            : parsedIntent.label,
      }
    : parsedIntent;
  const ranked = withPrimaryRankedResult({ ...result, intent });

  return {
    ...ranked,
    presentation: askResponsePresentation(ranked),
  };
}

export type AskResponseSection =
  | "summary"
  | "context-controls"
  | "plan"
  | "primary-action"
  | "primary-source"
  | "supporting-sources"
  | "secondary-actions"
  | "detail";

/**
 * DOM order, not visual CSS order. This makes the hierarchy testable and
 * keeps assistive technology in the same decision-first sequence.
 */
export function askResponseSectionOrder(
  presentation: Pick<AskResponsePresentation, "layout">,
): AskResponseSection[] {
  switch (presentation.layout) {
    case "plan":
      return [
        "summary",
        "context-controls",
        "plan",
        "primary-action",
        "primary-source",
        "supporting-sources",
        "secondary-actions",
        "detail",
      ];
    case "place":
      return [
        "primary-source",
        "summary",
        "context-controls",
        "primary-action",
        "supporting-sources",
        "secondary-actions",
        "detail",
      ];
    case "civic":
      return [
        "summary",
        "primary-action",
        "primary-source",
        "supporting-sources",
        "secondary-actions",
        "detail",
      ];
    case "recovery":
      return ["summary", "primary-action"];
    default:
      return [
        "summary",
        "context-controls",
        "primary-source",
        "primary-action",
        "supporting-sources",
        "secondary-actions",
        "detail",
      ];
  }
}
