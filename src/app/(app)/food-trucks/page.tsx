import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { FOOD_TRUCK_BY_SLUG, FOOD_TRUCKS } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import { getFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { foodTruckStopDirectionsUrl } from "@/lib/food-trucks/presentation";
import { settleFoodTruckPageData } from "@/lib/food-trucks/page-data";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import FoodTruckBoard, { type FoodTruckBoardItem } from "@/components/food-trucks/FoodTruckBoard";
import FoodTruckIdentity from "@/components/food-trucks/FoodTruckIdentity";
import FoodTruckJourneys from "@/components/food-trucks/FoodTruckJourneys";
import FoodTruckNearMe from "@/components/food-trucks/FoodTruckNearMe";
import FeedbackLink from "@/components/feedback/FeedbackLink";
import PageBloom from "@/components/ui/PageBloom";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

const FOOD_ACCENT = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";
const HERO_TRUCK_SLUGS = [
  "dop-pizza",
  "blendabowl",
  "mls-ragin-cajun",
  "the-garage",
  "kona-ice-frederick",
] as const;
const HERO_TRUCKS = HERO_TRUCK_SLUGS.flatMap((slug) => {
  const truck = FOOD_TRUCK_BY_SLUG.get(slug);
  return truck ? [truck] : [];
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Food trucks in Frederick County",
  description:
    "See published food-truck stops this week and browse Frederick County vendors.",
  alternates: { canonical: "/food-trucks" },
  openGraph: {
    title: "Food trucks in Frederick County",
    description: "A weekly board of published stops and local mobile vendors.",
    images: [{
      url: "/brand/social/og-food-trucks.png",
      width: 1200,
      height: 630,
      alt: "Find the food trucks. Published weekly stops and local vendors in Frederick County.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Food trucks in Frederick County",
    description: "Published weekly stops and a roster of local mobile vendors.",
    images: ["/brand/social/og-food-trucks.png"],
  },
};

function formatDate(iso: string, weekday: "long" | "short" = "short"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateBadge(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
  }).format(new Date(iso)).replace(",", " ·");
}

function scheduleTime(stop: FoodTruckScheduleStop): string {
  const start = formatTime(stop.startsAt);
  return stop.endsAt ? `${start}–${formatTime(stop.endsAt)}` : start;
}

function vendorHref(vendor: FoodTruckScheduleStop["vendors"][number]): string | undefined {
  if (!vendor.slug) return undefined;
  return FOOD_TRUCK_BY_SLUG.has(vendor.slug) ? `#truck-${vendor.slug}` : undefined;
}

/** A stop vendor we have no roster entry for. Named by the host's calendar,
 *  so the truck is real and out working, it just has no listing yet. */
function isUnlistedStopVendor(vendor: FoodTruckScheduleStop["vendors"][number]): boolean {
  return !vendor.slug || !FOOD_TRUCK_BY_SLUG.has(vendor.slug);
}

function stopVendorIdentity(vendor: FoodTruckScheduleStop["vendors"][number]) {
  const truck = vendor.slug ? FOOD_TRUCK_BY_SLUG.get(vendor.slug) : undefined;
  return truck ?? {
    slug: vendor.slug ?? vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: vendor.name,
    // Was "Guest truck", which read as a downgrade to the exact operators we
    // most want to reach: these are working trucks on a published calendar
    // that simply have not claimed a listing.
    cuisine: "Not listed yet",
    kind: "food" as const,
  };
}

function StopCard({ stop }: { stop: FoodTruckScheduleStop }) {
  return (
    <article className="food-truck-stop-card">
      <div className="food-truck-stop-visual">
        {stop.vendors.slice(0, 3).map((vendor) => (
          <FoodTruckIdentity
            key={`${stop.id}-${vendor.name}`}
            truck={stopVendorIdentity(vendor)}
            size="thumb"
            decorative
          />
        ))}
        <time className="food-truck-stop-date" dateTime={stop.startsAt}>
          <span>{formatDateBadge(stop.startsAt)}</span>
          <strong>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(new Date(stop.startsAt))}</strong>
        </time>
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {scheduleTime(stop)}
          </span>
          {stop.municipality ? <span>{stop.municipality}</span> : null}
        </div>
        <h3 className="mt-2 font-serif text-[21px] font-semibold leading-[1.08]" style={{ color: "var(--app-ink)" }}>
          {stop.vendors.map((vendor, index) => {
            const href = vendorHref(vendor);
            const label = `${vendor.name}${index < stop.vendors.length - 1 ? " ·" : ""}`;
            return href ? (
              <Link
                key={`${vendor.name}-${href}`}
                href={href}
                aria-label={`Find ${vendor.name} in the vendor roster`}
                className="mr-1 underline decoration-[color:var(--app-border-strong)] decoration-1 underline-offset-4 transition hover:decoration-[color:var(--app-brand)]"
              >
                {label}
              </Link>
            ) : (
              <span key={vendor.name} className="mr-1">{label}</span>
            );
          })}
        </h3>
        <p className="mt-1.5 inline-flex items-start gap-1.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: FOOD_ACCENT }} />
          <span>{stop.venueName}</span>
        </p>
        {stop.serviceNote ? (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{stop.serviceNote}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={foodTruckStopDirectionsUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11.5px] font-semibold"
            style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
          >
            Directions
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </a>
          <a
            href={stop.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11.5px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            {stop.sourceName} source
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
}

/**
 * The operator door. It sits under the board for the everyday visitor, and
 * moves above it for `/food-trucks?for=owner` — the link to hand to vendors
 * directly, so an operator who taps through from a post is not asked to scroll
 * past the whole consumer page to find the two things they came for.
 */
function OwnerDoor({
  unlisted,
  lead,
}: {
  unlisted: ReadonlyArray<{ name: string }>;
  lead: boolean;
}) {
  return (
    <aside
      className="food-truck-owner-door rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: lead ? "var(--app-ink)" : "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>For truck owners</p>
          <p className="mt-1 font-serif text-[21px] leading-tight" style={{ color: "var(--app-ink)" }}>
            {lead ? "Put your truck on the county board." : "Make this listing useful before someone arrives."}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {lead
              ? "A listing carries your photo, menu, catering link, and today's stop. It is free, there is no account to keep up, and you can post a live pin from your phone while you are serving."
              : "Send a truck photo, menu, or public schedule. We’ll keep the listing current."}
          </p>
        </div>
        <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:flex">
          <Link href="/food-trucks/claim" className="tap-44 inline-flex items-center justify-center rounded-full border px-3.5 py-2.5 text-center text-[12px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}>
            Claim a listing
          </Link>
          <Link href="/submit/place?category=food-truck" className="tap-44 inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2.5 text-center text-[12px] font-semibold" style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}>
            Add my truck
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Named, source-verified trucks working this week that have no listing.
          The most specific possible invitation: an operator can see their own
          truck on the board and know exactly what is missing. */}
      {unlisted.length > 0 ? (
        <p className="mt-3 border-t pt-3 text-[12px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
          On this week&rsquo;s board without a listing:{" "}
          <span style={{ color: "var(--app-ink)" }}>
            {unlisted.map((vendor) => vendor.name).join(", ")}
          </span>
          . If one of those is yours, add it and it carries your links from then on.
        </p>
      ) : null}
    </aside>
  );
}

export default async function FoodTrucksPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const ownerView = (await searchParams).for === "owner";
  // The public route must never inherit a database, Blob, or official-calendar
  // hang. On timeout, the static Frederick County roster still renders and the
  // week panel says that no published stops are available.
  const { beaconByTruck, schedule } = await settleFoodTruckPageData({
    beacons: getFreshestBeaconByTruck(),
    schedule: getFoodTruckSchedule(),
  });
  const scheduledSlugs = new Set(
    schedule.stops.flatMap((stop) => stop.vendors.map((vendor) => vendor.slug).filter(Boolean) as string[]),
  );
  const scheduleUnavailable =
    schedule.stops.length === 0 && schedule.sources.some((source) => !source.ok);
  // Deduped by name: one truck can appear at several stops in the same week.
  const unlistedStopVendors = Array.from(
    new Map(
      schedule.stops
        .flatMap((stop) => stop.vendors)
        .filter(isUnlistedStopVendor)
        .map((vendor) => [vendor.name, { name: vendor.name }]),
    ).values(),
  );
  const boardItems: FoodTruckBoardItem[] = FOOD_TRUCKS.map((truck) => ({
    ...truck,
    home: resolveHomeBase(truck.homeBase) ?? undefined,
    beacon: beaconByTruck.get(truck.slug),
  })).sort((a, b) => {
    const liveDifference = Number(Boolean(b.beacon)) - Number(Boolean(a.beacon));
    if (liveDifference) return liveDifference;
    const scheduleDifference = Number(scheduledSlugs.has(b.slug)) - Number(scheduledSlugs.has(a.slug));
    return scheduleDifference || a.name.localeCompare(b.name);
  });
  const nearbyTrucks = boardItems.flatMap((truck) =>
    truck.beacon
      ? [{
          slug: truck.slug,
          name: truck.name,
          cuisine: truck.cuisine,
          kind: truck.kind,
          ...(truck.media ? { media: truck.media } : {}),
          beacon: truck.beacon,
        }]
      : [],
  );
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Food trucks in Frederick County",
    description: "Published food-truck stops and Frederick County vendors.",
    mainEntity: itemListJsonLd(
      "Food trucks in Frederick County",
      FOOD_TRUCKS.map((truck) => ({ name: truck.name, path: `/food-trucks#truck-${truck.slug}` })),
    ),
  };

  return (
    <div className="relative space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }} />
      <PageBloom variant="single" />

      <header className="food-truck-masthead">
        <div className="food-truck-masthead-copy">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.15em]">
            Frederick County food trucks
          </p>
          <h1>Find where they pull in.</h1>
          <p>
            Published stops come first. Live locations appear when a truck checks in.
          </p>
        </div>
        <div className="food-truck-hero-lineup" aria-label="Local food-truck vendor identities">
          {HERO_TRUCKS.map((truck, index) => (
            <div key={truck.slug} className="food-truck-hero-tile">
              <FoodTruckIdentity truck={truck} size="hero" priority={index < 2} />
            </div>
          ))}
        </div>
      </header>

      {ownerView ? <OwnerDoor unlisted={unlistedStopVendors} lead /> : null}

      <FoodTruckJourneys
        defaultMode={nearbyTrucks.length > 0 ? "near" : "week"}
        nearby={<FoodTruckNearMe trucks={nearbyTrucks} accent={FOOD_ACCENT} />}
        week={
          <section id="this-week" className="scroll-mt-24 space-y-4">
        <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>
              Published by hosts and official calendars
            </p>
            <h2 className="mt-1 font-serif text-[29px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
              This week&rsquo;s stops
            </h2>
          </div>
          <time
            dateTime={schedule.generatedAt}
            className="text-right text-[10.5px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            Checked {formatDate(schedule.generatedAt)}
            <br />
            {formatTime(schedule.generatedAt)}
          </time>
        </div>

        {schedule.stops.length > 0 ? (
          <div className="food-truck-stop-grid">
            {schedule.stops.map((stop) => <StopCard key={stop.id} stop={stop} />)}
          </div>
        ) : (
          <div className="food-truck-empty-board">
            <CalendarDays className="h-6 w-6" strokeWidth={1.8} aria-hidden style={{ color: FOOD_ACCENT }} />
            <div>
              <h3 className="font-serif text-[20px]" style={{ color: "var(--app-ink)" }}>
                {scheduleUnavailable
                  ? "The weekly board is temporarily unavailable."
                  : "No published stops are on the board yet."}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {scheduleUnavailable
                  ? "The local roster is still available."
                  : "Browse the roster for menus and vendor updates."}
              </p>
              <a
                href="#vendors"
                className="tap-44-y mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold underline underline-offset-4"
                style={{ color: FOOD_ACCENT }}
              >
                Browse local trucks
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              </a>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            Every stop includes the public source we checked.
          </p>
          <FeedbackLink />
        </div>
          </section>
        }
        trucks={<FoodTruckBoard trucks={boardItems} stops={schedule.stops} accent={FOOD_ACCENT} />}
      />

      {ownerView ? null : <OwnerDoor unlisted={unlistedStopVendors} lead={false} />}
    </div>
  );
}
