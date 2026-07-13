/**
 * Build src/data/shipping.json — every place in Frederick County where you
 * can mail, ship, or pick up a package. Sourced live from OpenStreetMap via
 * Overpass (ODbL, © OpenStreetMap contributors). Keyless, re-runnable:
 * `npm run build:shipping`.
 *
 * The county had near-zero postal coverage before this (three stray "Post
 * Office" rows in the places set). This assembles the real layer:
 *
 *   - usps          USPS retail post offices (window service, PO boxes)
 *   - ship_store    UPS Store / FedEx Office / FedEx Ship Center / DHL /
 *                   independent pack-and-ship (drop-off + printing + boxes)
 *   - mailbox       USPS blue collection boxes (amenity=post_box)
 *   - parcel_locker Amazon Hub / carrier lockers + parcel pickup points
 *
 * OSM quirk handled here: UPS Store and FedEx are frequently tagged
 * `amenity=post_office` (they DO offer postal service), so a bare
 * amenity=post_office query mixes carriers together. We split them back
 * apart by name/brand so "the post office" and "the UPS Store" are honest,
 * distinct answers.
 *
 * County membership uses the real polygon (isInFrederickCountyArea), not the
 * bbox — the bbox rectangle spills into Carroll, Washington, Loudoun, and PA
 * (Taneytown, Boonsboro, Damascus, Waynesboro), which we drop.
 */
import { writeFileSync } from "node:fs";
import { isInFrederickCountyArea } from "@/lib/geo";
import { resolveMunicipality } from "@/lib/connect";

const OUT = new URL("../src/data/shipping.json", import.meta.url).pathname;

// Frederick County bbox [south, west, north, east] — the Overpass window.
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type ShipKind = "usps" | "ship_store" | "mailbox" | "parcel_locker";
export type ShipCarrier = "usps" | "ups" | "fedex" | "dhl" | "amazon" | "other";

type ShipPoint = {
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

type El = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const [s, w, n, e] = BBOX;
const QUERY = `
[out:json][timeout:120];
(
  node["amenity"="post_office"](${s},${w},${n},${e});
  way["amenity"="post_office"](${s},${w},${n},${e});
  node["amenity"="post_box"](${s},${w},${n},${e});
  node["amenity"="parcel_locker"](${s},${w},${n},${e});
  node["amenity"="vending_machine"]["vending"~"parcel"](${s},${w},${n},${e});
  node["shop"="mail"](${s},${w},${n},${e});
  way["shop"="mail"](${s},${w},${n},${e});
  node["name"~"UPS Store|FedEx|DHL|Pak Mail|PostNet|Postal Annex|Postal Place|Amazon Hub|Amazon Locker",i](${s},${w},${n},${e});
  way["name"~"UPS Store|FedEx|DHL|Pak Mail|PostNet|Postal Annex|Postal Place|Amazon Hub|Amazon Locker",i](${s},${w},${n},${e});
);
out center tags;
`.replace(/\n\s*/g, " ");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const UPS_RE = /\bups\b|the ups store/i;
const FEDEX_RE = /fedex|federal express/i;
const DHL_RE = /\bdhl\b/i;
const AMAZON_RE = /amazon (hub|locker)/i;
// An independent pack-and-ship (not USPS, not a big carrier): PostNet, Pak
// Mail, Postal Annex/Place, "Postal", "Pack & Ship", "Ship Center" w/o carrier.
const INDIE_SHIP_RE = /postnet|pak mail|postal annex|postal place|pack\s*(?:&|and|'n')?\s*ship|ship\s*center|mailbox|parcel/i;

function carrierOf(name: string): ShipCarrier {
  if (UPS_RE.test(name)) return "ups";
  if (FEDEX_RE.test(name)) return "fedex";
  if (DHL_RE.test(name)) return "dhl";
  if (AMAZON_RE.test(name)) return "amazon";
  return "other";
}

/** A post_office node is really USPS unless its name names a private carrier. */
function isUsps(name: string): boolean {
  return !(UPS_RE.test(name) || FEDEX_RE.test(name) || DHL_RE.test(name) || INDIE_SHIP_RE.test(name));
}

function classify(tags: Record<string, string>, name: string): { kind: ShipKind; carrier: ShipCarrier } | null {
  const a = tags.amenity, shop = tags.shop, vending = tags.vending;
  if (a === "post_box") return { kind: "mailbox", carrier: "usps" };
  if (a === "parcel_locker" || (a === "vending_machine" && /parcel/.test(vending ?? ""))) {
    return { kind: "parcel_locker", carrier: carrierOf(name) };
  }
  if (a === "post_office") {
    if (isUsps(name)) return { kind: "usps", carrier: "usps" };
    return { kind: "ship_store", carrier: carrierOf(name) };
  }
  if (shop === "mail") return { kind: "ship_store", carrier: carrierOf(name) };
  // Reached by the name-matched UPS/FedEx/etc. that carried no postal tag.
  const c = carrierOf(name);
  if (c !== "other" || INDIE_SHIP_RE.test(name)) return { kind: "ship_store", carrier: c };
  return null;
}

const CARRIER_LABEL: Record<ShipCarrier, string> = {
  usps: "USPS", ups: "The UPS Store", fedex: "FedEx", dhl: "DHL", amazon: "Amazon", other: "Pack & ship",
};

function joinAddress(t: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (t["addr:housenumber"]) parts.push(t["addr:housenumber"]);
  if (t["addr:street"]) parts.push(t["addr:street"]);
  return parts.length ? parts.join(" ") : undefined;
}

function detailFor(kind: ShipKind, carrier: ShipCarrier, t: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (kind === "mailbox") {
    if (t.collection_times) parts.push("Last pickup " + t.collection_times.split(";")[0].trim());
    else parts.push("USPS collection box");
    if (t["drive_through"] === "yes" || t["drive_up"] === "yes") parts.push("Drive-up");
    return parts.join(" · ");
  }
  if (kind === "parcel_locker") {
    parts.push(CARRIER_LABEL[carrier] === "Pack & ship" ? "Parcel locker" : CARRIER_LABEL[carrier] + " locker");
    if (t.opening_hours === "24/7") parts.push("24/7");
    return parts.join(" · ");
  }
  if (kind === "usps") {
    parts.push("Post office");
    if (t["post_office:type"] === "post_partner") parts.push("Contract station");
    return parts.join(" · ");
  }
  // ship_store
  parts.push(CARRIER_LABEL[carrier] === "USPS" ? "Pack & ship" : CARRIER_LABEL[carrier]);
  return parts.join(" · ");
}

async function main() {
  const body = `data=${encodeURIComponent(QUERY)}`;
  let data: { elements: El[] } | null = null;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "frederick-radius/1.0" },
        body,
      });
      if (!res.ok) { console.error(`  ${ep} -> ${res.status}`); continue; }
      data = (await res.json()) as { elements: El[] };
      console.error(`  OK from ${ep}`);
      break;
    } catch (err) { console.error(`  ${ep} -> ${(err as Error).message}`); }
  }
  if (!data) { console.error("all Overpass endpoints failed"); process.exit(1); }

  const out: ShipPoint[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};

  for (const el of data.elements) {
    const t = el.tags ?? {};
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lng = el.type === "node" ? el.lon : el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!isInFrederickCountyArea(lng, lat)) continue;

    const rawName = t.name?.trim();
    const mapped = classify(t, rawName ?? "");
    if (!mapped) continue;

    // Mailboxes and lockers are usually unnamed — synthesize an honest label.
    let name = rawName;
    if (!name) {
      if (mapped.kind === "mailbox") name = "USPS mailbox";
      else if (mapped.kind === "parcel_locker") name = CARRIER_LABEL[mapped.carrier] === "Pack & ship" ? "Parcel locker" : CARRIER_LABEL[mapped.carrier] + " Locker";
      else if (mapped.kind === "usps") name = "US Post Office";
      else continue; // an unnamed ship store is too vague to list
    }

    const id = `${mapped.kind}-${el.type[0]}-${el.id}`;
    const dedupeKey = `${mapped.kind}-${Math.round(lat * 2000)}-${Math.round(lng * 2000)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      id,
      kind: mapped.kind,
      carrier: mapped.carrier,
      name,
      detail: detailFor(mapped.kind, mapped.carrier, t),
      address: joinAddress(t),
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
      hours: t.opening_hours,
      phone: t.phone ?? t["contact:phone"],
      website: t.website ?? t["contact:website"],
      lng,
      lat,
    });
    counts[mapped.kind] = (counts[mapped.kind] ?? 0) + 1;
  }

  // Order: retail counters first (usps, then ship stores), then drop points.
  const KIND_ORDER: Record<ShipKind, number> = { usps: 0, ship_store: 1, parcel_locker: 2, mailbox: 3 };
  out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));

  writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${OUT} — ${out.length} shipping points`);
  console.log(JSON.stringify(counts));
}

main();
