export const SAVED_JOURNEY_KEY = "fr:saved-journey:v1";
export const SAVED_JOURNEY_MAX_AGE_MS = 30 * 60_000;

export type SavedJourney = {
  activeList: string | null;
  organizerOpen: boolean;
  raisedSlug: string | null;
  eventSlug: string | null;
  pastEventSlug: string | null;
  showPast: boolean;
  scrollY: number;
};

export const EMPTY_SAVED_JOURNEY: SavedJourney = {
  activeList: null,
  organizerOpen: false,
  raisedSlug: null,
  eventSlug: null,
  pastEventSlug: null,
  showPast: false,
  scrollY: 0,
};

export function parseSavedJourney(raw: string | null, now = Date.now()): SavedJourney | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > SAVED_JOURNEY_MAX_AGE_MS) return null;
    const state = value.state;
    if (!state || !Number.isFinite(state.scrollY) || state.scrollY < 0 || state.scrollY > 100_000) return null;
    const nullableText = (input: unknown, max: number) => input === null || (typeof input === "string" && input.length <= max);
    if (!nullableText(state.activeList, 120) || !nullableText(state.raisedSlug, 240) || !nullableText(state.eventSlug, 240) || !nullableText(state.pastEventSlug, 240) || typeof state.organizerOpen !== "boolean" || typeof state.showPast !== "boolean") return null;
    return {
      activeList: state.activeList,
      organizerOpen: state.organizerOpen,
      raisedSlug: state.raisedSlug,
      eventSlug: state.eventSlug,
      pastEventSlug: state.pastEventSlug,
      showPast: state.showPast,
      scrollY: state.scrollY,
    };
  } catch {
    return null;
  }
}

export function readSavedJourney(): SavedJourney | null {
  try {
    return parseSavedJourney(window.sessionStorage.getItem(SAVED_JOURNEY_KEY));
  } catch {
    return null;
  }
}

export function writeSavedJourney(state: SavedJourney): void {
  try {
    window.sessionStorage.setItem(SAVED_JOURNEY_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), state }));
  } catch {
    // Browsing and saving still work when this tab cannot retain UI state.
  }
}
