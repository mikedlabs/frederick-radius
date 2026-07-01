/**
 * Future-facing commerce adapter interface + a DISABLED Toast placeholder.
 *
 * Phase 1 is link-only. This scaffold exists so a real provider API (Toast
 * partner access, Square, etc.) can slot in later WITHOUT reshaping the app.
 * It makes no network calls, ships no guessed endpoints, and carries no
 * credentials. The Toast adapter is off unless BOTH the flag is on AND real
 * credentials are configured — and even then the methods are unimplemented
 * stubs until official endpoint docs exist.
 */

import type { Place } from "@/data/places";
import type {
  CommerceAvailability,
  CommerceLink,
  CommerceProvider,
} from "./types";

/** Minimal place context an adapter needs — decoupled from the full Place so
 *  adapters never reach into unrelated fields. */
export interface CommercePlaceContext {
  slug: string;
  name: string;
  city?: string;
  website?: string;
}

/**
 * A provider adapter. Every method is optional: a provider that only knows how
 * to build a menu link implements just getMenuLink. Methods return null when
 * they can't answer, so callers degrade gracefully.
 */
export interface RestaurantCommerceAdapter {
  provider: CommerceProvider;
  /** Whether this adapter is configured + enabled to make live calls. */
  isEnabled(): boolean;
  getMenuLink?(place: CommercePlaceContext): Promise<CommerceLink | null>;
  getOrderLink?(place: CommercePlaceContext): Promise<CommerceLink | null>;
  getAvailability?(
    place: CommercePlaceContext,
  ): Promise<CommerceAvailability | null>;
}

/** Read a boolean-ish env flag without throwing in any runtime. */
function envFlag(name: string): boolean {
  const v = (process.env[name] ?? "").toString().trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Toast adapter — PLACEHOLDER. Requires official Toast partner/API access.
 * Disabled unless ENABLE_TOAST_API is truthy AND client id/secret are present.
 * Even when "enabled", the methods intentionally return null: wiring real Toast
 * endpoints is a follow-up that needs their documented API, not a guess.
 */
export const toastAdapter: RestaurantCommerceAdapter = {
  provider: "toast",
  isEnabled() {
    return (
      envFlag("ENABLE_TOAST_API") &&
      Boolean(process.env.TOAST_CLIENT_ID) &&
      Boolean(process.env.TOAST_CLIENT_SECRET)
    );
  },
  // No getMenuLink/getOrderLink/getAvailability implementations yet — adding
  // them requires official Toast endpoints + credentials. Until then the app
  // relies entirely on curated/detected links (see ./links), never a live call.
};

/** Registry of available adapters. Empty of live behavior in Phase 1. */
export const COMMERCE_ADAPTERS: Partial<
  Record<CommerceProvider, RestaurantCommerceAdapter>
> = {
  toast: toastAdapter,
};

/** True when a given provider has a live, configured adapter. Always false in
 *  Phase 1 (no credentials, flags default off). */
export function hasLiveAdapter(provider: CommerceProvider): boolean {
  const a = COMMERCE_ADAPTERS[provider];
  return Boolean(a?.isEnabled());
}

// Reference so `Place` stays an intentional dependency for the future full
// adapter signature (place → links) without an unused-import lint.
export type FuturePlaceAdapterInput = Place;
