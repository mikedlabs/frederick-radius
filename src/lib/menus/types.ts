/**
 * Provider-neutral native menu domain.
 *
 * These are intentionally plain serializable records. No Drizzle rows, Date
 * objects, database clients, or provider payloads cross this boundary.
 */

export const MENU_PROVIDERS = [
  "toast",
  "square",
  "clover",
  "official_website",
  "owner_upload",
  "manual",
  "other",
] as const;
export type MenuProvider = (typeof MENU_PROVIDERS)[number];

export const MENU_SOURCE_KINDS = [
  "pos_api",
  "official_html",
  "official_pdf",
  "owner_upload",
  "manual",
] as const;
export type MenuSourceKind = (typeof MENU_SOURCE_KINDS)[number];

export const MENU_PROVENANCE_METHODS = [
  "merchant_authorized",
  "official_public_source",
  "business_submission",
  "manual_verification",
] as const;
export type MenuProvenanceMethod = (typeof MENU_PROVENANCE_METHODS)[number];

export const MENU_TYPES = [
  "main",
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "kids",
  "drinks",
  "dessert",
  "happy_hour",
  "catering",
  "other",
] as const;
export type NativeMenuType = (typeof MENU_TYPES)[number];

export const MENU_ITEM_AVAILABILITY = [
  "unknown",
  "available",
  "unavailable",
  "sold_out",
  "seasonal",
] as const;
export type MenuItemAvailability = (typeof MENU_ITEM_AVAILABILITY)[number];

export const MENU_CLAIM_EVIDENCE = [
  "not_provided",
  "provider_api",
  "business_submission",
  "official_menu",
  "manual_verification",
] as const;
export type MenuClaimEvidence = (typeof MENU_CLAIM_EVIDENCE)[number];

export type JsonObject = Record<string, unknown>;

interface PublishedCurrentRecord {
  recordStatus: "published";
  freshnessStatus: "current";
  sourceUpdatedAt: string | null;
  checkedAt: string;
  validUntil: string;
  publishedAt: string;
}

export interface NativeMenuSourceRecord extends PublishedCurrentRecord {
  id: string;
  placeSlug: string;
  provider: MenuProvider;
  sourceKind: MenuSourceKind;
  sourceKey: string;
  sourceLabel: string;
  sourceUrl: string | null;
  externalMerchantId: string | null;
  provenanceMethod: MenuProvenanceMethod;
  provenance: JsonObject;
  verificationStatus: "verified";
}

export interface NativeMenuRecord extends PublishedCurrentRecord {
  id: string;
  sourceId: string;
  sourceKey: string;
  name: string;
  description: string | null;
  menuType: NativeMenuType;
  currency: string;
  canonicalUrl: string | null;
  provenanceUrl: string | null;
  provenance: JsonObject;
  sortOrder: number;
}

export interface NativeMenuSectionRecord extends PublishedCurrentRecord {
  id: string;
  menuId: string;
  sourceKey: string;
  name: string;
  description: string | null;
  provenanceUrl: string | null;
  provenance: JsonObject;
  sortOrder: number;
}

export interface NativeMenuItemRecord extends PublishedCurrentRecord {
  id: string;
  sectionId: string;
  sourceKey: string;
  name: string;
  description: string | null;
  /** Exact price in the currency minor unit; USD values are cents. */
  priceMinor: number | null;
  priceCurrency: string;
  priceDisplay: string | null;
  availabilityStatus: MenuItemAvailability;
  availabilityEvidence: MenuClaimEvidence;
  availabilityCheckedAt: string | null;
  dietaryTags: string[];
  dietaryEvidence: MenuClaimEvidence;
  allergenStatement: string | null;
  calorieCount: number | null;
  orderUrl: string | null;
  provenanceUrl: string | null;
  provenance: JsonObject;
  sortOrder: number;
}

export interface PublishedMenuSection extends NativeMenuSectionRecord {
  items: NativeMenuItemRecord[];
}

export interface PublishedMenu extends NativeMenuRecord {
  source: NativeMenuSourceRecord;
  sections: PublishedMenuSection[];
}

export interface PublishedMenuForPlace {
  placeSlug: string;
  menus: PublishedMenu[];
}

export interface PublishedMenuItemMatch {
  score: number;
  source: NativeMenuSourceRecord;
  menu: NativeMenuRecord;
  section: NativeMenuSectionRecord;
  item: NativeMenuItemRecord;
}

export type MenuRepositoryUnavailableReason =
  | "not_configured"
  | "query_failed";

export type PublishedMenuForPlaceResult =
  | { status: "ok"; data: PublishedMenuForPlace }
  | { status: "not_found"; data: null }
  | {
      status: "unavailable";
      reason: MenuRepositoryUnavailableReason;
      data: null;
    };

export type PublishedMenuSearchResult =
  | { status: "ok"; items: PublishedMenuItemMatch[] }
  | {
      status: "unavailable";
      reason: MenuRepositoryUnavailableReason;
      items: [];
    };
