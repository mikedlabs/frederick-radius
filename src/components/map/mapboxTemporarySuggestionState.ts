import type { SearchResult } from "@/lib/search/index";

export type TemporaryMapboxRetrieveClaim = {
  mapboxId: string;
  sessionToken: string;
};

export function claimTemporaryMapboxRetrieve(
  current: TemporaryMapboxRetrieveClaim | null,
  next: TemporaryMapboxRetrieveClaim,
): {
  accepted: boolean;
  claim: TemporaryMapboxRetrieveClaim;
} {
  return current
    ? { accepted: false, claim: current }
    : { accepted: true, claim: next };
}

export function sameTemporaryMapboxRetrieve(
  current: TemporaryMapboxRetrieveClaim | null,
  expected: TemporaryMapboxRetrieveClaim,
): boolean {
  return (
    current?.mapboxId === expected.mapboxId &&
    current.sessionToken === expected.sessionToken
  );
}

export function temporaryMapboxRetrieveIsCurrent(
  current: TemporaryMapboxRetrieveClaim | null,
  expected: TemporaryMapboxRetrieveClaim,
  currentRequestId: number,
  expectedRequestId: number,
): boolean {
  return (
    currentRequestId === expectedRequestId &&
    sameTemporaryMapboxRetrieve(current, expected)
  );
}

export function settleTemporaryMapboxSuggestions(
  current: SearchResult[],
  selectedId: string,
  opened: boolean,
): SearchResult[] {
  return current.filter(
    (result) =>
      !(result.temporary && result.provider === "Mapbox") ||
      (opened && result.id === selectedId),
  );
}

export function expireTemporaryMapboxSuggestions(
  current: SearchResult[],
): SearchResult[] {
  return current.filter(
    (result) => !(result.temporary && result.provider === "Mapbox"),
  );
}
