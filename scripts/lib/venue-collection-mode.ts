export type VenueCollectionOptions = {
  deterministicOnly: boolean;
  venueSlug?: string;
};
type VenueCollectionSource = { slug: string; method?: string; render?: boolean };
const NATIVE_METHODS: Readonly<Record<string, string>> = {
  banyan: "feed", "weinberg-center": "weinberg", "new-spire": "weinberg",
};

/** Default to the reviewed three-source native cohort; paid collection is explicit. */
export function parseVenueCollectionArgs(args: readonly string[]): VenueCollectionOptions {
  const options: VenueCollectionOptions = { deterministicOnly: true };
  let mode: string | undefined;
  for (const argument of args) {
    if (argument === "--deterministic-only" || argument === "--include-model-sources") {
      if (mode) throw new Error("Specify one venue collection mode only once.");
      mode = argument;
      options.deterministicOnly = argument === "--deterministic-only";
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown venue collection option: ${argument}`);
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(argument)) throw new Error("Invalid venue slug.");
      if (options.venueSlug) throw new Error("Specify at most one venue slug.");
      options.venueSlug = argument;
    }
  }
  return options;
}

export function isDeterministicVenueSource(source: VenueCollectionSource): boolean {
  return Object.hasOwn(NATIVE_METHODS, source.slug) && source.method === NATIVE_METHODS[source.slug];
}

export function selectVenueCollectionSources<T extends VenueCollectionSource>(sources: readonly T[], options: VenueCollectionOptions): T[] {
  const matching = options.venueSlug ? sources.filter((source) => source.slug === options.venueSlug) : [...sources];
  if (options.venueSlug && matching.length === 0) throw new Error(`Unknown venue slug: ${options.venueSlug}`);
  const selected = options.deterministicOnly ? matching.filter(isDeterministicVenueSource) : matching;
  if (selected.length === 0) throw new Error("No reviewed venue sources match the collection mode.");
  if (options.venueSlug && selected.length !== 1) throw new Error("The selected venue configuration is duplicated.");
  if (options.deterministicOnly && !options.venueSlug && (selected.length !== Object.keys(NATIVE_METHODS).length || new Set(selected.map((source) => source.slug)).size !== selected.length)) {
    throw new Error("The reviewed native venue cohort is incomplete or duplicated.");
  }
  return selected;
}
