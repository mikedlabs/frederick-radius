/**
 * Search types only. Kept separate from src/lib/search/index.ts so a
 * client component can import the types without pulling the runtime
 * search code (which static-imports the slim places-client.json and
 * would bundle the 2.1MB onto every consumer page).
 *
 * The runtime ranking lives behind /api/search and src/lib/search/
 * index.ts. Clients fetch from the route and parse this typed result.
 */
import type { TrustSignal } from "@/lib/trust";

export type SearchResultType =
  | "place"
  | "event"
  | "category"
  | "municipality"
  | "action";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Compact category/municipality hint for badges. */
  badge?: string;
  /** Trust signal for places and events, pre-computed at the index
   *  call site so the client never needs to lift clientPlaceBySlug or
   *  EVENT_BY_SLUG to render the badge. */
  trust?: TrustSignal | null;
};
