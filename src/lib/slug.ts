/**
 * Truncate a hyphenated slug fragment without cutting a word in half.
 *
 * Slugs like "live-summer-concert-series-the-soul-truth-wit" came from a
 * hard character slice mid-word. This cuts back to the last hyphen
 * instead. If the nearest boundary is in the first half of the budget
 * (a single very long token), it hard-cuts so the result stays
 * deterministic and never empty. Pure: the live-event slug and its
 * detail-route resolver both run this, so they stay consistent.
 */
export function cutAtWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const hard = s.slice(0, max).replace(/-+$/, "");
  const lastDash = hard.lastIndexOf("-");
  if (lastDash >= Math.floor(max / 2)) return hard.slice(0, lastDash);
  return hard;
}
