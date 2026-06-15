/**
 * Category marker images for the map.
 *
 * A category-colored disc with a white center and a crisp white vector
 * icon (one strong icon per macro category, drawn with canvas paths so
 * it stays sharp at small marker size, where thin line icons would muddy
 * and emoji render inconsistently per device).
 *
 * Served via the `styleimagemissing` event so it survives style reloads
 * and mount ordering. Drawn at 2x for retina crispness.
 */
import type { Map as GLMap } from "mapbox-gl";
import { CATEGORY_BY_SLUG } from "@/data/categories";

const DEFAULT_COLOR = "#E14328";

type Bucket =
  | "food" | "brewery" | "wine" | "bar" | "coffee" | "bakery"
  | "outdoors" | "arts" | "music" | "family" | "library" | "shopping"
  | "wellness" | "civic" | "services" | "lodging" | "transit" | "parking"
  | "restroom" | "water" | "trash" | "recycle" | "dogwaste" | "bench"
  | "bike" | "aed" | "shelter" | "picnic" | "wifi" | "ev" | "publicart" | "pin";

// Consumer drink/food categories get their OWN mark, not one generic
// fork. A brewery, winery, bar, coffee shop, and bakery should read
// distinctly at a glance; collapsing them was the "everything looks the
// same" problem. Live music is split off from the arts frame too.
const BUCKET: Record<string, Bucket> = {
  food: "food", restaurant: "food", pizza: "food", "food-truck": "food",
  bakery: "bakery", bar: "bar", brewery: "brewery", coffee: "coffee",
  winery: "wine", wine: "wine", cidery: "wine", distillery: "wine",
  outdoors: "outdoors", park: "outdoors", trail: "outdoors", playground: "outdoors",
  arts: "arts", museum: "arts", gallery: "arts", theater: "arts", music: "music",
  family: "family",
  library: "library", "book-store": "library",
  shopping: "shopping", antiques: "shopping", market: "shopping",
  wellness: "wellness", yoga: "wellness", pharmacy: "wellness",
  civic: "civic", government: "civic", voting: "civic", "public-safety": "civic",
  services: "services", hardware: "services",
  lodging: "lodging",
  transit: "transit",
  parking: "parking",
  // Public micro-amenities — the things people actually need on the ground.
  restroom: "restroom",
  water: "water",
  trash: "trash",
  recycling: "recycle",
  "dog-waste": "dogwaste",
  bench: "bench",
  picnic: "picnic",
  "bike-parking": "bike",
  "bike-repair": "bike",
  defibrillator: "aed",
  shelter: "shelter",
  wifi: "wifi",
  "ev-charging": "ev",
  "public-art": "publicart",
};

export function bucketOf(slug: string): Bucket {
  if (BUCKET[slug]) return BUCKET[slug];
  const parent = CATEGORY_BY_SLUG[slug]?.parent;
  return (parent && BUCKET[parent]) || "pin";
}

/** Cluster tint per macro bucket — a glance tells you what an area is. */
export const BUCKET_COLOR: Record<Bucket, string> = {
  food: "#A03A22", brewery: "#C99632", wine: "#6E2233", bar: "#7E1F1F",
  coffee: "#8B5A2B", bakery: "#C9852B", music: "#9B3F8A",
  outdoors: "#1E6B3A", arts: "#7E2C6F", family: "#B26B00",
  library: "#2F5470", shopping: "#B26B00", wellness: "#A02929",
  civic: "#2F5470", services: "#4A4A48", lodging: "#5B3A8F",
  transit: "#2F5470", parking: "#4A4A48",
  restroom: "#2F5470", water: "#2F5470", trash: "#4A4A48", recycle: "#1E6B3A",
  dogwaste: "#1E6B3A", bench: "#4A4A48", bike: "#1E6B3A", aed: "#A02929",
  shelter: "#4A4A48", picnic: "#1E6B3A", wifi: "#2F5470", ev: "#1E6B3A",
  publicart: "#9B3F8A",
  pin: "#7A7975",
};

function colorOf(slug: string): string {
  if (slug === "_default") return DEFAULT_COLOR;
  const c = CATEGORY_BY_SLUG[slug];
  return c?.color ?? (c?.parent ? CATEGORY_BY_SLUG[c.parent]?.color : undefined) ?? DEFAULT_COLOR;
}

/** Draw a bold white icon centered at (x,y). Designed to read at ~18px. */
function drawIcon(ctx: CanvasRenderingContext2D, b: Bucket, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const rr = (rx: number, ry: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
    ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
    ctx.arcTo(rx, ry + h, rx, ry, r);
    ctx.arcTo(rx, ry, rx + w, ry, r);
    ctx.closePath();
  };
  switch (b) {
    case "food": // fork + knife
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-5, 8); ctx.moveTo(-8, -8); ctx.lineTo(-8, -3); ctx.moveTo(-2, -8); ctx.lineTo(-2, -3);
      ctx.moveTo(-8, -3); ctx.lineTo(-2, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(6, 8); ctx.lineTo(3, 8); ctx.quadraticCurveTo(2, -2, 6, -8); ctx.fill();
      break;
    case "brewery": { // beer mug with foam + handle
      ctx.beginPath();
      ctx.arc(-3.5, -6, 2.4, 0, Math.PI * 2);
      ctx.arc(0, -7.6, 2.7, 0, Math.PI * 2);
      ctx.arc(3.5, -6, 2.4, 0, Math.PI * 2);
      ctx.fill();
      rr(-6, -4, 10, 13, 2); ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(6.5, 2.5, 3.4, Math.PI * 1.45, Math.PI * 0.55); ctx.stroke();
      break;
    }
    case "wine": // wine glass
      ctx.beginPath();
      ctx.moveTo(-5, -8); ctx.lineTo(5, -8);
      ctx.quadraticCurveTo(5, 0, 0, 1.5);
      ctx.quadraticCurveTo(-5, 0, -5, -8);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 1.5); ctx.lineTo(0, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4.5, 9); ctx.lineTo(4.5, 9); ctx.stroke();
      break;
    case "bar": // martini glass
      ctx.beginPath();
      ctx.moveTo(-8, -7); ctx.lineTo(8, -7); ctx.lineTo(0, 1.5); ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 1.5); ctx.lineTo(0, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4.5, 9); ctx.lineTo(4.5, 9); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(2.6, -3, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      break;
    case "coffee": // to-go cup
      ctx.fillRect(-6.5, -8.5, 13, 2.7);
      ctx.fillRect(-2, -10.5, 4, 2);
      ctx.beginPath();
      ctx.moveTo(-6, -5.5); ctx.lineTo(6, -5.5); ctx.lineTo(4.4, 9); ctx.lineTo(-4.4, 9);
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.fillRect(-5.4, 0, 10.8, 3); ctx.restore();
      break;
    case "bakery": // cupcake
      ctx.beginPath();
      ctx.moveTo(-5.6, 0.5); ctx.lineTo(5.6, 0.5); ctx.lineTo(4, 9.5); ctx.lineTo(-4, 9.5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.arc(-3, -2, 3, 0, Math.PI * 2);
      ctx.arc(3, -2, 3, 0, Math.PI * 2);
      ctx.arc(0, -5, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(0, -7.6, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      break;
    case "outdoors": { // pine tree
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.closePath();
      ctx.moveTo(0, -3); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill();
      ctx.fillRect(-1.5, 5, 3, 4);
      break;
    }
    case "arts": // framed image: square + sun + hill
      rr(-8, -7, 16, 14, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(-3, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(0, -1); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill();
      break;
    case "music": // eighth note
      ctx.beginPath(); ctx.ellipse(-3, 6, 4, 3, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(1, 5.5); ctx.lineTo(1, -8); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, -8);
      ctx.quadraticCurveTo(7.5, -6.5, 6, 0.5);
      ctx.quadraticCurveTo(6.5, -4, 1, -3.5);
      ctx.closePath(); ctx.fill();
      break;
    case "family": // two people
      ctx.beginPath(); ctx.arc(-4, -4, 2.6, 0, Math.PI * 2); ctx.arc(4, -4, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(-4, 0, 0, 8); ctx.quadraticCurveTo(4, 0, 8, 8); ctx.lineTo(-8, 8); ctx.fill();
      break;
    case "library": // book
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(-7, -9, -8, -6); ctx.lineTo(-8, 7); ctx.quadraticCurveTo(-7, 5, 0, 7);
      ctx.quadraticCurveTo(7, 5, 8, 7); ctx.lineTo(8, -6); ctx.quadraticCurveTo(7, -9, 0, -7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0)"; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(255,255,255,0)"; ctx.stroke();
      break;
    case "shopping": // bag
      ctx.beginPath(); ctx.arc(0, -5, 3.4, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-5.5, 9); ctx.lineTo(5.5, 9); ctx.lineTo(7, -3); ctx.closePath(); ctx.fill();
      break;
    case "wellness": // heart
      ctx.beginPath(); ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-10, -1, -5, -9, 0, -3);
      ctx.bezierCurveTo(5, -9, 10, -1, 0, 8);
      ctx.closePath(); ctx.fill();
      break;
    case "civic": // columned building
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(9, -3); ctx.lineTo(-9, -3); ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 2.4, 9); ctx.fillRect(-1.2, -1, 2.4, 9); ctx.fillRect(4.6, -1, 2.4, 9);
      ctx.fillRect(-9, 8, 18, 2.4);
      break;
    case "services": { // gear
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
        const a2 = a + Math.PI / 8;
        ctx.lineTo(Math.cos(a2) * 6.5, Math.sin(a2) * 6.5);
      }
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      break;
    }
    case "lodging": // bed
      ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(-9, -3); ctx.lineTo(0, -3);
      ctx.quadraticCurveTo(2, -3, 2, -1); ctx.lineTo(9, -1); ctx.lineTo(9, 2); ctx.stroke();
      ctx.fillRect(-9, 2, 18, 2.6);
      ctx.beginPath(); ctx.arc(-5.5, -1, 2.4, Math.PI, 0); ctx.fill();
      break;
    case "transit": // bus
      rr(-8, -8, 16, 13, 3); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.fillRect(-6, -5.5, 5, 4); ctx.fillRect(1, -5.5, 5, 4); ctx.restore();
      ctx.beginPath(); ctx.arc(-4.5, 7, 2, 0, Math.PI * 2); ctx.arc(4.5, 7, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case "parking": // bold P
      ctx.font = "bold 19px ui-sans-serif, system-ui, -apple-system, Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("P", 0, 1);
      break;
    case "restroom": // WC
      ctx.font = "bold 13px ui-sans-serif, system-ui, -apple-system, Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("WC", 0, 1);
      break;
    case "water": // droplet
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.bezierCurveTo(7, -1, 7, 3, 0, 8);
      ctx.bezierCurveTo(-7, 3, -7, -1, 0, -9);
      ctx.closePath(); ctx.fill();
      break;
    case "trash": // can with lid
      ctx.fillRect(-6.5, -3, 13, 2.4);
      ctx.fillRect(-1.8, -6, 3.6, 2);
      ctx.beginPath();
      ctx.moveTo(-5.4, 0); ctx.lineTo(5.4, 0); ctx.lineTo(4.2, 9.5); ctx.lineTo(-4.2, 9.5);
      ctx.closePath(); ctx.fill();
      break;
    case "recycle": { // loop arrow
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 7, Math.PI * 0.2, Math.PI * 1.65);
      ctx.stroke();
      const ea = Math.PI * 0.2;
      const ex = Math.cos(ea) * 7, ey = Math.sin(ea) * 7;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 4.5, ey - 1.5);
      ctx.lineTo(ex - 1, ey + 4);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "dogwaste": // paw print
      ctx.beginPath(); ctx.ellipse(0, 3.5, 4.6, 3.7, 0, 0, Math.PI * 2); ctx.fill();
      for (const [tx, ty] of [[-5.2, -2.6], [-1.8, -6], [1.8, -6], [5.2, -2.6]] as const) {
        ctx.beginPath(); ctx.arc(tx, ty, 2.1, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case "bench": // side profile
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(8, 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(-8, -7); ctx.moveTo(8, 1); ctx.lineTo(8, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(8, -5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(-6, 8); ctx.moveTo(6, 1); ctx.lineTo(6, 8); ctx.stroke();
      break;
    case "bike": // two wheels + frame
      ctx.lineWidth = 1.9;
      ctx.beginPath(); ctx.arc(-5, 4, 3.8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(5, 4, 3.8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(0, 4); ctx.lineTo(2, -3.5); ctx.lineTo(5, 4);
      ctx.moveTo(0, 4); ctx.lineTo(-1, -3.5); ctx.lineTo(4, -3.5);
      ctx.stroke();
      break;
    case "aed": // heart with a bolt cut out
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-10, -1, -5, -9, 0, -3);
      ctx.bezierCurveTo(5, -9, 10, -1, 0, 8);
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(1.5, -4); ctx.lineTo(-3.5, 1.5); ctx.lineTo(-0.3, 1.5);
      ctx.lineTo(-1.5, 6); ctx.lineTo(4, -0.5); ctx.lineTo(0.6, -0.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    case "shelter": // roof + posts
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(9.5, -1); ctx.lineTo(-9.5, -1);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 2.2, 9);
      ctx.fillRect(4.8, -1, 2.2, 9);
      break;
    case "picnic": // table side profile
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-9, -3.5); ctx.lineTo(9, -3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -3.5); ctx.lineTo(-8.5, 8); ctx.moveTo(6, -3.5); ctx.lineTo(8.5, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, 3); ctx.lineTo(9, 3); ctx.stroke();
      break;
    case "wifi": // signal arcs + dot
      ctx.lineWidth = 2.4;
      for (const r of [11, 7.5, 4]) {
        ctx.beginPath();
        ctx.arc(0, 7, r, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 7, 1.7, 0, Math.PI * 2); ctx.fill();
      break;
    case "ev": // lightning bolt (EV charging)
      ctx.beginPath();
      ctx.moveTo(2.5, -9);
      ctx.lineTo(-5, 1.5);
      ctx.lineTo(-0.5, 1.5);
      ctx.lineTo(-2.5, 9);
      ctx.lineTo(5, -1.5);
      ctx.lineTo(0.5, -1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case "publicart": // ring sculpture on a pedestal
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, -2, 5.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillRect(-1.3, 3, 2.6, 4);
      ctx.fillRect(-6, 7, 12, 2.6);
      break;
    default: // location pin
      ctx.beginPath();
      ctx.arc(0, -3, 6, Math.PI * 0.85, Math.PI * 0.15);
      ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(0, -3, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      break;
  }
  ctx.restore();
}

function drawPuck(color: string, b: Bucket): ImageData {
  const R = 2;
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

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + outer + 2, outer * 0.6, outer * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#141810";
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  drawIcon(ctx, b, cx, cy);

  return ctx.getImageData(0, 0, W * R, H * R);
}

function addOne(map: GLMap, id: string): void {
  if (map.hasImage(id)) return;
  const slug = id.startsWith("cat-") ? id.slice(4) : "_default";
  try {
    map.addImage(id, drawPuck(colorOf(slug), bucketOf(slug)), { pixelRatio: 2 });
  } catch {
    /* already added by a concurrent styleimagemissing */
  }
}

/**
 * Wire up category markers. The styleimagemissing handler is the
 * guarantee; the eager pass just avoids a one-frame flash.
 */
export function installCategoryMarkers(map: GLMap): void {
  const addAll = () => {
    addOne(map, "cat-_default");
    for (const slug of Object.keys(CATEGORY_BY_SLUG)) addOne(map, `cat-${slug}`);
  };
  map.on("styleimagemissing", (e: { id: string }) => {
    if (e.id && e.id.startsWith("cat-")) addOne(map, e.id);
  });
  // Mapbox loads its style asynchronously after onLoad, which clears
  // images added before the style settled. Re-add on every style load
  // (idempotent via hasImage) so category icons survive.
  map.on("style.load", addAll);
  addAll();
}
