/** Remember the removed item's neighbors so Undo preserves changes made to
 * the rest of the list, including edits from another tab. */
export type RemovedListItem<T> = {
  item: T;
  index: number;
  previousId?: string;
  nextId?: string;
};

export function rememberListItem<T>(items: readonly T[], index: number, id: (item: T) => string): RemovedListItem<T> {
  return {
    item: items[index], index,
    previousId: index > 0 ? id(items[index - 1]) : undefined,
    nextId: index + 1 < items.length ? id(items[index + 1]) : undefined,
  };
}

export function restoreListItem<T>(
  items: T[],
  removed: RemovedListItem<T>,
  id: (item: T) => string,
  fallbackIndex = removed.index,
): T[] {
  if (items.some(item => id(item) === id(removed.item))) return items;
  const next = items.findIndex(item => id(item) === removed.nextId);
  const previous = items.findIndex(item => id(item) === removed.previousId);
  const index = next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(fallbackIndex, items.length);
  return [...items.slice(0, index), removed.item, ...items.slice(index)];
}
