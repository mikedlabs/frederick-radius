/**
 * Return an index chosen from every option except the previous one.
 *
 * Keeping this outside the component makes the no-repeat promise testable and
 * lets the animation use the same rule for preview frames and its final pick.
 * A single-item list is the only case where a repeat is unavoidable.
 */
export function nextDistinctIndex(
  length: number,
  previousIndex: number | null,
  randomValue: number,
): number | null {
  if (!Number.isInteger(length) || length <= 0) return null;
  if (length === 1) return 0;

  const previous =
    previousIndex != null && Number.isInteger(previousIndex) && previousIndex >= 0 && previousIndex < length
      ? previousIndex
      : null;
  const boundedRandom = Math.min(Math.max(Number.isFinite(randomValue) ? randomValue : 0, 0), 1 - Number.EPSILON);

  if (previous == null) return Math.floor(boundedRandom * length);

  // Select within a list that is one item shorter, then skip over the item the
  // user just saw. Every random value still maps to one valid outcome.
  const compactIndex = Math.floor(boundedRandom * (length - 1));
  return compactIndex >= previous ? compactIndex + 1 : compactIndex;
}

/**
 * Build the visual reel in advance, then append a separately drawn winner.
 * Animation length never changes which result wins, and the winner always
 * differs from the user's most recent completed pick when the pool allows it.
 */
export function buildSpinSequence(
  length: number,
  previousIndex: number | null,
  previewRandomValues: readonly number[],
  finalRandomValue: number,
): number[] {
  const winner = nextDistinctIndex(length, previousIndex, finalRandomValue);
  if (winner == null) return [];

  const previews: number[] = [];
  let previous = previousIndex;

  for (const randomValue of previewRandomValues) {
    const next = nextDistinctIndex(length, previous, randomValue);
    if (next == null) break;
    previews.push(next);
    previous = next;
  }

  // A preview is decorative. Drop any trailing frame that would make the
  // independently selected winner appear to stall instead of settle.
  while (previews.at(-1) === winner) previews.pop();

  return [...previews, winner];
}
