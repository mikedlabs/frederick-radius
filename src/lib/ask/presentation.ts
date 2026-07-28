import type { AskResult, AskSource } from "@/lib/ask/contracts";

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
