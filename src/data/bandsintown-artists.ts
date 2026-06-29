/**
 * Bandsintown artist registry (companion to eventbrite-organizers.ts).
 *
 * The public Bandsintown API is ARTIST-scoped only — there is no area
 * search — so discovery is "poll the artists we curate." This file IS that
 * list. The adapter (`fetchBandsintownForArtists`) returns [] until both this
 * list is non-empty AND `BANDSINTOWN_APP_ID` is set in the environment.
 *
 * It ships empty on purpose: artist names are owner-curated human work, and
 * inventing them would fabricate sources. Add the artists whose Frederick-area
 * tour dates you want surfaced (local acts, returning headliners, resident
 * performers). Use the artist's Bandsintown name/slug exactly as it appears in
 * their URL (`bandsintown.com/a/<id>-<name>` → use the <name>, e.g.
 * "the-frederick-band"); the adapter requests `/artists/<name>/events`.
 *
 * Keep it focused — a handful to a few dozen acts with genuine local pull —
 * rather than a broad genre dragnet (every entry is one polled request).
 */
export const BANDSINTOWN_ARTISTS: string[] = [
  // Example shape (commented, not polled):
  // "tinsley-ellis",
];
