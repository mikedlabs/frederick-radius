export type VenueCollectionOptions = {
  deterministicOnly: boolean;
  venueSlug?: string;
};

type VenueCollectionSource = {
  slug: string;
  method?: string;
  render?: boolean;
};

/** Keep the existing optional venue selector while making the free lane explicit. */
export function parseVenueCollectionArgs(
  args: readonly string[],
): VenueCollectionOptions {
  const options: VenueCollectionOptions = { deterministicOnly: false };
  for (const argument of args) {
    if (argument === "--deterministic-only") {
      if (options.deterministicOnly) {
        throw new Error("Specify --deterministic-only only once.");
      }
      options.deterministicOnly = true;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown venue collection option: ${argument}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(argument)) {
      throw new Error(`Invalid venue slug: ${JSON.stringify(argument)}`);
    }
    if (options.venueSlug !== undefined) {
      throw new Error("Specify at most one venue slug.");
    }
    options.venueSlug = argument;
  }
  return options;
}

/** Explicit allowlist: an unknown or legacy method must never start a paid call. */
export function isDeterministicVenueSource(
  source: Pick<VenueCollectionSource, "method" | "render">,
): boolean {
  return source.method === "feed" || source.method === "weinberg";
}

/** Select before collection, independently of any model key or readiness check. */
export function selectVenueCollectionSources<T extends VenueCollectionSource>(
  sources: readonly T[],
  options: VenueCollectionOptions,
): T[] {
  const matching = options.venueSlug === undefined
    ? [...sources]
    : sources.filter((source) => source.slug === options.venueSlug);
  if (options.venueSlug !== undefined && matching.length === 0) {
    throw new Error(`Unknown venue slug: ${options.venueSlug}`);
  }
  const selected = options.deterministicOnly
    ? matching.filter(isDeterministicVenueSource)
    : matching;
  if (selected.length === 0) {
    throw new Error(
      options.deterministicOnly
        ? "No deterministic venue sources match the selection."
        : "No venue sources match the selection.",
    );
  }
  return selected;
}
