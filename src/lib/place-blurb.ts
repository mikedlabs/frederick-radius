/**
 * The one honest place summary. The DFP dataset is ~70% scraped
 * fragments (AUDIT.md §5). We will not surface that as prose, and we
 * will not invent a description to fill the gap (AGENTS.md: never
 * invent data; STYLE.md rule 10: if unsure, say less).
 *
 * So: if the stored blurb passes the STYLE.md detector
 * (`classifyDescription`), show it. Otherwise compose ONE true
 * sentence from verifiable structured fields only — category, derived
 * cuisine, municipality — which is honest, STYLE.md-clean, and never
 * fabricated. Returns null only when there is not even structured
 * signal, so the caller shows the category alone rather than filler.
 *
 * Pure. Routed through by every prose surface (PlaceSheet, the
 * feature card) so scraped copy has exactly one gate, not many.
 */
import { classifyDescription } from "./copy-quality";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { primaryCuisineOf, cuisineLabel } from "./cuisine";

type PlaceLike = {
  name?: string;
  short_blurb?: string;
  category?: string;
  municipality?: string;
  subcategories?: string[];
};

// Category → a plain, true noun phrase. No hype, STYLE.md-safe.
const CATEGORY_NOUN: Record<string, string> = {
  restaurant: "restaurant",
  food: "restaurant",
  coffee: "coffee shop",
  bar: "bar",
  brewery: "brewery",
  bakery: "bakery",
  pizza: "pizza spot",
  "food-truck": "food truck",
  park: "park",
  trail: "trail",
  playground: "playground",
  outdoors: "park",
  museum: "museum",
  gallery: "gallery",
  theater: "theater",
  music: "music venue",
  arts: "arts venue",
  "public-art": "public artwork",
  library: "library",
  family: "family spot",
  sports: "sports venue",
  market: "market",
  shopping: "shop",
  antiques: "antique shop",
  "book-store": "bookshop",
  wellness: "wellness studio",
  yoga: "fitness studio",
  lodging: "place to stay",
  hotel: "hotel",
  civic: "civic building",
  government: "government office",
  "public-safety": "public-safety station",
  worship: "place of worship",
  services: "local business",
  pharmacy: "pharmacy",
  hardware: "hardware store",
  transit: "transit stop",
  parking: "parking",
};

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}

/** Strip a leading name-echo ("Joe's Joe's …" / "Joe's · …"). */
function stripNameEcho(name: string, blurb: string): string {
  if (!name) return blurb;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return blurb.replace(new RegExp(`^(?:${esc}\\s*[·\\-–—:]?\\s*)+`, "i"), "").trim();
}

export function placeBlurb(place: PlaceLike): string | null {
  const name = (place.name ?? "").trim();
  const raw = (place.short_blurb ?? "").trim();

  // 1. A real, STYLE.md-clean description wins.
  const quality = classifyDescription(name, raw);
  if (raw && (quality === "auto_clean" || quality === "reviewed")) {
    const cleaned = stripNameEcho(name, raw);
    // Re-check: stripping the echo can leave bare boilerplate.
    if (cleaned.length >= 16 && classifyDescription(name, cleaned) !== "scraped") {
      return cleaned;
    }
  }

  // 2. Honest composed fallback — verifiable structured facts only.
  const cat = place.category ?? "";
  const noun =
    CATEGORY_NOUN[cat] ??
    (CATEGORY_BY_SLUG[cat]?.name ? CATEGORY_BY_SLUG[cat].name.toLowerCase() : null);
  if (!noun) return null;

  let lead = noun;
  if (cat === "restaurant" || cat === "food") {
    const c = primaryCuisineOf({
      name,
      short_blurb: raw,
      category: cat,
      subcategories: place.subcategories,
    });
    if (c && c !== "american") {
      // "Italian", "Thai", "Spanish" — first token of the label.
      const word = cuisineLabel(c).split(/[ /]/)[0];
      lead = `${word} ${noun}`;
    }
  }

  const town = place.municipality
    ? MUNICIPALITY_BY_SLUG[place.municipality]?.name
    : undefined;
  const art = article(lead);
  return town ? `${art} ${lead} in ${town}.` : `${art} ${lead}.`;
}
