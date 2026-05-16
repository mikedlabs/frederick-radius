/**
 * Deep-link helpers for third-party services we don't ingest, just route to.
 * Every function takes the minimum required data and returns a clean URL.
 * Empty/undefined input → null → caller skips the button entirely.
 */

import type { Place } from "@/data/places";

// ─── Maps / Directions ──────────────────────────────────────────────────

export function googleMapsDirections(lat: number, lng: number, name?: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
  });
  if (name) params.set("destination_place_id", name);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appleMapsDirections(lat: number, lng: number, name?: string): string {
  // Apple's Maps URL scheme: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
  const params = new URLSearchParams({ daddr: `${lat},${lng}`, dirflg: "w" });
  if (name) params.set("q", name);
  return `https://maps.apple.com/?${params.toString()}`;
}

export function wazeDirections(lat: number, lng: number): string {
  return `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

// ─── Reservations ───────────────────────────────────────────────────────

export function openTableUrl(opentable_id: string): string {
  // Standard OpenTable client-redirect URL
  return `https://www.opentable.com/restref/client/?restref=${opentable_id}&utm_source=frederickradius&utm_medium=link`;
}

export function resyUrl(resy_slug: string): string {
  return `https://resy.com/cities/frederick-md/venues/${resy_slug}`;
}

// ─── Parking ────────────────────────────────────────────────────────────

// ParkMobile zone universal link: opens the native app if installed,
// otherwise the mobile web flow, for that zone. This is the documented
// format and is now consistent with place-actions.ts (the bare
// parkmobile.io/{zone} used before was not a valid start-session URL).
export function parkMobileWebUrl(zone: string): string {
  return `https://app.parkmobile.io/zone/${encodeURIComponent(zone)}`;
}

// Generic ParkMobile entry for a parking place whose exact zone is not
// verified yet: the user reads the zone off the on-site sign. Always a
// working ParkMobile link, never a fabricated zone (a wrong zone would
// charge the user for the wrong location).
export function parkMobileFindUrl(): string {
  return "https://app.parkmobile.io/";
}

export function parkMobileAppUrl(zone: string): string {
  // ios/android deep link — opens the app directly if installed
  return `parkmobile://zone/${zone}`;
}

// ─── Ordering / Delivery ────────────────────────────────────────────────

export function doorDashSearchUrl(name: string, city = "Frederick"): string {
  return `https://www.doordash.com/search/store/${encodeURIComponent(`${name} ${city}`)}/`;
}

export function uberEatsSearchUrl(name: string, city = "Frederick MD"): string {
  return `https://www.ubereats.com/search?q=${encodeURIComponent(`${name} ${city}`)}`;
}

export function grubhubSearchUrl(name: string): string {
  return `https://www.grubhub.com/search?searchedText=${encodeURIComponent(name)}`;
}

// ─── Social ─────────────────────────────────────────────────────────────

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}

export function facebookUrl(handle: string): string {
  return `https://www.facebook.com/${handle.replace(/^@/, "")}/`;
}

// ─── "Best directions button for this device" ──────────────────────────
// Server can't detect user agent reliably from client component context
// without extra wiring, so we render BOTH Apple + Google buttons on
// place pages and let the user pick. Most iOS users prefer Apple Maps
// for native turn-by-turn; most Android users prefer Google.

// ─── Action-list builder for a Place ────────────────────────────────────

export type IntegrationAction = {
  key: string;
  label: string;
  href: string;
  external: boolean;
  category: "reserve" | "order" | "park" | "directions" | "social" | "call";
  priority: number;
};

export function actionsForPlace(place: Place): IntegrationAction[] {
  const out: IntegrationAction[] = [];

  // Reservations
  if (place.opentable_id) {
    out.push({
      key: "opentable",
      label: "Reserve on OpenTable",
      href: openTableUrl(place.opentable_id),
      external: true,
      category: "reserve",
      priority: 10,
    });
  }
  if (place.resy_slug) {
    out.push({
      key: "resy",
      label: "Book on Resy",
      href: resyUrl(place.resy_slug),
      external: true,
      category: "reserve",
      priority: 9,
    });
  }

  // Ordering
  if (place.order_url) {
    out.push({
      key: "order",
      label: "Order online",
      href: place.order_url,
      external: true,
      category: "order",
      priority: 8,
    });
  }
  if (place.menu_url) {
    out.push({
      key: "menu",
      label: "View menu",
      href: place.menu_url,
      external: true,
      category: "order",
      priority: 7,
    });
  }
  if (place.doordash_url) {
    out.push({
      key: "doordash",
      label: "DoorDash",
      href: place.doordash_url,
      external: true,
      category: "order",
      priority: 5,
    });
  }
  if (place.ubereats_url) {
    out.push({
      key: "ubereats",
      label: "Uber Eats",
      href: place.ubereats_url,
      external: true,
      category: "order",
      priority: 5,
    });
  }
  if (place.grubhub_url) {
    out.push({
      key: "grubhub",
      label: "Grubhub",
      href: place.grubhub_url,
      external: true,
      category: "order",
      priority: 4,
    });
  }

  // Parking. A verified zone deep-links straight to that ParkMobile
  // session. For a parking place without a verified zone we still show
  // a working ParkMobile action (read the zone off the sign) rather
  // than hiding it entirely, which is why parking pages had no link.
  if (place.parkmobile_zone && place.parkmobile_zone !== "needs_verification") {
    out.push({
      key: "parkmobile",
      label: `Pay with ParkMobile · zone ${place.parkmobile_zone}`,
      href: parkMobileWebUrl(place.parkmobile_zone),
      external: true,
      category: "park",
      priority: 10,
    });
  } else if (place.category === "parking") {
    out.push({
      key: "parkmobile",
      label: "Find parking · ParkMobile",
      href: parkMobileFindUrl(),
      external: true,
      category: "park",
      priority: 10,
    });
  }

  // Social
  if (place.instagram) {
    out.push({
      key: "instagram",
      label: `@${place.instagram} on Instagram`,
      href: instagramUrl(place.instagram),
      external: true,
      category: "social",
      priority: 1,
    });
  }
  if (place.facebook) {
    out.push({
      key: "facebook",
      label: "Facebook",
      href: facebookUrl(place.facebook),
      external: true,
      category: "social",
      priority: 1,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
