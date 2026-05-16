/**
 * Category marker images for the map.
 *
 * MapLibre renders icons from registered images. We draw one clean "puck"
 * per category on demand: a category-colored disc with a white center and
 * the category glyph, plus a soft shadow.
 *
 * Robustness: instead of racing an eager addImage against layer render
 * (which loses to style reloads and mount ordering), we answer the
 * `styleimagemissing` event. MapLibre fires it with the exact id the
 * symbol layer wants (`cat-<slug>`), we draw it once, and it sticks.
 * Drawn at 2x for retina crispness.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { CATEGORY_BY_SLUG } from "@/data/categories";

const GLYPH: Record<string, string> = {
  food: "\u{1F374}", restaurant: "\u{1F37D}", coffee: "☕",
  bar: "\u{1F378}", brewery: "\u{1F37A}", bakery: "\u{1F950}", pizza: "\u{1F355}",
  "food-truck": "\u{1F69A}",
  outdoors: "\u{1F332}", park: "\u{1F333}", trail: "⛰", playground: "\u{1F6DD}",
  arts: "\u{1F3A8}", museum: "\u{1F3DB}", gallery: "\u{1F5BC}",
  theater: "\u{1F3AD}", music: "\u{1F3B5}",
  family: "\u{1F46A}", library: "\u{1F4DA}",
  shopping: "\u{1F6CD}", antiques: "\u{1FA91}", "book-store": "\u{1F4D6}", market: "\u{1F9FA}",
  wellness: "\u{1F49A}", yoga: "\u{1F9D8}",
  civic: "\u{1F3DB}", government: "\u{1F3DB}", "public-safety": "\u{1F692}", voting: "\u{1F5F3}",
  services: "\u{1F527}", pharmacy: "\u{1F48A}", hardware: "\u{1F528}",
  lodging: "\u{1F3E8}", transit: "\u{1F68C}", parking: "\u{1F17F}",
  restroom: "\u{1F6BB}", water: "\u{1F6B0}", trash: "\u{1F5D1}", recycling: "♻",
  "dog-waste": "\u{1F436}", bench: "\u{1FA91}", picnic: "\u{1F9FA}",
  "bike-parking": "\u{1F6B2}", "bike-repair": "\u{1F6B2}",
  defibrillator: "\u{1F49B}", shelter: "⛱", amenities: "\u{1F6BB}",
};
const DEFAULT_GLYPH = "\u{1F4CD}";
const DEFAULT_COLOR = "#C4451C";

function resolve(slug: string): { color: string; glyph: string } {
  if (slug === "_default") return { color: DEFAULT_COLOR, glyph: DEFAULT_GLYPH };
  const cat = CATEGORY_BY_SLUG[slug];
  const glyph =
    GLYPH[slug] ?? (cat?.parent ? GLYPH[cat.parent] : undefined) ?? DEFAULT_GLYPH;
  const color = cat?.color ?? (cat?.parent ? CATEGORY_BY_SLUG[cat.parent]?.color : undefined) ?? DEFAULT_COLOR;
  return { color, glyph };
}

function drawPuck(color: string, glyph: string): ImageData {
  const R = 2; // pixel ratio
  const W = 46;
  const H = 46;
  const cv = document.createElement("canvas");
  cv.width = W * R;
  cv.height = H * R;
  const ctx = cv.getContext("2d")!;
  ctx.scale(R, R);

  const cx = W / 2;
  const cy = H / 2 - 1;
  const outer = 18;

  // Soft drop shadow
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + outer + 2, outer * 0.6, outer * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#141810";
  ctx.fill();
  ctx.restore();

  // Colored disc with white ring
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  // White center the glyph sits on
  ctx.beginPath();
  ctx.arc(cx, cy, outer - 6.5, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  // Glyph
  ctx.font = '15px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + 0.5);

  return ctx.getImageData(0, 0, W * R, H * R);
}

function addOne(map: MapLibreMap, id: string): void {
  if (map.hasImage(id)) return;
  const slug = id.startsWith("cat-") ? id.slice(4) : "_default";
  const { color, glyph } = resolve(slug);
  try {
    map.addImage(id, drawPuck(color, glyph), { pixelRatio: 2 });
  } catch {
    /* already added by a concurrent styleimagemissing */
  }
}

/**
 * Wire up category markers. The styleimagemissing handler is the
 * guarantee; the eager pass just avoids a one-frame flash.
 */
export function installCategoryMarkers(map: MapLibreMap): void {
  map.on("styleimagemissing", (e: { id: string }) => {
    if (e.id && e.id.startsWith("cat-")) addOne(map, e.id);
  });
  addOne(map, "cat-_default");
  for (const slug of Object.keys(CATEGORY_BY_SLUG)) addOne(map, `cat-${slug}`);
}
