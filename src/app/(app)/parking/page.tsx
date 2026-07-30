import type { Metadata } from "next";
import Link from "next/link";
import {
  Accessibility,
  ArrowUpRight,
  CircleParking,
  Clock,
  CreditCard,
  ExternalLink,
  KeyRound,
  MapPin,
  Music,
  Receipt,
  ShoppingBag,
  Smartphone,
  Theater,
  Zap,
  type LucideIcon,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import {
  PARKING_ACCESSIBILITY,
  PARKING_GARAGES,
  PARKING_OFFICE,
  PARKING_RATE_SCHEDULE,
} from "@/data/parking-garages";

const CITY_GARAGE_URL = "https://www.cityoffrederickmd.gov/1342/Garage-Parking";
const CITY_STREET_URL = "https://www.cityoffrederickmd.gov/1341/Street-Parking";
const CITY_TICKET_URL = "https://www.cityoffrederickmd.gov/1347/Parking-ViolationFine-Payment";

export const metadata: Metadata = {
  alternates: { canonical: "/parking" },
  title: "Parking",
  description:
    "Downtown Frederick parking: compare the five City garages, see current rates and payment procedures, and understand where ParkMobile applies on the street.",
};

type ParkingIntent = {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

const INTENTS: ParkingIntent[] = [
  {
    label: "Carroll Creek",
    hint: "Start with Carroll Creek Garage",
    href: "/places/carroll-creek-parking-garage-frederick",
    icon: Music,
  },
  {
    label: "Weinberg Center",
    hint: "Start with Church Street Garage",
    href: "/places/church-street-garage",
    icon: Theater,
  },
  {
    label: "Market Street",
    hint: "Court Street is a central option",
    href: "/places/court-street-parking-garage-frederick",
    icon: ShoppingBag,
  },
  {
    label: "See every garage",
    hint: "Compare locations on the map",
    href: "/map?mode=browse&intent=parking",
    icon: MapPin,
  },
];

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold underline-offset-2 hover:underline"
      style={{ color: "var(--app-cool)" }}
    >
      {children}
      <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden />
    </a>
  );
}

function FactBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
        color: "var(--app-ink-2)",
      }}
    >
      {children}
    </span>
  );
}

export default function ParkingPage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-8 py-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-3">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Downtown Frederick
        </p>
        <h1
          className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Park without guessing.
        </h1>
        <p
          className="max-w-2xl text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Five City garages are open 24/7. ParkMobile is for on-street spaces;
          garages use tickets, first-level pay stations, and exit stations.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/map?mode=browse&intent=parking"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold"
            style={{ background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }}
          >
            Open the parking map
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </Link>
          <a
            href="#garages"
            className="inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            Compare garages
          </a>
        </div>
      </header>

      <section aria-labelledby="parking-start-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Start with your destination
            </p>
            <h2
              id="parking-start-heading"
              className="mt-1 font-serif text-[23px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              A useful first choice
            </h2>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {INTENTS.map((intent) => {
            const Icon = intent.icon;
            const content = (
              <>
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                    color: "var(--app-brand-press)",
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[14px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {intent.label}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {intent.hint}
                  </span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0"
                  strokeWidth={2}
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
              </>
            );
            const className =
              "hover-lift flex min-h-[78px] items-center gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 transition";
            const style = {
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            };
            return (
              <li key={intent.label}>
                {intent.external ? (
                  <a
                    href={intent.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    style={style}
                  >
                    {content}
                  </a>
                ) : (
                  <Link href={intent.href} className={className} style={style}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="garage-basics-heading"
        className="rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-5"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              City garage basics
            </p>
            <h2
              id="garage-basics-heading"
              className="mt-1 font-serif text-[23px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {PARKING_RATE_SCHEDULE.hourly} · {PARKING_RATE_SCHEDULE.dailyMax} max
            </h2>
          </div>
          <CircleParking
            className="h-7 w-7 shrink-0"
            strokeWidth={1.7}
            style={{ color: "var(--app-brand)" }}
            aria-hidden
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div
            className="rounded-[var(--app-radius-md)] p-3"
            style={{ background: "var(--app-bg-sunken)" }}
          >
            <Clock className="h-4 w-4" style={{ color: "var(--app-cool)" }} aria-hidden />
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Overnight maximum
            </p>
            <p className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {PARKING_RATE_SCHEDULE.nighttimeMax}
            </p>
          </div>
          <div
            className="rounded-[var(--app-radius-md)] p-3"
            style={{ background: "var(--app-bg-sunken)" }}
          >
            <CreditCard className="h-4 w-4" style={{ color: "var(--app-cool)" }} aria-hidden />
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              First-level pay stations
            </p>
            <p className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Cash, coin, or card
            </p>
          </div>
          <div
            className="rounded-[var(--app-radius-md)] p-3"
            style={{ background: "var(--app-bg-sunken)" }}
          >
            <Receipt className="h-4 w-4" style={{ color: "var(--app-cool)" }} aria-hidden />
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Sunday window
            </p>
            <p className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Free 8 AM–2 PM
            </p>
          </div>
        </div>
        <p
          className="mt-4 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Take the ticket with you. Pay at a first-level pay station before
          returning to your car, then insert the validated ticket at the exit.
          Exit stations accept credit cards or a ticket already validated at a
          pay station.
        </p>
        <div className="mt-2">
          <SourceLink href={CITY_GARAGE_URL}>Verify garage rates and payment</SourceLink>
        </div>
      </section>

      <section id="garages" aria-labelledby="garages-heading" className="scroll-mt-24 space-y-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Choose a garage
          </p>
          <h2
            id="garages-heading"
            className="mt-1 font-serif text-[23px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            All five City garages
          </h2>
        </div>
        <ul className="space-y-2.5">
          {PARKING_GARAGES.map((garage) => (
            <li key={garage.slug}>
              <Link
                href={`/places/${garage.slug}`}
                className="hover-lift flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 transition"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                    color: "var(--app-brand-press)",
                  }}
                >
                  <CircleParking className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[15px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {garage.name}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {garage.address} · {garage.hours}
                  </span>
                  {garage.notes && (
                    <span
                      className="mt-1.5 block text-[13px] leading-snug"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {garage.notes}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <FactBadge>Pay station</FactBadge>
                    <FactBadge>Card accepted at exit</FactBadge>
                    {garage.ev_charging && (
                      <FactBadge>
                        <Zap className="mr-1 h-3 w-3" strokeWidth={2.2} aria-hidden />
                        EV charging
                      </FactBadge>
                    )}
                  </span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0"
                  strokeWidth={2}
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="street-parking-heading"
        className="rounded-[var(--app-radius-xl)] border p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-cool) 5%, var(--app-bg-elevated))",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 12%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Smartphone className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Street parking
            </p>
            <h2
              id="street-parking-heading"
              className="mt-1 font-serif text-[23px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              ParkMobile applies on the street
            </h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
              Ways to pay
            </p>
            <p className="mt-1 leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Use the app, scan the posted QR code, text PARK to 77223, or call
              the number on the sign. The posted zone controls the rate and time limit.
            </p>
          </div>
          <div>
            <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
              Enforcement
            </p>
            <p className="mt-1 leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Monday–Saturday, 9 AM–6 PM. Street parking is free after 6 PM and
              all day Sunday. Selected downtown zones allow stays up to four hours.
            </p>
          </div>
        </div>
        <div className="mt-2">
          <SourceLink href={CITY_STREET_URL}>Open the official street-parking guide</SourceLink>
        </div>
      </section>

      <section aria-labelledby="parking-help-heading" className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex items-center gap-2">
            <Accessibility className="h-5 w-5" style={{ color: "var(--app-cool)" }} aria-hidden />
            <h2
              id="parking-help-heading"
              className="text-[15px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Accessible parking
            </h2>
          </div>
          <ul className="mt-3 space-y-2">
            {PARKING_ACCESSIBILITY.map((rule) => (
              <li
                key={rule}
                className="text-[12.5px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {rule}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" style={{ color: "var(--app-brand)" }} aria-hidden />
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Tickets, passes, and help
            </h2>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            City Parking Office<br />
            {PARKING_OFFICE.address}<br />
            <a
              href={`tel:${PARKING_OFFICE.phone.replace(/[^0-9]/g, "")}`}
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-cool)" }}
            >
              {PARKING_OFFICE.phone}
            </a>
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            <SourceLink href={CITY_TICKET_URL}>Pay a parking ticket</SourceLink>
            <SourceLink href={CITY_GARAGE_URL}>Garage passes</SourceLink>
          </div>
        </div>
      </section>

      <footer
        className="border-t pt-4 text-[11px] leading-relaxed"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Rates and procedures were checked against the City of Frederick&rsquo;s
        official parking pages. Posted signs and City notices control when conditions change.
      </footer>
    </div>
  );
}
