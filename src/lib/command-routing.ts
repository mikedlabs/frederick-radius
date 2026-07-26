export type CommandSearchStatus = "idle" | "loading" | "done" | "error";

/**
 * One predictable submit rule for the universal command surface:
 * deterministic quick answers outrank index matches; a completed miss becomes
 * an Ask question; an unsettled search opens the full results page rather than
 * guessing before retrieval finishes.
 */
export function commandDestination({
  query,
  quickHref,
  bestHref,
  status,
}: {
  query: string;
  quickHref?: string | null;
  bestHref?: string | null;
  status: CommandSearchStatus;
}): string | null {
  const normalized = query.trim();
  if (!normalized) return null;
  if (quickHref) return quickHref;
  if (bestHref) return bestHref;

  const encoded = encodeURIComponent(normalized);
  return status === "done" ? `/ask?q=${encoded}` : `/search?q=${encoded}`;
}
