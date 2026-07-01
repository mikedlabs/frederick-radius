/**
 * Commerce-link resolution + presentation helpers. Pure and side-effect-free,
 * so both server components (place detail) and client cards import it freely.
 *
 * The resolver UNIFIES two sources into one CommerceLink[]:
 *   1. The normalized `commerce_links` array on a place (curated/owner data).
 *   2. The legacy flat fields already in the dataset (order_url, menu_url,
 *      doordash_url, opentable_id, …), mapped through the SAME verified URL
 *      builders the app already ships (openTableUrl/resyUrl). No data is lost
 *      and no new URL formats are guessed.
 *
 * Provider is detected from the real URL host, so "Toast" only ever appears
 * when a link genuinely points at Toast — never assumed, never scraped.
 */

import type { Place } from "@/data/places";
import { openTableUrl, resyUrl } from "@/lib/integrations/deeplinks";
import type {
  CommerceLink,
  CommerceLinkType,
  CommerceProvider,
} from "./types";

// ─── Provider detection + labels ────────────────────────────────────────

const PROVIDER_HOSTS: Array<[RegExp, CommerceProvider]> = [
  [/(^|\.)toasttab\.com$/, "toast"],
  [/(^|\.)(squareup\.com|square\.site)$/, "square"],
  [/(^|\.)clover\.com$/, "clover"],
  [/(^|\.)doordash\.com$/, "doordash"],
  [/(^|\.)ubereats\.com$/, "ubereats"],
  [/(^|\.)grubhub\.com$/, "grubhub"],
  [/(^|\.)opentable\.com$/, "opentable"],
  [/(^|\.)resy\.com$/, "resy"],
];

/** Best-effort provider from a URL host. Unknown hosts resolve to "website"
 *  (an honest "their own site"), never to a branded provider we can't confirm. */
export function detectProvider(url: string): CommerceProvider {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  for (const [re, provider] of PROVIDER_HOSTS) {
    if (re.test(host)) return provider;
  }
  return "website";
}

const PROVIDER_LABELS: Record<CommerceProvider, string> = {
  toast: "Toast",
  square: "Square",
  clover: "Clover",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  grubhub: "Grubhub",
  opentable: "OpenTable",
  resy: "Resy",
  website: "Website",
  other: "Link",
};

export function providerLabel(provider: CommerceProvider): string {
  return PROVIDER_LABELS[provider];
}

/** A recognizable brand (vs a plain website/other) — used to decide whether a
 *  provider name is worth surfacing in the trust line. */
export function isBrandedProvider(provider: CommerceProvider): boolean {
  return provider !== "website" && provider !== "other";
}

const SOURCE_LABELS: Record<NonNullable<CommerceLink["source"]>, string> = {
  owner: "Owner-provided",
  curated: "Curated link",
  community: "Community",
  imported: "Imported",
};

// ─── Action labels (Toast-aware, honest) ────────────────────────────────

/** The button text for a link. Toast gets its named treatment ("Order on
 *  Toast" / "View Toast menu"); everything else stays generic and calm. An
 *  explicit `label` on the link always wins. */
export function commerceActionLabel(link: CommerceLink): string {
  if (link.label) return link.label;
  switch (link.type) {
    case "order":
      return link.provider === "toast" ? "Order on Toast" : "Order online";
    case "menu":
      return link.provider === "toast" ? "View Toast menu" : "View menu";
    case "reservation":
      return "Reserve";
    case "delivery":
      // Delivery is provider-branded and recognizable; show the name.
      return isBrandedProvider(link.provider)
        ? providerLabel(link.provider)
        : "Delivery";
    case "catering":
      return "Catering";
    case "gift_card":
      return "Gift card";
    default:
      return "Open link";
  }
}

/** Short, provider-agnostic label for a card pill — cards stay calm, so the
 *  named-provider treatment (Toast etc.) is reserved for the detail page. */
export function commerceCardLabel(link: CommerceLink): string {
  switch (link.type) {
    case "order":
      return "Order";
    case "menu":
      return "Menu";
    case "reservation":
      return "Reserve";
    case "delivery":
      return "Delivery";
    case "catering":
      return "Catering";
    case "gift_card":
      return "Gift card";
    default:
      return "Open";
  }
}

/**
 * The trust line for a link, e.g. "Toast · Verified", "Owner-provided · Updated
 * today", "Curated link · Updated 12 days ago". `checked` is the already-
 * formatted freshness string (from formatChecked); kept as a param so this stays
 * pure and testable without importing the clock.
 */
export function commerceTrustLine(
  link: CommerceLink,
  checked?: string | null,
): string {
  const tokens: string[] = [];
  if (isBrandedProvider(link.provider)) tokens.push(providerLabel(link.provider));
  if (link.is_verified) tokens.push("Verified");
  else if (link.source) tokens.push(SOURCE_LABELS[link.source]);
  if (checked) tokens.push(checked);
  return tokens.join(" · ");
}

// ─── Resolver: place → normalized CommerceLink[] ─────────────────────────

/** Legacy flat fields → normalized links, using the app's own verified URL
 *  builders. Provider is detected from the resulting URL, so a Toast order_url
 *  correctly becomes a Toast link. */
function legacyCommerceLinks(place: Place): CommerceLink[] {
  const out: CommerceLink[] = [];
  const push = (
    type: CommerceLinkType,
    url: string | undefined,
    provider?: CommerceProvider,
  ) => {
    if (!url) return;
    out.push({
      place_id: place.slug,
      type,
      url,
      provider: provider ?? detectProvider(url),
      source: "curated",
    });
  };

  // Reservations — reuse the existing verified builders.
  if (place.opentable_id) push("reservation", openTableUrl(place.opentable_id), "opentable");
  else if (place.resy_slug) push("reservation", resyUrl(place.resy_slug), "resy");

  // Order-ahead + menu (provider detected from host: toasttab.com → toast).
  push("order", place.order_url);
  push("menu", place.menu_url);

  // Delivery marketplaces.
  push("delivery", place.doordash_url, "doordash");
  push("delivery", place.ubereats_url, "ubereats");
  push("delivery", place.grubhub_url, "grubhub");

  return out;
}

/** Normalize a curated link (fill provider/place_id defaults, keep it honest). */
function normalizeLink(link: CommerceLink, placeSlug: string): CommerceLink {
  return {
    ...link,
    place_id: link.place_id ?? placeSlug,
    provider: link.provider ?? detectProvider(link.url),
  };
}

const dedupeKey = (l: CommerceLink) => `${l.type}::${l.url}`;

/**
 * All commerce links for a place, deduped. Curated `commerce_links` take
 * precedence over legacy-derived links with the same (type, url). Returns [] for
 * a place with no commerce data, so callers can cleanly render nothing.
 */
export function resolveCommerceLinks(
  place: Pick<
    Place,
    | "slug"
    | "commerce_links"
    | "opentable_id"
    | "resy_slug"
    | "order_url"
    | "menu_url"
    | "doordash_url"
    | "ubereats_url"
    | "grubhub_url"
  >,
): CommerceLink[] {
  const seen = new Set<string>();
  const out: CommerceLink[] = [];
  const add = (l: CommerceLink) => {
    const url = (l.url ?? "").trim();
    if (!url) return;
    const key = dedupeKey(l);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(l);
  };

  // Curated first (authoritative), then legacy fill-ins.
  for (const l of place.commerce_links ?? []) add(normalizeLink(l, place.slug));
  for (const l of legacyCommerceLinks(place as Place)) add(l);

  return out;
}

// ─── Selection for surfaces ──────────────────────────────────────────────

/** Card priority: a diner deciding on a card cares about Order, then Menu,
 *  then Reserve. Delivery/catering are detail-page depth, not card noise. */
const CARD_TYPE_PRIORITY: CommerceLinkType[] = ["order", "menu", "reservation"];

/** The (at most `max`) commerce actions to show on a card — highest-priority
 *  type first, one link per type, primary link preferred within a type. */
export function selectCardCommerceActions(
  links: CommerceLink[],
  max = 2,
): CommerceLink[] {
  const chosen: CommerceLink[] = [];
  for (const type of CARD_TYPE_PRIORITY) {
    const ofType = links.filter((l) => l.type === type);
    if (ofType.length === 0) continue;
    chosen.push(ofType.find((l) => l.is_primary) ?? ofType[0]);
    if (chosen.length >= max) break;
  }
  return chosen.slice(0, max);
}

/** Detail-page grouping order: menu → order → reserve → delivery → catering →
 *  gift card. Empty groups are omitted so no blank sections render. */
const DETAIL_TYPE_ORDER: CommerceLinkType[] = [
  "menu",
  "order",
  "reservation",
  "delivery",
  "catering",
  "gift_card",
  "other",
];

export function orderCommerceForDetail(links: CommerceLink[]): CommerceLink[] {
  return [...links].sort(
    (a, b) => DETAIL_TYPE_ORDER.indexOf(a.type) - DETAIL_TYPE_ORDER.indexOf(b.type),
  );
}

/** Whether any resolved link genuinely points at Toast — gates the honest
 *  "Toast-connected" affordance. */
export function isToastConnected(links: CommerceLink[]): boolean {
  return links.some((l) => l.provider === "toast");
}

export { SOURCE_LABELS };
