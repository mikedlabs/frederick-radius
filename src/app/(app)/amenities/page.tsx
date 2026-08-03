import type { Metadata } from "next";
import Link from "next/link";
import {
  Baby,
  Bike,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
  MapPin,
  Package,
  PawPrint,
  PlugZap,
  Recycle,
  Trees,
  Waves,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import NearbyEssentials from "@/components/amenities/NearbyEssentials";
import { AMENITY_GROUPS, AMENITY_KIND_TO_CAT } from "@/components/map/constants";
import PageBloom from "@/components/ui/PageBloom";
import {
  AMENITY_KINDS,
  allAmenities,
  dedupeAmenities,
  type Amenity,
  type AmenityKind,
} from "@/lib/loaders/amenities";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { shippingByKind, SHIP_COUNT } from "@/lib/loaders/shipping";
import {
  essentialNeed,
  type EssentialNeedId,
} from "@/lib/nearby-essentials";

export const metadata: Metadata = {
  alternates: { canonical: "/amenities" },
  title: "Nearby essentials",
  description:
    "Find the closest mapped restroom, water fountain, trash can, dog-bag station, public seat, or outlet in Frederick County.",
};

export const revalidate = 300;

const ALL_ESSENTIALS_MAP =
  "/map?amenity=restroom,water,trash,dog,wifi,ev,outlet,bike,seating,play,safety";

const CORE_KINDS = new Set<AmenityKind>([
  "restroom",
  "water",
  "trash",
  "dog_waste",
  "bench",
  "outlet",
]);

const KIND_META: Partial<
  Record<AmenityKind, { label: string; icon: LucideIcon }>
> = {
  wifi: { label: "Free Wi-Fi", icon: Wifi },
  ev_charging: { label: "EV charging", icon: PlugZap },
  bike_parking: { label: "Bike parking", icon: Bike },
  picnic: { label: "Picnic spots", icon: Trees },
  playground: { label: "Playgrounds", icon: Baby },
  pool: { label: "Public pools", icon: Waves },
  river_gauge: { label: "River gauges", icon: Waves },
  dog_park: { label: "Dog parks", icon: PawPrint },
  water_access: { label: "Water access", icon: Waves },
  recycling: { label: "Recycling", icon: Recycle },
  dog_water: { label: "Dog water", icon: PawPrint },
  bike_repair: { label: "Bike repair", icon: Wrench },
  other: { label: "Other marked spots", icon: MapPin },
};

const KIND_TO_GROUP: Record<string, string> = (() => {
  const groups: Record<string, string> = {};
  for (const [kind, slug] of Object.entries(AMENITY_KIND_TO_CAT)) {
    const group = AMENITY_GROUPS.find((candidate) =>
      candidate.cats.includes(slug),
    );
    if (group) groups[kind] = group.key;
  }
  return groups;
})();

function mapHrefForKind(kind: AmenityKind): string {
  const group = KIND_TO_GROUP[kind];
  return group ? `/map?amenity=${group}` : "/map";
}

function groupedMoreAmenities(points: Amenity[]) {
  const counts = new Map<AmenityKind, number>();
  for (const point of points) {
    counts.set(point.kind, (counts.get(point.kind) ?? 0) + 1);
  }

  const order = [
    ...AMENITY_KINDS.map((item) => item.kind),
    "dog_water",
    "outlet",
    "other",
  ] as AmenityKind[];

  return order.flatMap((kind) => {
    if (CORE_KINDS.has(kind)) return [];
    const count = counts.get(kind) ?? 0;
    if (count === 0) return [];
    const registered = AMENITY_KINDS.find((item) => item.kind === kind);
    const meta = KIND_META[kind] ?? {
      label: registered?.label ?? kind,
      icon: MapPin,
    };
    return [{ kind, count, ...meta }];
  });
}

export default async function AmenitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string | string[] }>;
}) {
  const query = await searchParams;
  const needValue = Array.isArray(query.need) ? query.need[0] : query.need;
  const initialNeed = essentialNeed(needValue)?.id as EssentialNeedId | undefined;

  const fieldPoints = await getFieldAmenities();
  const points = dedupeAmenities([...allAmenities(), ...fieldPoints], []);
  const moreAmenities = groupedMoreAmenities(points);

  const shipGroups = shippingByKind();
  const shipOffices =
    shipGroups.find((group) => group.kind === "usps")?.list.length ?? 0;
  const shipStores =
    shipGroups.find((group) => group.kind === "ship_store")?.list.length ?? 0;
  const shipMailboxes =
    shipGroups.find((group) => group.kind === "mailbox")?.list.length ?? 0;

  return (
    <div className="relative mx-auto max-w-lg space-y-5 py-5 sm:py-7">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Nearby essentials
        </p>
        <h1
          className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight sm:text-[38px]"
          style={{ color: "var(--app-ink)" }}
        >
          What do you need?
        </h1>
        <p className="max-w-md text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Choose one thing. Radius uses your location to put the closest known
          point first.
        </p>
      </header>

      <NearbyEssentials points={points} initialNeed={initialNeed} />

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        “Closest mapped” means the nearest point in reviewed OpenStreetMap data
        and Radius field notes. Coverage is still growing.
      </p>

      <details
        className="group overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background: "var(--app-cool-tint-10)",
                color: "var(--app-cool)",
              }}
            >
              <MapIcon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                More useful things nearby
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Wi-Fi, bike racks, play areas, charging, and more
              </span>
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition group-open:rotate-180"
            strokeWidth={2.25}
            aria-hidden
            style={{ color: "var(--app-ink-3)" }}
          />
        </summary>

        <div className="border-t px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={ALL_ESSENTIALS_MAP}
            className="tap-44-y flex items-center justify-between gap-3 rounded-[var(--app-radius-sm)] px-2 py-2 text-[13px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Show all essentials on the map
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </Link>
          <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
            {moreAmenities.map((group) => {
              const Icon = group.icon;
              return (
                <li key={group.kind}>
                  <Link
                    href={mapHrefForKind(group.kind)}
                    className="tap-44-y flex min-h-12 items-center gap-3 px-2 py-2"
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                      style={{ color: "var(--app-civic)" }}
                    />
                    <span
                      className="min-w-0 flex-1 text-[13px] font-semibold"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {group.label}
                    </span>
                    <span
                      className="font-mono text-[10.5px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {group.count} mapped
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                      style={{ color: "var(--app-ink-3)" }}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      {SHIP_COUNT > 0 && (
        <Link
          href="/shipping"
          className="flex min-h-16 items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
          }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{
              background: "var(--app-brand-tint-6)",
              color: "var(--app-brand-press)",
            }}
            aria-hidden
          >
            <Package className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Mail and shipping
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {shipOffices} post offices, {shipStores} shipping counters, and {shipMailboxes} blue mailboxes
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0"
            strokeWidth={2.25}
            aria-hidden
            style={{ color: "var(--app-ink-3)" }}
          />
        </Link>
      )}

      <div className="flex items-center justify-between gap-4 border-t px-1 pt-4" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Know a useful spot Radius missed?
        </p>
        <Link
          href="/submit/place"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Add it
        </Link>
      </div>
    </div>
  );
}
