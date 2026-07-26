/**
 * In-app actions for a place — so users do things without leaving the app.
 *
 * Key idea: we do NOT need per-place reservation/order IDs populated.
 * Search-prefilled deep links (name + Frederick MD) reliably land the user
 * on the right OpenTable / Resy / DoorDash page — exactly how Google Maps
 * and Yelp implement "Reserve". Exact IDs (opentable_id, resy_slug,
 * order_url) are used when present for a direct link; otherwise the
 * prefilled search is the graceful, always-correct fallback.
 */
import type { Place } from "@/data/places";
import { parkMobileWebUrl, parkMobileFindUrl, openTableUrl, resyUrl } from "@/lib/integrations/deeplinks";
import { BRAND } from "@/lib/brand";

export type PlaceAction = {
  key: string;
  label: string;
  href: string;
  external: boolean;
  /** lucide icon name resolved in the component */
  icon:
    | "directions"
    | "call"
    | "website"
    | "reserve"
    | "order"
    | "parking"
    | "instagram"
    | "menu";
  /** brand-ish accent for the pill */
  accent: string;
};

// Exported for the place page's Website action: on a food place the
// website IS the menu answer, so the label says so ("Website · menu").
export const FOOD_CATS = new Set(["restaurant", "bar", "brewery", "pizza", "bakery", "coffee", "food", "food-truck"]);
const RESERVE_CATS = new Set(["restaurant", "bar", "brewery"]);

function q(s: string): string {
  return encodeURIComponent(s.trim());
}

export function placeActions(p: Place): PlaceAction[] {
  const actions: PlaceAction[] = [];
  const nameCity = `${p.name} ${p.city ?? "Frederick"} MD`;

  // Directions — always available (we always have coords)
  actions.push({
    key: "directions",
    label: "Directions",
    href: `https://maps.apple.com/?q=${q(p.name)}&ll=${p.geom.lat},${p.geom.lng}`,
    external: true,
    icon: "directions",
    accent: "var(--app-cool)",
  });

  // Call
  if (p.phone) {
    actions.push({
      key: "call",
      label: "Call",
      href: `tel:${p.phone.replace(/[^0-9+]/g, "")}`,
      external: false,
      icon: "call",
      accent: "var(--app-positive)",
    });
  }

  // Reserve a table — restaurants/bars/breweries
  if (RESERVE_CATS.has(p.category)) {
    if (p.opentable_id) {
      // opentable_id is the restref integer (per places.ts). It must go
      // through the restref client redirect, NOT /r/restaurant/profile/
      // — the latter expects a slug and 404s on a restref id. One source
      // of truth for the URL lives in deeplinks.openTableUrl.
      actions.push({
        key: "reserve",
        label: "Reserve",
        href: openTableUrl(p.opentable_id),
        external: true,
        icon: "reserve",
        accent: "var(--app-brand)",
      });
    } else if (p.resy_slug) {
      actions.push({
        key: "reserve",
        label: "Reserve",
        href: resyUrl(p.resy_slug),
        external: true,
        icon: "reserve",
        accent: "var(--app-brand)",
      });
    } else {
      // Prefilled OpenTable search — always lands correctly, no ID needed
      actions.push({
        key: "reserve",
        label: "Reserve",
        href: `https://www.opentable.com/s?term=${q(p.name)}&covers=2&latitude=${p.geom.lat}&longitude=${p.geom.lng}`,
        external: true,
        icon: "reserve",
        accent: "var(--app-brand)",
      });
    }
  }

  // Order / delivery — food categories
  if (FOOD_CATS.has(p.category)) {
    if (p.order_url) {
      actions.push({ key: "order", label: "Order", href: p.order_url, external: true, icon: "order", accent: BRAND.colors.brick });
    } else if (p.doordash_url) {
      actions.push({ key: "order", label: "DoorDash", href: p.doordash_url, external: true, icon: "order", accent: BRAND.colors.brick });
    } else {
      actions.push({
        key: "order",
        label: "Order",
        href: `https://www.doordash.com/search/store/${q(nameCity)}`,
        external: true,
        icon: "order",
        accent: BRAND.colors.brick,
      });
    }
    if (p.menu_url) {
      actions.push({ key: "menu", label: "Menu", href: p.menu_url, external: true, icon: "menu", accent: "var(--app-ink-2)" });
    }
  }

  // Parking. Verified zone → that ParkMobile session. A parking place
  // without a verified zone → ParkMobile to enter the zone off the sign
  // (never a fabricated zone). Any other destination → find parking
  // near it on the map. Shared helpers keep this in sync with deeplinks.
  const hasZone = Boolean(p.parkmobile_zone && p.parkmobile_zone !== "needs_verification");
  actions.push({
    key: "parking",
    label: hasZone
      ? `Park · Zone ${p.parkmobile_zone}`
      : p.category === "parking"
        ? "Park · ParkMobile"
        : "Park nearby",
    href: hasZone
      ? parkMobileWebUrl(p.parkmobile_zone as string)
      : p.category === "parking"
        ? parkMobileFindUrl()
        : `https://www.google.com/maps/search/parking/@${p.geom.lat},${p.geom.lng},16z`,
    external: true,
    icon: "parking",
    accent: "#4A4A48",
  });

  // Website
  if (p.website) {
    actions.push({ key: "website", label: "Website", href: p.website, external: true, icon: "website", accent: "var(--app-ink-2)" });
  }

  // Instagram
  if (p.instagram) {
    actions.push({
      key: "instagram",
      label: "Instagram",
      href: `https://instagram.com/${p.instagram.replace(/^@/, "")}`,
      external: true,
      icon: "instagram",
      accent: "#C13584",
    });
  }

  return actions;
}

export type PlaceActionGroups = {
  primary: PlaceAction | null;
  secondary: PlaceAction[];
  more: PlaceAction[];
};

/**
 * Turn a place's capability list into an action hierarchy for compact sheets.
 *
 * Directions is the reliable default outcome for a discovery sheet. Parking
 * destinations promote their actual parking action instead. At most two
 * neutral secondary actions stay visible; the rest remain available under a
 * disclosure instead of becoming a row of equally saturated provider pills.
 */
export function groupPlaceActions(
  actions: PlaceAction[],
  category: string,
): PlaceActionGroups {
  if (actions.length === 0) {
    return { primary: null, secondary: [], more: [] };
  }

  const primaryKey =
    category === "parking" && actions.some((action) => action.key === "parking")
      ? "parking"
      : actions.some((action) => action.key === "directions")
        ? "directions"
        : actions[0].key;
  const primary = actions.find((action) => action.key === primaryKey) ?? null;
  const secondaryOrder = [
    "reserve",
    "call",
    "order",
    "menu",
    "website",
    "parking",
    "instagram",
    "directions",
  ];
  const rank = new Map(secondaryOrder.map((key, index) => [key, index]));
  const remaining = actions
    .filter((action) => action !== primary)
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      const rankA = rank.get(a.action.key) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rank.get(b.action.key) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB || a.index - b.index;
    })
    .map(({ action }) => action);

  return {
    primary,
    secondary: remaining.slice(0, 2),
    more: remaining.slice(2),
  };
}
