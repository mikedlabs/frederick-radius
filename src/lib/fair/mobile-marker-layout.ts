export type MobileMarkerPoint<T> = {
  id: string;
  item: T;
  x: number;
  y: number;
};

export type MobileMarkerGroup<T> = {
  id: string;
  items: T[];
  representative: MobileMarkerPoint<T>;
};

/**
 * Collapse markers whose square hit areas would overlap or lose their small
 * breathing gap. A connected component becomes one cluster, represented by
 * the real marker nearest its visual centre. Every cross-component pair is
 * separated on at least one axis, so representative hit targets cannot stack.
 */
export function groupCollidingMobileMarkers<T>(
  points: readonly MobileMarkerPoint<T>[],
  minimumSeparation = 52,
): MobileMarkerGroup<T>[] {
  if (points.length === 0) return [];

  const parents = points.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  points.forEach((left, leftIndex) => {
    points.slice(leftIndex + 1).forEach((right, relativeIndex) => {
      if (
        Math.abs(left.x - right.x) < minimumSeparation &&
        Math.abs(left.y - right.y) < minimumSeparation
      ) {
        union(leftIndex, leftIndex + relativeIndex + 1);
      }
    });
  });

  const components = new Map<number, MobileMarkerPoint<T>[]>();
  points.forEach((point, index) => {
    const root = find(index);
    components.set(root, [...(components.get(root) ?? []), point]);
  });

  return Array.from(components.values()).map((members) => {
    const centre = members.reduce(
      (total, member) => ({
        x: total.x + member.x / members.length,
        y: total.y + member.y / members.length,
      }),
      { x: 0, y: 0 },
    );
    const representative = members
      .slice()
      .sort(
        (left, right) =>
          Math.hypot(left.x - centre.x, left.y - centre.y) -
            Math.hypot(right.x - centre.x, right.y - centre.y) ||
          left.id.localeCompare(right.id),
      )[0];
    const sorted = members
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id));

    return {
      id: sorted.map((member) => member.id).join("--"),
      items: sorted.map((member) => member.item),
      representative,
    };
  });
}
