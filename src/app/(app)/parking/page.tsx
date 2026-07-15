import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleParking,
  Clock,
  CreditCard,
  Smartphone,
  Snowflake,
  Sparkles,
  Trash2,
  Zap,
  ExternalLink,
  AlertTriangle,
  Music,
  Theater,
  ShoppingBag,
  Moon,
  KeyRound,
  Receipt,
  Bell,
  Accessibility,
  type LucideIcon,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import {
  PARKING_GARAGES,
  PARKING_RATE_SCHEDULE,
  PARKING_OFFICE,
  PARKING_ACCESSIBILITY,
} from "@/data/parking-garages";
import { cityMapsFor } from "@/data/city-maps";
import {
  occupancyByGarageSlug,
  type GarageOccupancy,
} from "@/lib/integrations/parking-live";

// "Common requests" — intent-led entry tiles, same pattern as
// /contacts. Each tile routes to either the specific garage best
// suited to the activity (links to /places/<slug>) or to an
// external action (the City of Frederick's parking page for
// tickets / permits / tow info, ParkMobile for the app itself).
// The list intentionally answers the user's QUESTION, not the
// directory's structure — most people arrive at /parking with a
// destination in mind, not a garage name.
type ParkIntent = {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  /** Either an internal href ("/places/...") or an external URL. */
  href: string;
  /** Skip rel/target wiring when false. */
  external?: boolean;
};

const CITY_PARKING_URL = "https://www.cityoffrederickmd.gov/207/Parking";

const PARK_INTENTS: ParkIntent[] = [
  {
    label: "Carroll Creek concert",
    hint: "Alive @ Five, summer movies: Carroll Creek Deck is closest",
    icon: Music,
    accent: "var(--app-brand)",
    href: "/places/carroll-creek-parking-garage-frederick",
  },
  {
    label: "Weinberg or theaters",
    hint: "Weinberg Center, Maryland Ensemble: Church Street Garage",
    icon: Theater,
    accent: "var(--app-accent)",
    href: "/places/church-street-garage",
  },
  {
    label: "Market Street shopping",
    hint: "Boutiques, restaurants, the center of downtown: Court Street Garage",
    icon: ShoppingBag,
    accent: "var(--app-brand-2)",
    href: "/places/court-street-parking-garage-frederick",
  },
  {
    label: "Late dinner, easy exit",
    hint: "All garages run 24/7: West Patrick is the quickest off-ramp out",
    icon: Moon,
    accent: "var(--app-cool)",
    href: "/places/west-patrick-street-parking-deck",
  },
  {
    label: "Get the ParkMobile app",
    hint: "Pay every meter + every garage by zone number from your phone",
    icon: Smartphone,
    accent: "var(--app-positive)",
    href: "https://parkmobile.io/parking-app",
    external: true,
  },
  {
    label: "Pay a parking ticket",
    hint: "Pay, dispute, or look up a citation online",
    icon: Receipt,
    accent: "var(--app-ink-2)",
    href: CITY_PARKING_URL,
    external: true,
  },
  {
    label: "Car was towed",
    hint: "Call the City Parking Department BEFORE the police: most tows are routine",
    icon: AlertTriangle,
    accent: "var(--app-warning)",
    href: CITY_PARKING_URL,
    external: true,
  },
  {
    label: "Monthly permit",
    hint: "Set up a monthly garage permit for downtown commuters",
    icon: KeyRound,
    accent: "var(--app-brand)",
    href: CITY_PARKING_URL,
    external: true,
  },
];

export const metadata: Metadata = {
  alternates: { canonical: "/parking" },
  title: "Parking",
  description:
    "Downtown Frederick parking: the five city-owned garages, where to park for Alive @ Five, Carroll Creek, the Weinberg, and how the ParkMobile zone system works.",
};

/**
 * /parking — the canonical "where do I park downtown" surface.
 *
 * Built from the curated parking-garages.ts sidecar (which keys off
 * the place records in places-dfp.json). Each garage card shows
 * address, hours, payment methods, and a "what it's good for" note;
 * visitors tap through to the place page for hours-verified status
 * and the directions handoff.
 *
 * Rates are now surfaced (PARKING_RATE_SCHEDULE) — verified against
 * the City's published schedule (2026-06). We still link out to the
 * City for ticket/permit/tow specifics that genuinely drift.
 *
 * Phase B (deferred): street-parking ParkMobile zone polygons.
 * Requires shapefile from the City Parking Department.
 */
/**
 * Live availability pill for one garage — rendered only when the feed is wired
 * and reported this deck (otherwise null, so the card is unchanged). Honest
 * about the source: ParkZen's counts are crowd-sourced estimates, so this reads
 * "about this full," never an exact ledger. */
function GarageLiveBadge({ occ }: { occ: GarageOccupancy }) {
  const dot = (color: string) => (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
    />
  );
  let color = "var(--app-ink-3)";
  let text: string;
  if (occ.isFull) {
    color = "var(--app-warning)";
    text = "Full";
  } else if (occ.available !== null) {
    color = occ.isFilling ? "var(--app-accent-press)" : "var(--app-positive)";
    text = `${occ.available} ${occ.available === 1 ? "space" : "spaces"}`;
  } else if (occ.percentFull !== null) {
    color = occ.isFilling ? "var(--app-accent-press)" : "var(--app-positive)";
    text = `${occ.percentFull}% full`;
  } else if (occ.status) {
    text = occ.status;
  } else {
    return null;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
      title="Live availability via Park Frederick (ParkZen), crowd-sourced"
    >
      {dot(color)}
      {text}
    </span>
  );
}

export default async function ParkingPage() {
  // Live occupancy keyed by garage slug. Empty map when the feed is dormant
  // (the default) — the live availability badges simply don't render. The
  // alerts CTA shows regardless, because the predictive "garage usually fills"
  // nudge works today with no live feed.
  const occupancy = await occupancyByGarageSlug();
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-7 py-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Downtown Frederick
        </p>
        <h1
          className="font-serif text-[32px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Parking, the short answer.
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Downtown Frederick has five city-owned garages, all open
          24/7, all on the ParkMobile app. Street parking is metered
          via numbered ParkMobile zones (the number is on the sign;
          enter it in the app to pay). Pick the garage closest to
          where you are headed. Distances downtown are tiny, but the
          right garage saves a five-minute walk.
        </p>
      </header>

      {/* Garage rate schedule — verified against the City's published
          schedule (2026-06). Uniform across all five garages, so it
          shows once here as the at-a-glance answer to "what'll it cost?" */}
      <section
        aria-labelledby="parking-rate-heading"
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="parking-rate-heading"
            className="eyebrow"
            style={{ color: "var(--app-ink-3)" }}
          >
            Garage rates
          </h2>
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--app-ink-3)" }}
          >
            Cash or credit · all garages
          </span>
        </div>
        <p
          className="mt-1.5 font-serif text-[20px] font-semibold leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          {PARKING_RATE_SCHEDULE.hourly} · {PARKING_RATE_SCHEDULE.dailyMax} max
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          {[
            ["Daytime 6:30 AM – 3:30 PM", PARKING_RATE_SCHEDULE.daytimeMax],
            ["Overnight 3:30 PM – 6:30 AM", PARKING_RATE_SCHEDULE.nighttimeMax],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-[var(--app-radius-md)] px-3 py-2"
              style={{ background: "var(--app-bg-sunken)" }}
            >
              <dt style={{ color: "var(--app-ink-3)" }}>{k}</dt>
              <dd
                className="mt-0.5 font-semibold tabular-nums"
                style={{ color: "var(--app-ink)" }}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <p
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--app-positive) 12%, transparent)",
            color: "var(--app-positive)",
          }}
        >
          {PARKING_RATE_SCHEDULE.freeWindow}
        </p>
      </section>

      {/* Common requests — intent-led entry tiles, same pattern as
          /contacts. Routes the user straight to the right garage
          for what they're doing OR to the City's parking page for
          tickets/permits/tows. Sits ABOVE the comprehensive garage
          list so people who know what they want skip the directory. */}
      <section
        aria-labelledby="parking-intent-heading"
        className="space-y-2.5"
      >
        <h2
          id="parking-intent-heading"
          className="eyebrow px-1"
          style={{ color: "var(--app-ink-3)" }}
        >
          Common requests
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PARK_INTENTS.map((intent) => {
            const Icon = intent.icon;
            return (
              <li key={intent.label}>
                <a
                  href={intent.href}
                  target={intent.external ? "_blank" : undefined}
                  rel={intent.external ? "noopener noreferrer" : undefined}
                  aria-label={`${intent.label}: ${intent.hint}`}
                  className="hover-lift flex h-full flex-col items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
                  style={{
                    borderColor: "var(--app-border)",
                    boxShadow:
                      "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${intent.accent} 14%, transparent)`,
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={2}
                      style={{ color: intent.accent }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-[13px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {intent.label}
                    </span>
                    <span
                      className="mt-0.5 block text-[11px] leading-snug"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {intent.hint}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Method tile row — quick glance at HOW the city's parking
          system works before listing where the garages are. */}
      <section
        aria-labelledby="parking-method-heading"
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2
          id="parking-method-heading"
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          How payment works
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <li className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Smartphone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span>
              <span
                className="block text-[13px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                ParkMobile
              </span>
              <span
                className="mt-0.5 block text-[12px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                Every garage + every metered street is in the app. Enter
                the zone number on the sign and pay.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                color: "var(--app-cool)",
              }}
            >
              <CreditCard className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span>
              <span
                className="block text-[13px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Pay-at-exit
              </span>
              <span
                className="mt-0.5 block text-[12px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                Garages have a kiosk at the exit lane. Card or contactless
                tap works.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-accent) 14%, transparent)",
                color: "var(--app-accent-press)",
              }}
            >
              <Clock className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span>
              <span
                className="block text-[13px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Monthly permit
              </span>
              <span
                className="mt-0.5 block text-[12px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                If you park downtown daily, the City Parking Department
                sells monthly permits per garage.
              </span>
            </span>
          </li>
        </ul>
      </section>

      {/* Parking alerts CTA. The predictive "this garage usually fills before a
          big event, try another" nudge works today with no live feed, so this
          always shows; live full-alerts layer on once a feed is wired. */}
      <Link
        href="/settings/notifications"
        className="hover-lift flex items-center gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 transition"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
            color: "var(--app-brand)",
          }}
        >
          <Bell className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Get a heads-up before a garage fills
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Turn on parking alerts and we&rsquo;ll point you to a garage with space.
          </span>
        </span>
        <ArrowUpRight
          aria-hidden
          className="h-4 w-4 shrink-0"
          strokeWidth={2}
          style={{ color: "var(--app-ink-3)" }}
        />
      </Link>

      <section className="space-y-3">
        <h2
          className="font-serif text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The five garages
        </h2>
        <ul className="space-y-2.5">
          {PARKING_GARAGES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/places/${g.slug}`}
                className="hover-lift flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 transition"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow:
                    "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                    color: "var(--app-brand)",
                  }}
                >
                  <CircleParking
                    className="h-5 w-5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[15px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {g.name}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {g.address} · {g.hours}
                  </span>
                  {g.notes && (
                    <span
                      className="mt-1.5 block text-[13px] leading-snug"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {g.notes}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    {/* Live availability (when the feed is wired) leads the
                        pill row; dormant ⇒ nothing renders here. */}
                    {occupancy.get(g.slug) && (
                      <GarageLiveBadge occ={occupancy.get(g.slug)!} />
                    )}
                    {g.payment.includes("park-mobile") && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            "color-mix(in srgb, var(--app-brand) 10%, transparent)",
                          color: "var(--app-brand-press)",
                        }}
                      >
                        <Smartphone className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                        ParkMobile
                      </span>
                    )}
                    {g.payment.includes("pay-at-exit") && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            "color-mix(in srgb, var(--app-cool) 10%, transparent)",
                          color: "var(--app-cool)",
                        }}
                      >
                        <CreditCard className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                        Pay at exit
                      </span>
                    )}
                    {g.ev_charging && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            "color-mix(in srgb, var(--app-positive) 12%, transparent)",
                          color: "var(--app-positive)",
                        }}
                      >
                        <Zap className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                        EV charging
                      </span>
                    )}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 self-start"
                  strokeWidth={2}
                  style={{ color: "var(--app-ink-3)" }}
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Street parking — the second-most-asked question after "where
          do I park downtown". Covers metered zones, snow emergencies,
          street cleaning, residential permits. Without official GIS
          shapefile data we link out for specifics, but the rules
          themselves are documented here so a visitor knows what to
          look for. */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Street parking
        </h2>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          The downtown street grid is metered via ParkMobile zones.
          The zone number is printed on the sign at each block.
          Open the ParkMobile app, enter the number, pay for the
          duration you need. Time-limit and rate vary by zone; the
          sign always carries the current limit.
        </p>

        <ul className="grid gap-2.5 sm:grid-cols-2">
          {/* Snow emergency — biggest "you'll get towed" risk. */}
          <li
            className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
            style={{
              borderColor: "var(--app-border)",
              boxShadow:
                "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                color: "var(--app-cool)",
              }}
            >
              <Snowflake className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Snow emergency routes
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                When the city declares a snow emergency, parking is
                BANNED on designated routes (Patrick, Market, 7th, and
                others). Vehicles get ticketed and towed. Listen for
                the declaration on local news or check the city
                website during a storm.
              </span>
              <a
                href="https://www.cityoffrederickmd.gov/179/Snow-Removal"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                See snow-emergency route map
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
              </a>
            </span>
          </li>

          {/* Street cleaning — second-biggest tow risk. */}
          <li
            className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
            style={{
              borderColor: "var(--app-border)",
              boxShadow:
                "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-accent) 14%, transparent)",
                color: "var(--app-accent-press)",
              }}
            >
              <Trash2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Street cleaning days
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                Downtown blocks have weekly cleaning windows posted
                on the sign, typically a 2-3 hour AM block, one
                weekday per side. Park on the wrong side that
                morning and you&rsquo;ll find a ticket on the
                windshield.
              </span>
              <a
                href="https://www.cityoffrederickmd.gov/172/Street-Sweeping"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                See street-sweeping schedule
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
              </a>
            </span>
          </li>

          {/* Residential permit zones. */}
          <li
            className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
            style={{
              borderColor: "var(--app-border)",
              boxShadow:
                "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-brand-2) 14%, transparent)",
                color: "var(--app-brand-2)",
              }}
            >
              <Clock className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Residential permit zones
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                Several blocks bordering downtown (parts of
                Carrollton, Carroll Creek South, and the Hill area)
                are residential permit zones. Visitors get 2 hours
                free, then a ticket unless they have a guest pass
                or zone permit. Signs always carry the rule.
              </span>
              <a
                href="https://www.cityoffrederickmd.gov/142/Parking"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                Residential parking info
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
              </a>
            </span>
          </li>

          {/* Event-day closures. */}
          <li
            className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
            style={{
              borderColor: "var(--app-border)",
              boxShadow:
                "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[14px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Event-day closures
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                First Saturday, Alive @ Five, the In the Streets
                festival, and a few other recurring events close
                specific blocks. Move your car the night before if
                you live or stay on one of those streets. Signage
                goes up Friday afternoon.
              </span>
            </span>
          </li>
        </ul>

        <p
          className="flex items-start gap-2 rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
            color: "var(--app-ink-2)",
          }}
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--app-warning)" }}
            aria-hidden
          />
          <span>
            Tow-and-impound is real downtown. If your car&rsquo;s gone, call
            the City Parking Department before you call the police.
            Most &ldquo;thefts&rdquo; downtown turn out to be tows from a snow
            route or street-cleaning violation.
          </span>
        </p>
      </section>

      {/* Accessible parking + the City parking office — the buried-civic
          answers (verified against the City, 2026-06). */}
      <section
        aria-labelledby="parking-access-heading"
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2
          id="parking-access-heading"
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          Accessible parking
        </h2>
        <ul className="mt-2 space-y-1.5">
          {PARKING_ACCESSIBILITY.map((rule) => (
            <li
              key={rule}
              className="flex gap-2 text-[13px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Accessibility className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
            City Parking Office
          </span>
          <span>{PARKING_OFFICE.address}</span>
          <a
            href={`tel:${PARKING_OFFICE.phone.replace(/[^0-9]/g, "")}`}
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            {PARKING_OFFICE.phone}
          </a>
        </div>
      </section>

      {/* Printable City maps relevant to parking (downtown parking, snow
          routes, street sweeping, mobility district). */}
      <section
        aria-labelledby="parking-maps-heading"
        className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <h2 id="parking-maps-heading" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Printable maps
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {cityMapsFor("/parking").map((m) => (
            <li key={m.id}>
              <a
                href={m.blobUrl ?? m.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
              >
                {m.title} (PDF)
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer
        className="space-y-2 border-t pt-4 text-[12px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          For monthly permit pricing and event-day
          surge information, see the City of Frederick&rsquo;s parking
          page:{" "}
          <a
            href="https://www.cityoffrederickmd.gov/142/Parking"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            cityoffrederickmd.gov/parking
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
          </a>
          .
        </p>
        <p>
          Street parking zone polygons (the numbered ParkMobile zones
          on every block) are coming once we get the official shapefile
          from the City. If you work in parking ops and can share, get
          in touch.
        </p>
      </footer>
    </div>
  );
}
