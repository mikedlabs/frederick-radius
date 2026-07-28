/**
 * In-app actions for a place — so users do things without leaving the app.
 *
 * Direct IDs and URLs are capabilities: Reserve and Order. Provider-wide
 * searches are discovery fallbacks and say so explicitly. Keeping those two
 * states separate prevents the sheet from implying that a restaurant accepts
 * online reservations or orders when Radius has not confirmed that it does.
 */
import type { Place } from "@/data/places";
import {
  commerceActionLabel,
  isCommerceSearchLink,
  resolveCommerceLinks,
} from "@/lib/commerce/links";
import { parkMobileWebUrl, parkMobileFindUrl } from "@/lib/integrations/deeplinks";
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

export const FOOD_CATS = new Set(["restaurant", "bar", "brewery", "pizza", "bakery", "coffee", "food", "food-truck"]);
const RESERVE_CATS = new Set(["restaurant", "bar", "brewery"]);

function q(s: string): string {
  return encodeURIComponent(s.trim());
}

export function placeActions(p: Place): PlaceAction[] {
  const actions: PlaceAction[] = [];
  const nameCity = `${p.name} ${p.city ?? "Frederick"} MD`;
  const directCommerce = resolveCommerceLinks(p).filter(
    (link) => !isCommerceSearchLink(link),
  );
  const directReservation = directCommerce.find(
    (link) => link.type === "reservation",
  );
  const directOrder =
    directCommerce.find((link) => link.type === "order") ??
    directCommerce.find((link) => link.type === "delivery");
  const directMenu = directCommerce.find((link) => link.type === "menu");

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

  // A direct, source-backed capability wins even when an upstream category is
  // imperfect. Only dining categories without one receive the honest search
  // fallback.
  if (directReservation) {
    actions.push({
      key: "reserve",
      label: commerceActionLabel(directReservation),
      href: directReservation.url,
      external: true,
      icon: "reserve",
      accent: "var(--app-brand)",
    });
  } else if (RESERVE_CATS.has(p.category)) {
    actions.push({
      key: "reserve-search",
      label: "Search OpenTable",
      href: `https://www.opentable.com/s?term=${q(p.name)}&covers=2&latitude=${p.geom.lat}&longitude=${p.geom.lng}`,
      external: true,
      icon: "reserve",
      accent: "var(--app-brand)",
    });
  }

  if (directOrder) {
    actions.push({
      key: "order",
      label: commerceActionLabel(directOrder),
      href: directOrder.url,
      external: true,
      icon: "order",
      accent: BRAND.colors.brick,
    });
  } else if (FOOD_CATS.has(p.category)) {
    actions.push({
      key: "order-search",
      label: "Search DoorDash",
      href: `https://www.doordash.com/search/store/${q(nameCity)}`,
      external: true,
      icon: "order",
      accent: BRAND.colors.brick,
    });
  }
  if (directMenu) {
    actions.push({
      key: "menu",
      label: commerceActionLabel(directMenu),
      href: directMenu.url,
      external: true,
      icon: "menu",
      accent: "var(--app-ink-2)",
    });
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
    // Provider searches are fallbacks, not confirmed capabilities. They stay
    // behind direct actions and the business's own website.
    "reserve-search",
    "order-search",
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
