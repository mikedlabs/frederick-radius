export const FAIR_MAP_SELECTION_HISTORY_KEY =
  "__frederickRadiusFairMapSelection";

export function isFairMapSelectionHistoryState(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === "object" &&
      (state as Record<string, unknown>)[FAIR_MAP_SELECTION_HISTORY_KEY] ===
        true,
  );
}

export function withoutFairMapSelectionHistoryState(
  state: unknown,
): Record<string, unknown> {
  const nextState =
    state && typeof state === "object"
      ? { ...(state as Record<string, unknown>) }
      : {};
  delete nextState[FAIR_MAP_SELECTION_HISTORY_KEY];
  return nextState;
}
