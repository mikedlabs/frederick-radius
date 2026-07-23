import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  Radio,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { FOOD_TRUCK_BY_SLUG, FOOD_TRUCKS } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import { getFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { foodTruckStopDirectionsUrl } from "@/lib/food-trucks/presentation";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import FoodTruckBoard, { type FoodTruckBoardItem } from "@/components/food-trucks/FoodTruckBoard";
import PageBloom from "@/components/ui/PageBloom";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

const FOOD_ACCENT = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Food trucks in Frederick County",
  description:
    "See confirmed food-truck stops this week and browse Frederick County vendors.",
  alternates: { canonical: "/food-trucks" },
  openGraph: {
    title: "Food trucks in Frederick County",
    description: "A weekly board of confirmed stops and local mobile vendors.",
    images: [{
      url: "/brand/social/og-food-trucks.png",
      width: 1200,
      height: 630,
      alt: "Find the food trucks. Confirmed weekly stops and 20 local vendors in Frederick County.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Food trucks in Frederick County",
    description: "Confirmed weekly stops and a roster of local mobile vendors.",
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

function scheduleTime(stop: FoodTruckScheduleStop): string {
  const start = formatTime(stop.startsAt);
  return stop.endsAt ? `${start}–${formatTime(stop.endsAt)}` : start;
}

function vendorHref(vendor: FoodTruckScheduleStop["vendors"][number]): string | undefined {
  if (!vendor.slug) return undefined;
  return FOOD_TRUCK_BY_SLUG.has(vendor.slug) ? `#truck-${vendor.slug}` : undefined;
}

function StopCard({ stop }: { stop: FoodTruckScheduleStop }) {
  return (
    <article className="food-truck-stop-card">
      <div className="food-truck-stop-date">
        <span>{formatDate(stop.startsAt, "long")}</span>
        <strong>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(new Date(stop.startsAt))}</strong>
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

export default async function FoodTrucksPage() {
  const [beaconByTruck, schedule] = await Promise.all([
    getFreshestBeaconByTruck(),
    getFoodTruckSchedule(),
  ]);
  const liveCount = beaconByTruck.size;
  const scheduledSlugs = new Set(
    schedule.stops.flatMap((stop) => stop.vendors.map((vendor) => vendor.slug).filter(Boolean) as string[]),
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
  const healthySources = schedule.sources.filter((source) => source.ok).length;

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Food trucks in Frederick County",
    description: "Confirmed food-truck stops and Frederick County vendors.",
    mainEntity: itemListJsonLd(
      "Food trucks in Frederick County",
      FOOD_TRUCKS.map((truck) => ({ name: truck.name, path: `/food-trucks#truck-${truck.slug}` })),
    ),
  };

  return (
    <div className="relative space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }} />
      <PageBloom variant="single" />

      <header className="food-truck-masthead">
        <div className="food-truck-masthead-copy">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.15em]">
            Frederick County food-truck board
          </p>
          <h1>Find where they pull in.</h1>
          <p>
            Start with confirmed stops for the week. Each vendor profile leads to its latest location post and any published dates.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="#this-week" className="tap-44 inline-flex items-center gap-2 rounded-full bg-[var(--app-ink)] px-4 py-2.5 text-[12px] font-semibold text-[var(--app-bg)]">
              This week
              <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
            </a>
            <a href="#vendors" className="tap-44 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}>
              Meet the trucks
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </a>
          </div>
        </div>
        <div className="food-truck-route-board" aria-label={`${schedule.stops.length} confirmed stops this week and ${liveCount} live trucks`}>
          <div>
            <span>Confirmed</span>
            <strong>{schedule.stops.length}</strong>
            <small>next 8 days</small>
          </div>
          <div>
            <span>Live pins</span>
            <strong>{liveCount}</strong>
            <small>{liveCount > 0 ? "operator verified" : "none active"}</small>
          </div>
          <Truck className="food-truck-route-icon" strokeWidth={1.5} aria-hidden />
        </div>
      </header>

      <section id="this-week" className="scroll-mt-24 space-y-4">
        <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>
              Confirmed by vendors and hosts
            </p>
            <h2 className="mt-1 font-serif text-[29px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
              This week&rsquo;s stops
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
            <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            {healthySources}/{schedule.sources.length} feeds checked
          </span>
        </div>

        {schedule.stops.length > 0 ? (
          <div className="food-truck-stop-grid">
            {schedule.stops.map((stop) => <StopCard key={stop.id} stop={stop} />)}
          </div>
        ) : (
          <div className="food-truck-empty-board">
            <CalendarDays className="h-6 w-6" strokeWidth={1.8} aria-hidden style={{ color: FOOD_ACCENT }} />
            <div>
              <h3 className="font-serif text-[20px]" style={{ color: "var(--app-ink)" }}>No confirmed stops are on the board yet.</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                That does not mean every truck is parked. Browse the roster and check a vendor&rsquo;s latest post before heading out.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="food-truck-beacon-preview" aria-labelledby="beacon-preview-title">
        <div className="food-truck-beacon-map" aria-hidden>
          <span className="food-truck-beacon-road food-truck-beacon-road-a" />
          <span className="food-truck-beacon-road food-truck-beacon-road-b" />
          <span className="food-truck-beacon-pulse"><Truck className="h-4 w-4" strokeWidth={2} /></span>
          <span className="food-truck-beacon-label"><strong>Example live pin</strong> · here until 8 p.m.</span>
        </div>
        <div className="p-4 sm:p-5">
          <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ color: FOOD_ACCENT }}>
            <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Owner pilot
          </p>
          <h2 id="beacon-preview-title" className="mt-1 font-serif text-[24px] leading-tight" style={{ color: "var(--app-ink)" }}>
            Drop a live pin while you are serving.
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Approved truck owners can publish a temporary map pin with their current stop. The owner chooses when it disappears. The example shows the format and is not a real location.
          </p>
          <Link href="/food-trucks/claim" className="tap-44 mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold underline" style={{ color: FOOD_ACCENT }}>
            Set up my truck
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </section>

      <FoodTruckBoard trucks={boardItems} stops={schedule.stops} accent={FOOD_ACCENT} />

      <aside className="food-truck-owner-door rounded-[var(--app-radius-lg)] border p-4 sm:flex sm:items-center sm:justify-between sm:gap-5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>For truck owners</p>
          <p className="mt-1 font-serif text-[21px] leading-tight" style={{ color: "var(--app-ink)" }}>Make this listing useful before someone arrives.</p>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Add an approved truck photo, menu, public calendar, booking link, and temporary live locations. There is no account dashboard to maintain.
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
      </aside>
    </div>
  );
}
