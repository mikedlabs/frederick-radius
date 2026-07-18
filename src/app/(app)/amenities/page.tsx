import type { Metadata } from "next";
import Link from "next/link";
import {
  Toilet,
  Wifi,
  PlugZap,
  Bike,
  Trees,
  Baby,
  Waves,
  Trash2,
  Recycle,
  Droplets,
  PawPrint,
  Armchair,
  Mailbox,
  Package,
  MapPin,
  Footprints,
  ArrowLeft,
  ChevronRight,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { amenitiesByKind, type AmenityKind } from "@/lib/loaders/amenities";
import { shippingByKind, SHIP_COUNT } from "@/lib/loaders/shipping";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { AMENITY_KIND_TO_CAT, AMENITY_GROUPS } from "@/components/map/constants";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";

// Kind → map amenity-tray group key, derived from the same source of truth
// the map uses (kind → category slug → the group that carries that slug). Lets
// every tile here deep-link straight to /map with that layer turned on.
const KIND_TO_GROUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [kind, slug] of Object.entries(AMENITY_KIND_TO_CAT)) {
    const g = AMENITY_GROUPS.find((gr) => gr.cats.includes(slug));
    if (g) m[kind] = g.key;
  }
  return m;
})();

const mapHrefForKind = (kind: string): string => {
  const group = KIND_TO_GROUP[kind];
  return group ? `/map?amenity=${group}` : "/map";
};

// Label + icon for the field-collected kinds (the /collect tool's output).
const FIELD_META: Record<string, { label: string; icon: LucideIcon }> = {
  trash: { label: "Trash cans", icon: Trash2 },
  recycling: { label: "Recycling", icon: Recycle },
  water: { label: "Water fountains", icon: Droplets },
  bench: { label: "Benches", icon: Armchair },
  dog_waste: { label: "Dog bag stations", icon: PawPrint },
  dog_water: { label: "Dog water", icon: PawPrint },
  outlet: { label: "Power outlets", icon: PlugZap },
  ev_charging: { label: "EV charging", icon: PlugZap },
  restroom: { label: "Restrooms", icon: Toilet },
  other: { label: "Other spots", icon: MapPin },
};

/**
 * /amenities — the editorial roadmap for the civic-services layer.
 *
 * Previously a 301 → /map. Restored as a real page because the map's
 * "Amenities" filter only answers the half of the question the user
 * is already on the map for. This page answers two:
 *
 *   1. What civic services do we have data for right now? (live counts
 *      from OSM, link straight to the map filtered to that kind)
 *   2. What's coming next? (trash cans, dog bags, benches, mailboxes,
 *      shipping drop-offs — the things people legitimately ask the app
 *      where to find and we don't index yet)
 *
 * The point is to be honest about both. A directory that lists what it
 * has AND what it doesn't yet have is a more trustworthy directory.
 *
 * Two routes link here:
 *   - /browse Layers drawer footer (Power view)
 *   - /now footer Trust block (eventually — not yet wired)
 */

export const metadata: Metadata = {
  alternates: { canonical: "/amenities" },
  title: "Amenities",
  description:
    "Public restrooms, water, Wi-Fi, EV charging, bike racks, benches, dog-bag stations, picnic spots and playgrounds across Frederick County.",
};

// Static OSM amenities change only on rebuild, but field-collected counts come
// from the DB — match the map's 5-min ISR so a freshly collected point shows
// up here within the same window it appears on the map.
export const revalidate = 300;

// Icon mapping for the six live kinds. Kept inline (not in the loader)
// because lucide-react is a UI concern, not a data concern.
const LIVE_ICONS = {
  restroom: Toilet,
  wifi: Wifi,
  ev_charging: PlugZap,
  bike_parking: Bike,
  picnic: Trees,
  playground: Baby,
  pool: Waves,
  river_gauge: Waves,
  water: Droplets,
  trash: Trash2,
  recycling: Recycle,
  bench: Armchair,
  dog_waste: PawPrint,
  bike_repair: Wrench,
} as const;

export default async function AmenitiesPage() {
  const live = amenitiesByKind();
  const totalLive = live.reduce((n, g) => n + g.list.length, 0);

  // Post & shipping — now a live layer of its own (/shipping). Counts drive
  // the cross-link so the promo is honest about how much is actually there.
  const shipGroups = shippingByKind();
  const shipOffices = shipGroups.find((g) => g.kind === "usps")?.list.length ?? 0;
  const shipStores = shipGroups.find((g) => g.kind === "ship_store")?.list.length ?? 0;

  // Field-collected amenities (the /collect walkabout tool) — counted by kind
  // so the catalog reflects what's actually been marked on foot. Fail-soft to
  // an empty list (no DB / error), so the section simply doesn't render.
  const fieldRaw = await getFieldAmenities();
  const fieldByKind = new Map<AmenityKind, number>();
  for (const a of fieldRaw) fieldByKind.set(a.kind, (fieldByKind.get(a.kind) ?? 0) + 1);
  const fieldGroups = [...fieldByKind.entries()]
    .map(([kind, count]) => ({ kind, count, ...(FIELD_META[kind] ?? { label: kind, icon: MapPin }) }))
    .sort((a, b) => b.count - a.count);
  const totalField = fieldRaw.length;

  return (
    <div className="relative mx-auto max-w-md space-y-7 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/map"
          className="tap-44-y inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Map
        </Link>
      </nav>

      <header className="space-y-3">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Civic services
        </p>
        <h1
          className="font-serif text-[32px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Find useful public amenities.
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          The map includes public restrooms, drinking water, benches, power
          outlets, dog-waste stations, and Wi-Fi. Open a category to see the
          mapped locations near you.
        </p>
      </header>

      {/* LIVE — six kinds we already have OSM points for. Each links
          directly into /browse with that kind selected so the click
          goes from "what is this" to "show me on the map" in one step. */}
      <section className="space-y-3">
        <SectionHeading
          title="On the map today"
          count={totalLive}
          href="/map"
          cta="Open map"
        />
        <ul
          className="grid grid-cols-2 gap-2.5"
          aria-label="Live amenity kinds"
        >
          {live.map((g) => {
            // `live` only ever holds the static display kinds (amenitiesByKind
            // filters to AMENITY_KINDS), but g.kind is the wider AmenityKind
            // union now that the field-collected kinds exist — fall back safely.
            const Icon = LIVE_ICONS[g.kind as keyof typeof LIVE_ICONS] ?? Trees;
            return (
              <li key={g.kind}>
                <Link
                  href={mapHrefForKind(g.kind)}
                  className="group flex h-full flex-col gap-1.5 rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.985]"
                  style={{
                    background: "var(--app-paper)",
                    borderColor: "var(--app-border)",
                  }}
                >
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                    style={{
                      background: "var(--app-brand-tint-6)",
                      color: "var(--app-brand)",
                    }}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <p
                    className="text-[14px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {g.label}
                  </p>
                  <p
                    className="text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {g.blurb}
                  </p>
                  <p
                    className="mt-auto pt-1 font-mono text-[11px] tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {g.list.length} mapped
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
        <p
          className="pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          From OpenStreetMap (© OpenStreetMap contributors, ODbL). Stored as a
          reviewed snapshot so the essentials still load when the live map feed does not.
        </p>
      </section>

      {/* COLLECTED ON FOOT — points dropped via the /collect field tool.
          Honest-empty: the whole section hides until at least one point is
          marked, so it never reads as an empty promise. Each tile deep-links
          to the map with that amenity layer on. */}
      {fieldGroups.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Marked on foot"
            count={totalField}
            trailing={
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-brand-2, #2F5470)" }}
              >
                <Footprints className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Collected
              </span>
            }
          />
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Spots neighbors marked by walking the county with the collection
            tool. Tap to see them on the map.
          </p>
          <ul className="grid grid-cols-2 gap-2.5" aria-label="Field-collected amenity kinds">
            {fieldGroups.map((g) => {
              const Icon = g.icon;
              return (
                <li key={g.kind}>
                  <Link
                    href={mapHrefForKind(g.kind)}
                    className="group flex h-full flex-col gap-1.5 rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.985]"
                    style={{ background: "var(--app-paper)", borderColor: "var(--app-border)" }}
                  >
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ background: "var(--app-brand-tint-6)", color: "var(--app-brand-2, #2F5470)" }}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                      {g.label}
                    </p>
                    <p
                      className="mt-auto pt-1 font-mono text-[11px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {g.count} mapped
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* POST & SHIPPING — was the "coming next" roadmap (USPS mailboxes,
          UPS/FedEx drop-offs); now a live layer of its own. A single
          promoted cross-link, honest about the count behind it. */}
      {SHIP_COUNT > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Post & shipping" count={SHIP_COUNT} href="/shipping" cta="Open guide" />
          <Link
            href="/shipping"
            className="group flex items-center gap-3 rounded-[var(--app-radius-md)] border p-3.5 transition active:scale-[0.99]"
            style={{ background: "var(--app-paper)", borderColor: "var(--app-border)" }}
          >
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--app-brand-tint-6)", color: "var(--app-brand)" }}
              aria-hidden
            >
              <Package className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                Find mail and shipping services
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                {shipOffices} post offices, {shipStores} UPS &amp; FedEx counters, plus{" "}
                <Mailbox className="mb-0.5 inline h-3 w-3" strokeWidth={2} aria-hidden /> blue mailboxes,
                searchable by town.
              </span>
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 opacity-40" style={{ color: "var(--app-ink-3)" }} />
          </Link>
        </section>
      )}

      {/* SUBMIT — quiet door for anyone who knows a useful amenity.
          Submission goes into the standard /submit flow; the team
          triages and decides whether to map it. */}
      <section className="space-y-3 rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-paper)",
        }}
      >
        <h2
          className="font-serif text-[18px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Is a public amenity missing?
        </h2>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Send its location and any access details. Radius reviews each
          submission before adding it to the map.
        </p>
        <Link
          href="/submit/place"
          className="tap-44 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
          style={{ background: "var(--app-brand-press)" }}
        >
          Submit an amenity
        </Link>
      </section>
    </div>
  );
}
