/**
 * Hidden gems — an editorial list, not an algorithm.
 *
 * These are real curated places (slugs from src/data/places.ts) chosen
 * because they are lesser-known local standouts: the spots a resident
 * sends a visitor to, not the marquee names everyone already finds. Keep
 * the list short and deliberate. Add a slug only when it is genuinely a
 * "you have to know about this" place, never to pad the layer.
 */
export const HIDDEN_GEM_SLUGS: ReadonlySet<string> = new Set([
  "gathland-state-park-burkittsville", // War Correspondents Memorial, off the beaten path
  "c-and-o-canal-brunswick", // quiet towpath access most visitors miss
  "walkersville-southern-railroad", // a charming heritage rail ride
  "brunswick-heritage-museum", // small, deep, easy to overlook
  "lebherz-oil-and-vinegar-frederick", // a tasting shop locals guard
  "dublin-roasters-frederick", // beloved roaster off the main drag
  // "the-cozy-creamery-thurmont" was removed 2026-07-10: the Cozy closed in
  // 2014, the complex was demolished, and the site is now a car dealership.
  // No creamery replaced it (Thurmont Historical Society, Baltimore Sun).
  "smoketown-brewing-brunswick", // a Brunswick firehouse-turned-brewery
]);

export function isHiddenGem(slug: string): boolean {
  return HIDDEN_GEM_SLUGS.has(slug);
}
