/**
 * Commerce-link layer (Phase 1) — a normalized, provider-agnostic model for the
 * trusted "act on this restaurant" links a place can carry: view a menu, order,
 * reserve, get delivery, book catering. Toast is ONE supported provider, never
 * assumed and never scraped — a link is only "Toast" when its URL is genuinely a
 * Toast URL (see detectProvider in ./links).
 *
 * This file is types only, so it's safe to import from server components, client
 * cards, future admin forms, and the (disabled) API adapter alike.
 */

/** Every provider we can route to. `website`/`other` are the honest catch-alls
 *  for a plain link we won't dress up as a branded integration. */
export const COMMERCE_PROVIDERS = [
  "toast",
  "square",
  "clover",
  "doordash",
  "ubereats",
  "grubhub",
  "opentable",
  "resy",
  "website",
  "other",
] as const;
export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

/** What the link lets the user DO. Keeps "order" (order-ahead / pickup, e.g.
 *  Toast/Olo) distinct from "delivery" (DoorDash/Uber Eats/Grubhub). */
export const COMMERCE_LINK_TYPES = [
  "menu",
  "order",
  "reservation",
  "delivery",
  "catering",
  "gift_card",
  "other",
] as const;
export type CommerceLinkType = (typeof COMMERCE_LINK_TYPES)[number];

/** Where the link came from — drives the trust label (never call something
 *  "verified" that a human didn't confirm). */
export type CommerceSource = "owner" | "curated" | "community" | "imported";

/**
 * The normalized commerce link. Curated links live as this shape on the place
 * (via a `commerce_links` array); legacy flat fields (order_url, menu_url, …)
 * are resolved INTO this shape at read time, so the whole app speaks one model.
 */
export interface CommerceLink {
  /** Stable id when relational (future). Optional in the file-based phase. */
  id?: string;
  /** Owning place slug, when carried out of a place context. */
  place_id?: string;
  provider: CommerceProvider;
  type: CommerceLinkType;
  url: string;
  /** Explicit label override; when set it wins over the computed action label. */
  label?: string;
  /** The lead action for its type (e.g. the canonical "Order" link). */
  is_primary?: boolean;
  /** True ONLY when a human confirmed the link resolves and is current. */
  is_verified?: boolean;
  last_verified_at?: string;
  source?: CommerceSource;
  notes?: string;
}

/**
 * Live ordering availability — RESERVED for a future official-API integration
 * (e.g. Toast partner access). Nothing populates this in Phase 1; it exists so
 * adapters and UI can be typed against it now without guessing later.
 */
export interface CommerceAvailability {
  provider: CommerceProvider;
  /** Whether the provider is currently accepting online orders. */
  isOpenForOrders?: boolean;
  estimatedWaitMinutes?: number;
  lastSyncedAt?: string;
}

/**
 * Future menu-aware search — types only for now, so search can later attach
 * per-item data to a place (tacos, brunch, gluten-free pizza, happy hour…)
 * without reshaping anything. NOT populated in Phase 1.
 */
export interface CommerceMenuItem {
  name: string;
  category?: string;
  /** Price in dollars. */
  price?: number;
  available?: boolean;
  provider?: CommerceProvider;
  lastSyncedAt?: string;
}
