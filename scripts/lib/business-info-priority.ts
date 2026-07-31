export type BusinessInfoPriorityReason =
  | "explicit-request"
  | "copy-gap-unread"
  | "copy-gap-no-decision-fact"
  | "copy-gap-refresh"
  | "routine-refresh";

export type BusinessInfoPriorityCandidate = {
  slug: string;
  hasUsefulCopy: boolean;
  hasExistingSource: boolean;
  hasDecisionFact: boolean;
  fetchedAt?: string;
  /** Existing editorial/popularity signal; used only within the same gap. */
  importance?: number;
  routineRefresh: boolean;
  explicitRequest?: boolean;
};

export type PrioritizedBusinessInfoCandidate<
  T extends BusinessInfoPriorityCandidate = BusinessInfoPriorityCandidate,
> = T & {
  priorityReason: BusinessInfoPriorityReason;
};

type PriorityOptions = {
  force?: boolean;
  limit: number;
  now?: Date;
  refreshDays: number;
};

const PRIORITY: Record<BusinessInfoPriorityReason, number> = {
  "explicit-request": -1,
  "copy-gap-unread": 0,
  "copy-gap-no-decision-fact": 1,
  "copy-gap-refresh": 2,
  "routine-refresh": 3,
};

const ROUTINE_PREFIXES = new Set(["brew", "distill"]);

function matchesType(value: string | undefined, include: string): boolean {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const needle = include
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized || !needle) return false;

  const tokens = normalized.split("_");
  if (ROUTINE_PREFIXES.has(needle)) {
    return tokens.some((token) => token.startsWith(needle));
  }
  if (!needle.includes("_")) return tokens.includes(needle);
  return (`_${normalized}_`).includes(`_${needle}_`);
}

/**
 * Match food/drink refresh types on word boundaries. A raw substring check
 * treated `barber_shop` as a bar and spent restaurant-enrichment budget on
 * haircuts.
 */
export function isRoutineBusinessInfoType(
  primaryType: string | undefined,
  category: string | undefined,
  typeIncludes: readonly string[],
): boolean {
  return typeIncludes.some(
    (include) =>
      matchesType(primaryType, include) || matchesType(category, include),
  );
}

function timestamp(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function reasonFor(
  candidate: BusinessInfoPriorityCandidate,
): BusinessInfoPriorityReason | null {
  if (candidate.explicitRequest) return "explicit-request";
  if (!candidate.hasUsefulCopy) {
    if (!candidate.hasExistingSource) return "copy-gap-unread";
    if (!candidate.hasDecisionFact) return "copy-gap-no-decision-fact";
    return "copy-gap-refresh";
  }
  return candidate.routineRefresh ? "routine-refresh" : null;
}

/**
 * Spend a bounded extraction batch on the largest public data gaps first.
 *
 * A place with no useful Radius copy can enter the queue regardless of
 * category, but a recently inspected site is not paid for again merely
 * because its evidence still needs editorial review. Fully covered places
 * retain the original food-and-drink refresh policy.
 */
export function prioritizeBusinessInfoCandidates<
  T extends BusinessInfoPriorityCandidate,
>(
  candidates: readonly T[],
  options: PriorityOptions,
): Array<PrioritizedBusinessInfoCandidate<T>> {
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - options.refreshDays * 86_400_000;
  const limit = Math.max(0, Math.floor(options.limit));

  return candidates
    .flatMap((candidate) => {
      const priorityReason = reasonFor(candidate);
      if (!priorityReason) return [];
      const stale = timestamp(candidate.fetchedAt) < cutoff;
      if (!options.force && !stale) return [];
      return [{ ...candidate, priorityReason }];
    })
    .sort((a, b) => {
      const byReason = PRIORITY[a.priorityReason] - PRIORITY[b.priorityReason];
      if (byReason !== 0) return byReason;
      const byImportance = (b.importance ?? 0) - (a.importance ?? 0);
      if (byImportance !== 0) return byImportance;
      const byAge = timestamp(a.fetchedAt) - timestamp(b.fetchedAt);
      if (byAge !== 0) return byAge;
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, limit);
}
