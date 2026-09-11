import type { AskSource } from "@/lib/ask/contracts";

const CITATION_STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "city", "county", "for", "frederick",
  "in", "la", "maryland", "md", "of", "on", "the", "to",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !CITATION_STOP_WORDS.has(token));
}

/**
 * Source cards are citations, not a transcript of everything retrieval saw.
 * Keep a card only when the rendered answer actually names that source.
 */
export function sourceIsCited(source: Pick<AskSource, "name">, answer: string): boolean {
  const normalizedAnswer = normalize(answer);
  const normalizedName = normalize(source.name);
  if (!normalizedAnswer || !normalizedName) return false;

  if (` ${normalizedAnswer} `.includes(` ${normalizedName} `)) return true;

  const sourceTokens = meaningfulTokens(source.name);
  if (sourceTokens.length === 0) return false;
  const answerTokens = new Set(meaningfulTokens(answer));
  const matches = sourceTokens.filter((token) => answerTokens.has(token)).length;

  if (sourceTokens.length === 1) {
    // A multi-word title can collapse to one generic token after location stop
    // words are removed ("County budget" -> "budget"). That token appearing in
    // "budget dinner" is not an entity citation. The full-name phrase check
    // above still accepts a real "County budget" mention; genuinely one-word
    // source names keep their exact-token behavior.
    const normalizedNameTokens = normalizedName.split(/\s+/).filter(Boolean);
    return normalizedNameTokens.length === 1 && matches === 1;
  }
  return matches >= 2 && matches / sourceTokens.length >= 0.6;
}

export function filterCitedSources<S extends Pick<AskSource, "name">>(
  sources: S[],
  answer: string | null | undefined,
): S[] {
  if (!answer) return [];
  return sources.filter((source) => sourceIsCited(source, answer));
}
