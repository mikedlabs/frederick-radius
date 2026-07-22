import type { Metadata } from "next";
import Link from "next/link";
import { Truck, IceCream, MapPin, Globe, Instagram, Facebook, ExternalLink, ArrowUpRight } from "lucide-react";
import { FOOD_TRUCKS, trucksByKind, truckFeedUrl, type FoodTruck } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import type { TruckBeacon } from "@/lib/food-trucks/beacon";
import TruckHomeStatus from "@/components/food-trucks/TruckHomeStatus";
import TruckLiveStatus from "@/components/food-trucks/TruckLiveStatus";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

/**
 * /food-trucks — the roster of Frederick County's mobile vendors.
 *
 * Roaming vendors get an honest home here instead of fake fixed pins on the
 * map: who's out there, what they serve, and a one-tap path to each vendor's
 * own feed where the day's spot gets posted. The few trucks with a permanent
 * home base (a brewery kitchen) say so. When the operator-beacon layer lands,
 * a live "parked here now" reading will attach to these entries by slug.
 */

const FOOD_ACCENT = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";
const TREATS_ACCENT = CATEGORY_BY_SLUG["ice-cream"]?.color ?? "var(--app-brand)";

// Rendered per request: the live operator-beacon layer must reflect a beacon
// dropped moments ago, so this page reads fresh instead of serving a day-old
// ISR snapshot. The read is one indexed query and fails soft (no DB -> no live
// layer, static roster unchanged), so the cost of going dynamic is small.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Food trucks & carts in Frederick County",
  description:
    "Frederick County's food trucks, coffee carts, and treat trucks, with a link to each vendor's feed for the day's location.",
  alternates: { canonical: "/food-trucks" },
  openGraph: {
    title: "Food trucks & carts in Frederick County",
    description:
      "Who's rolling around Frederick County: food trucks, coffee carts, and shaved-ice trucks, plus where to find them today.",
  },
};

function LinkChip({ href, label, Icon }: { href: string; label: string; Icon: typeof Globe }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </a>
  );
}

function TruckCard({ truck, accent, beacon }: { truck: FoodTruck; accent: string; beacon?: TruckBeacon }) {
  const feed = truckFeedUrl(truck);
  const Icon = truck.kind === "treats" ? IceCream : Truck;
  const homeBase = resolveHomeBase(truck.homeBase);

  // The honest default for the status slot: a live home-base reading, else the
  // static "usually at" line, else nothing. A live beacon (below) wins over it.
  const statusFallback = homeBase ? (
    <TruckHomeStatus
      venueName={homeBase.name}
      venueSlug={homeBase.slug}
      hours={homeBase.hours}
      verified={homeBase.verified}
      accent={accent}
    />
  ) : truck.homeBase ? (
    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: accent }} />
      Usually at {truck.homeBase}
    </p>
  ) : null;

  return (
    <li
      className="tactile flex h-full w-[min(82vw,20rem)] shrink-0 snap-start flex-col rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5 sm:w-auto"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, ${accent} 15%, var(--app-bg-elevated))`, color: accent }}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[17px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {truck.name}
          </h3>
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ color: accent }}>
            {truck.cuisine}
          </p>
        </div>
      </div>

      {truck.blurb && (
        <p className="mt-2 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {truck.blurb}
        </p>
      )}

      {/* Live layer wins: when an approved operator has dropped a beacon that is
          genuinely live, show "Out now, ..." + the spot. Otherwise fall back to
          the home-base reading (a brewery kitchen's verified hours) or the
          static "usually at" line. */}
      {beacon ? (
        <TruckLiveStatus beacon={beacon} accent={accent}>
          {statusFallback}
        </TruckLiveStatus>
      ) : (
        statusFallback
      )}

      {feed && (
        <a
          href={feed}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open today’s location feed for ${truck.name}`}
          className="tap-44 mt-auto inline-flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] px-3 py-2.5 text-[12px] font-semibold"
          style={{ background: `color-mix(in srgb, ${accent} 12%, var(--app-bg-sunken))`, color: accent }}
        >
          Today&rsquo;s location
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </a>
      )}

      <div className={`flex flex-wrap items-center gap-1.5 ${feed ? "pt-1.5" : "mt-auto pt-3"}`}>
        {truck.website && truck.website !== feed && <LinkChip href={truck.website} label="Website" Icon={Globe} />}
        {truck.instagram && truck.instagram !== feed && <LinkChip href={truck.instagram} label="Instagram" Icon={Instagram} />}
        {truck.facebook && truck.facebook !== feed && <LinkChip href={truck.facebook} label="Facebook" Icon={Facebook} />}
        {!truck.website && !truck.instagram && !truck.facebook && !truck.homeBase && (
          <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Catch them at events around the county.
          </span>
        )}
      </div>
    </li>
  );
}

export default async function FoodTrucksPage() {
  const food = trucksByKind("food");
  const treats = trucksByKind("treats");
  // Freshest live beacon per truck (fail-soft: empty map when no DB / on error).
  const beaconByTruck = await getFreshestBeaconByTruck();

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Food trucks & carts in Frederick County",
    description: "Browse Frederick County's mobile food and treat vendors.",
    mainEntity: itemListJsonLd(
      "Food trucks in Frederick County",
      FOOD_TRUCKS.map((t) => ({ name: t.name, path: "/food-trucks" })),
    ),
  };

  return (
    <div className="relative space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }} />
      <PageBloom variant="single" />

      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: FOOD_ACCENT }} />
          Frederick County · {FOOD_TRUCKS.length} mobile vendors
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          The truck board.
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A local roster built around one question: where did they park today?
          Swipe the board, then open a vendor&rsquo;s latest location post.
        </p>
      </header>

      {/* Honest "how to find them" note: no live location yet. When the
          operator-beacon layer ships, a live reading replaces this. */}
      <div
        className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          Locations move daily. <span className="font-semibold">Today&rsquo;s location</span>{" "}opens the
          vendor&rsquo;s own feed; Radius only shows a live pin when a vendor opts in.
        </p>
      </div>

      <section className="space-y-3">
        <SectionHeading title="Food trucks" count={food.length} accent={FOOD_ACCENT} />
        <ul className="shelf-rail shelf-grid-sm -mx-4 gap-3 px-4 pb-2 sm:mx-0 sm:grid-cols-2 sm:px-0">
          {food.map((t) => (
            <TruckCard key={t.slug} truck={t} accent={FOOD_ACCENT} beacon={beaconByTruck.get(t.slug)} />
          ))}
        </ul>
      </section>

      {treats.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Ice cream & treats on wheels" count={treats.length} accent={TREATS_ACCENT} />
            <ul className="shelf-rail shelf-grid-sm -mx-4 gap-3 px-4 pb-2 sm:mx-0 sm:grid-cols-2 sm:px-0">
            {treats.map((t) => (
              <TruckCard key={t.slug} truck={t} accent={TREATS_ACCENT} beacon={beaconByTruck.get(t.slug)} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Run a truck?{" "}
        <Link href="/food-trucks/claim" className="font-semibold underline" style={{ color: "var(--app-ink-2)" }}>
          Claim your truck
        </Link>{" "}
        to post a live location pin when you are out.
      </p>
    </div>
  );
}
