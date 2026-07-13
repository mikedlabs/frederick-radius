import SHIPPING_RAW from "@/data/shipping.json" with { type: "json" };

/**
 * Shipping & postal points — where to mail, ship, or pick up a package
 * across Frederick County. Static, keyless data from OpenStreetMap (ODbL,
 * © OpenStreetMap contributors), assembled by scripts/build-shipping.ts.
 * Refresh with `npm run build:shipping` after a fresh OSM pull.
 *
 * The county had near-zero postal coverage before this layer; this is the
 * "where's the nearest post office / UPS Store / blue mailbox" utility.
 * Pure data accessor.
 */

export type ShipKind = "usps" | "ship_store" | "mailbox" | "parcel_locker";
export type ShipCarrier = "usps" | "ups" | "fedex" | "dhl" | "amazon" | "other";

export type ShipPoint = {
  id: string;
  kind: ShipKind;
  carrier: ShipCarrier;
  name: string;
  detail?: string;
  address?: string;
  municipality: string;
  hours?: string;
  phone?: string;
  website?: string;
  lng: number;
  lat: number;
};

const SHIPPING = SHIPPING_RAW as ShipPoint[];

// Display order, most-asked-for first. Blurb frames the "which of these
// answers my question" decision. Only kinds with actual points render.
export const SHIP_KINDS: { kind: ShipKind; label: string; blurb: string }[] = [
  { kind: "usps", label: "Post offices", blurb: "USPS window service, PO boxes, stamps" },
  { kind: "ship_store", label: "Ship & pack", blurb: "UPS, FedEx, and pack-and-ship counters" },
  { kind: "parcel_locker", label: "Parcel lockers", blurb: "Self-serve pickup lockers and access points" },
  { kind: "mailbox", label: "Mailboxes", blurb: "USPS blue collection boxes" },
];

export const SHIP_COUNT = SHIPPING.length;

export function allShipping(): ShipPoint[] {
  return SHIPPING;
}

/** Grouped in display order; only kinds that actually have points. */
export function shippingByKind(): { kind: ShipKind; label: string; blurb: string; list: ShipPoint[] }[] {
  return SHIP_KINDS.map((k) => ({
    ...k,
    list: SHIPPING.filter((p) => p.kind === k.kind).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.list.length > 0);
}
