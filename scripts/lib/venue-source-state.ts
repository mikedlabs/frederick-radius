import { sourceFingerprintMatches } from "./source-content-fingerprint";

export type ModelVenueMethod = "image" | "render" | "fetch";
export type VenueSourceOutcome = "events" | "empty";

export type VenueSourceObservation = {
  contentHash: string;
  finalUrl: string;
  method: ModelVenueMethod;
  extractorVersion: string;
  outcome: VenueSourceOutcome;
};

export type VenueSourceState = {
  schemaVersion: 1;
  sources: Record<
    string,
    {
      inputs: Record<string, VenueSourceObservation>;
    }
  >;
};

const MAX_VENUES = 500;
const MAX_INPUTS_PER_VENUE = 20;
const SHA256 = /^[a-f0-9]{64}$/;
const METHODS = new Set<ModelVenueMethod>(["image", "render", "fetch"]);
const OUTCOMES = new Set<VenueSourceOutcome>(["events", "empty"]);

export function emptyVenueSourceState(): VenueSourceState {
  return { schemaVersion: 1, sources: {} };
}

/**
 * Reject malformed or unexpectedly large state rather than silently resetting
 * the cost guard. This artifact is committed and reviewed with venue data.
 */
export function parseVenueSourceState(value: unknown): VenueSourceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Venue source state must be an object.");
  }
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1) {
    throw new Error("Venue source state has an unsupported schemaVersion.");
  }
  if (!root.sources || typeof root.sources !== "object" || Array.isArray(root.sources)) {
    throw new Error("Venue source state sources must be an object.");
  }

  const sourceEntries = Object.entries(root.sources as Record<string, unknown>);
  if (sourceEntries.length > MAX_VENUES) {
    throw new Error(`Venue source state exceeds ${MAX_VENUES} venues.`);
  }

  const state = emptyVenueSourceState();
  for (const [venueSlug, rawVenue] of sourceEntries) {
    if (
      !venueSlug ||
      venueSlug.length > 200 ||
      !rawVenue ||
      typeof rawVenue !== "object" ||
      Array.isArray(rawVenue)
    ) {
      throw new Error(`Venue source state entry ${venueSlug || "(empty)"} is invalid.`);
    }
    const rawInputs = (rawVenue as Record<string, unknown>).inputs;
    if (!rawInputs || typeof rawInputs !== "object" || Array.isArray(rawInputs)) {
      throw new Error(`Venue source state entry ${venueSlug} has invalid inputs.`);
    }
    const inputs = Object.entries(rawInputs as Record<string, unknown>);
    if (inputs.length > MAX_INPUTS_PER_VENUE) {
      throw new Error(
        `Venue source state entry ${venueSlug} exceeds ${MAX_INPUTS_PER_VENUE} inputs.`,
      );
    }
    state.sources[venueSlug] = { inputs: {} };
    for (const [inputUrl, rawObservation] of inputs) {
      if (
        !inputUrl ||
        inputUrl.length > 4_096 ||
        !rawObservation ||
        typeof rawObservation !== "object" ||
        Array.isArray(rawObservation)
      ) {
        throw new Error(`Venue source observation for ${venueSlug} is invalid.`);
      }
      const observation = rawObservation as Record<string, unknown>;
      if (
        typeof observation.contentHash !== "string" ||
        !SHA256.test(observation.contentHash) ||
        typeof observation.finalUrl !== "string" ||
        !observation.finalUrl ||
        !METHODS.has(observation.method as ModelVenueMethod) ||
        typeof observation.extractorVersion !== "string" ||
        !observation.extractorVersion ||
        observation.extractorVersion.length > 100 ||
        !OUTCOMES.has(observation.outcome as VenueSourceOutcome)
      ) {
        throw new Error(
          `Venue source observation for ${venueSlug} / ${inputUrl} is invalid.`,
        );
      }
      state.sources[venueSlug].inputs[inputUrl] = {
        contentHash: observation.contentHash,
        finalUrl: observation.finalUrl,
        method: observation.method as ModelVenueMethod,
        extractorVersion: observation.extractorVersion,
        outcome: observation.outcome as VenueSourceOutcome,
      };
    }
  }
  return state;
}

export function venueSourceObservation(
  state: VenueSourceState,
  venueSlug: string,
  inputUrl: string,
): VenueSourceObservation | undefined {
  return state.sources[venueSlug]?.inputs[inputUrl];
}

export function unchangedVenueSourceOutcome(
  state: VenueSourceState,
  venueSlug: string,
  inputUrl: string,
  current: {
    contentHash: string;
    finalUrl: string;
    method: ModelVenueMethod;
    extractorVersion: string;
  },
): VenueSourceOutcome | null {
  const previous = venueSourceObservation(state, venueSlug, inputUrl);
  return sourceFingerprintMatches(previous, current)
    ? previous?.outcome ?? null
    : null;
}

export function recordVenueSourceObservation(
  state: VenueSourceState,
  venueSlug: string,
  inputUrl: string,
  observation: VenueSourceObservation,
): void {
  if (
    state.sources[venueSlug] === undefined &&
    Object.keys(state.sources).length >= MAX_VENUES
  ) {
    throw new Error(`Venue source state exceeds ${MAX_VENUES} venues.`);
  }
  const venue = (state.sources[venueSlug] ??= { inputs: {} });
  if (
    venue.inputs[inputUrl] === undefined &&
    Object.keys(venue.inputs).length >= MAX_INPUTS_PER_VENUE
  ) {
    throw new Error(
      `Venue source state entry ${venueSlug} exceeds ${MAX_INPUTS_PER_VENUE} inputs.`,
    );
  }
  venue.inputs[inputUrl] = observation;
}

/** Stable output keeps review PRs quiet when no source content changed. */
export function serializeVenueSourceState(state: VenueSourceState): string {
  const sources = Object.fromEntries(
    Object.entries(state.sources)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([venueSlug, venue]) => [
        venueSlug,
        {
          inputs: Object.fromEntries(
            Object.entries(venue.inputs).sort(([a], [b]) => a.localeCompare(b)),
          ),
        },
      ]),
  );
  return `${JSON.stringify({ schemaVersion: 1, sources }, null, 2)}\n`;
}
