import type { FairLayoutBooth, FairLayoutVendor } from "@/lib/fair/layout";

type Box = { x: number; y: number; width: number; height: number };
export type FairVendorMapLabel = Box & {
  vendorId: string;
  boothId: string;
  name: string;
  displayName: string;
  boothLabel: string;
  anchorX: number;
  anchorY: number;
  selected: boolean;
};

export function boxesOverlap(a: Box, b: Box, gap = 8): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** Place a bounded set of readable labels in screen space, not geographic space.
 * One visible source rectangle anchors each label. Nearby labels never overlap;
 * the complete names and all booths remain available in the native list.
 */
export function layoutFairVendorLabels({ booths, vendors, viewBox, viewport, selectedBoothId, highlightedIds }: {
  booths: readonly FairLayoutBooth[];
  vendors: readonly FairLayoutVendor[];
  viewBox: Box;
  viewport: { width: number; height: number };
  selectedBoothId: string | null;
  highlightedIds: ReadonlySet<string>;
}): FairVendorMapLabel[] {
  const scale = viewport.width / viewBox.width;
  const visible = booths.flatMap((booth) => {
    const angle = booth.rotationDeg * Math.PI / 180;
    const x = (booth.x + booth.width / 2 * Math.cos(angle) - booth.height / 2 * Math.sin(angle) - viewBox.x) * scale;
    const y = (booth.y + booth.width / 2 * Math.sin(angle) + booth.height / 2 * Math.cos(angle) - viewBox.y) * scale;
    return x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height ? [{ booth, x, y }] : [];
  });
  const candidates = vendors.flatMap((vendor) => {
    const assigned = visible.filter(({ booth }) => booth.vendorIds.includes(vendor.id)).sort((a, b) =>
      Number(b.booth.id === selectedBoothId) - Number(a.booth.id === selectedBoothId)
      || Number(highlightedIds.has(b.booth.id)) - Number(highlightedIds.has(a.booth.id))
      || (a.x - viewport.width / 2) ** 2 + (a.y - viewport.height / 2) ** 2 - (b.x - viewport.width / 2) ** 2 - (b.y - viewport.height / 2) ** 2);
    if (!assigned.length) return [];
    const anchor = assigned[0];
    return [{ vendor, ...anchor, selected: vendor.boothIds.includes(selectedBoothId ?? ""), matching: assigned.some(({ booth }) => highlightedIds.has(booth.id)) }];
  }).sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.matching) - Number(a.matching)
    // The Fair's featured local collaboration should remain findable in its
    // crowded row even before someone types its name.
    || Number(b.vendor.richProfileId === "vendor-white-rabbit-rad-pies") - Number(a.vendor.richProfileId === "vendor-white-rabbit-rad-pies")
    || Number(Boolean(b.vendor.richProfileId)) - Number(Boolean(a.vendor.richProfileId)) || a.vendor.name.localeCompare(b.vendor.name));
  const labels: FairVendorMapLabel[] = [];
  const maxLabels = viewport.width < 500 ? 5 : 10;
  for (const candidate of candidates) {
    if (labels.length >= maxLabels) break;
    const maxCharacters = viewport.width < 500 ? 24 : 29;
    const displayName = candidate.vendor.name.length > maxCharacters ? `${candidate.vendor.name.slice(0, maxCharacters - 1).trimEnd()}…` : candidate.vendor.name;
    const width = Math.min(viewport.width - 24, Math.max(100, displayName.length * 6.5 + 22));
    const height = 44;
    const { x, y } = candidate;
    const placements = [
      { x: x - width / 2, y: y - height - 14 },
      { x: x - width / 2, y: y + 14 },
      { x: x + 18, y: y - height / 2 },
      { x: x - width - 18, y: y - height / 2 },
      { x: x - width / 2, y: y - height - 62 },
      { x: x - width / 2, y: y + 62 },
    ];
    const placement = placements.map((point) => ({ ...point, x: Math.max(8, Math.min(viewport.width - width - 8, point.x)), width, height }))
      .find((box) => box.y >= 8 && box.y + height <= viewport.height - 80 && !labels.some((placed) => boxesOverlap(box, placed)));
    if (!placement) continue;
    labels.push({ ...placement, vendorId: candidate.vendor.id, boothId: candidate.booth.id, name: candidate.vendor.name, displayName, boothLabel: candidate.booth.label, anchorX: x, anchorY: y, selected: candidate.selected });
  }
  return labels;
}
