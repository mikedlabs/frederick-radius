/**
 * A feed returning zero rows is not the same thing as a feed we could not
 * verify. Event adapters keep their legacy `T[]` public functions for callers
 * that only need data, while the unified event assembly consumes this richer
 * result so it can surface partial coverage honestly.
 */
export type EventAdapterState = "ok" | "disabled" | "failed" | "partial";

export type EventAdapterResult<T> = {
  items: T[];
  state: EventAdapterState;
};

export function eventAdapterOk<T>(items: T[]): EventAdapterResult<T> {
  return { items, state: "ok" };
}

export function eventAdapterDisabled<T>(): EventAdapterResult<T> {
  return { items: [], state: "disabled" };
}

export function eventAdapterFailed<T>(items: T[] = []): EventAdapterResult<T> {
  return { items, state: items.length > 0 ? "partial" : "failed" };
}

export function eventAdapterIsDegraded(
  result: EventAdapterResult<unknown>,
): boolean {
  return result.state === "failed" || result.state === "partial";
}
