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
  PawPrint,
  Armchair,
  Mailbox,
  PackageOpen,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { amenitiesByKind } from "@/lib/loaders/amenities";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";

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
  title: "Amenities",
  description:
    "Public restrooms, Wi-Fi, EV charging, bike racks, picnic spots and playgrounds across Frederick County — plus what's coming next.",
};

export const revalidate = 3600; // amenities data only changes on rebuild

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
} as const;

// What's NOT yet on the map but people ask the app for. These are the
// kinds the owner has called out by name. Each gets a "why this
// matters" blurb so the page doesn't read like a wishlist with no
// signal — it reads like a roadmap with intent.
const COMING_SOON: {
  icon: typeof Trash2;
  label: string;
  why: string;
}[] = [
  {
    icon: Trash2,
    label: "Public trash cans",
    why: "Where to actually put the wrapper — without trekking five blocks looking.",
  },
  {
    icon: PawPrint,
    label: "Dog waste bag stations",
    why: "The hand-on-leash question. Carroll Creek, parks, downtown corners.",
  },
  {
    icon: Armchair,
    label: "Public benches",
    why: "Where to sit and read a minute. Especially the shaded ones.",
  },
  {
    icon: Mailbox,
    label: "USPS mailboxes",
    why: "Last-pickup-of-the-day with the address, not a Google search rabbit hole.",
  },
  {
    icon: PackageOpen,
    label: "UPS & FedEx drop-offs",
    why: "Including the ones tucked inside pharmacies and the print shop.",
  },
];

export default function AmenitiesPage() {
  const live = amenitiesByKind();
  const totalLive = live.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="relative mx-auto max-w-md space-y-7 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/map"
          className="inline-flex items-center gap-1 hover:underline"
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
          Amenities — what&apos;s here, and what&apos;s coming.
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          The county runs on more than restaurants and museums. Restrooms,
          Wi-Fi, EV stations, benches — the dull-but-useful layer that turns
          a walk into a trip you actually finish. Here&apos;s what we map
          today, and what we&apos;re adding next.
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
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Open <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>Layers</span> on the
          map to filter to the kind you need.
        </p>
        <ul
          className="grid grid-cols-2 gap-2.5"
          aria-label="Live amenity kinds"
        >
          {live.map((g) => {
            const Icon = LIVE_ICONS[g.kind];
            return (
              <li key={g.kind}>
                <Link
                  href="/map"
                  className="group flex h-full flex-col gap-1.5 rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.985]"
                  style={{
                    background: "var(--app-paper)",
                    borderColor: "var(--app-border)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                      style={{
                        background: "var(--app-surface-2, rgba(168,70,44,0.08))",
                        color: "var(--app-brand)",
                      }}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span
                      className="text-[11px] font-semibold tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {g.list.length}
                    </span>
                  </div>
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
                </Link>
              </li>
            );
          })}
        </ul>
        <p
          className="pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          From OpenStreetMap (© OpenStreetMap contributors, ODbL). Refreshed
          on each deploy via the amenities build script.
        </p>
      </section>

      {/* COMING SOON — owner-specified roadmap. Plain list with intent
          per item; no fake percentages, no fake ETAs. The honesty is
          the feature. */}
      <section className="space-y-3">
        <SectionHeading
          title="Coming next"
          trailing={
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--app-cool)" }}
            >
              <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              Roadmap
            </span>
          }
        />
        <ul
          className="space-y-2"
          aria-label="Amenity kinds coming soon to the map"
        >
          {COMING_SOON.map(({ icon: Icon, label, why }) => (
            <li
              key={label}
              className="flex items-start gap-3 rounded-[var(--app-radius-md)] border border-dashed p-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "var(--app-surface-2, rgba(64,86,76,0.08))",
                  color: "var(--app-cool, #40564C)",
                }}
                aria-hidden
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className="text-[14px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {label}
                </p>
                <p
                  className="text-[12.5px] leading-snug"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {why}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

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
          Know one we&apos;re missing?
        </h2>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A reliable restroom downtown, a Wi-Fi-friendly cafe, a tucked-away
          picnic spot — tell us. The map only knows what people tell it.
        </p>
        <Link
          href="/submit/place"
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
          style={{ background: "var(--app-brand)" }}
        >
          Submit an amenity
        </Link>
      </section>
    </div>
  );
}
