import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { easternDayKey } from "@/lib/tz";
import { nextParkingArrival } from "@/lib/parking-visit";
import ParkingCostComparison from "@/components/parking/ParkingCostComparison";
import GarageDirectory from "@/components/parking/GarageDirectory";
import {
  Accessibility,
  ArrowUpRight,
  ExternalLink,
  KeyRound,
  Smartphone,
} from "lucide-react";
import {
  CITY_HOLIDAY_PARKING_URL,
  CITY_GARAGE_URL,
  CITY_STREET_URL,
  HOLIDAY_WEEKEND_PARKING,
  thanksgivingParkingWeek,
  showHolidayParking,
  PARKING_ACCESSIBILITY,
  PARKING_OFFICE,
} from "@/data/parking-garages";

const CITY_TICKET_URL = "https://www.cityoffrederickmd.gov/1347/Parking-ViolationFine-Payment";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/parking" },
  title: "Parking",
  description:
    "Downtown Frederick parking: compare the five City garages, see current rates and payment procedures, and understand where ParkMobile applies on the street.",
};

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold underline-offset-2 hover:underline"
      style={{ color: "var(--app-cool-text)" }}
    >
      {children}
      <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden />
    </a>
  );
}

export default function ParkingPage() {
  const now = new Date();
  const holidaySeason = showHolidayParking(now);
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-8 py-6">

      <header className={`grid gap-y-3 ${holidaySeason ? "md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start md:gap-x-6" : ""}`}>
        <p className="eyebrow md:col-start-1" style={{ color: "var(--app-ink-3)" }}>
          Frederick, Maryland
        </p>
        <h1
          className="md:col-start-1 font-serif text-[34px] font-semibold leading-[1.02] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Downtown parking
        </h1>
        <p
          className="md:col-start-1 max-w-prose text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Pay at a garage station. ParkMobile is for on-street spaces.
        </p>
        {holidaySeason && (
          <aside aria-labelledby="holiday-parking-heading" className="md:col-start-2 md:row-start-1 md:row-span-4 rounded-[var(--app-radius-lg)] border-l-4 px-4 py-3" style={{ borderColor: "var(--app-cool-text)", background: "var(--app-bg-sunken)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--app-cool-text)" }}>
              {thanksgivingParkingWeek(now) ? "Thanksgiving · Nov 26–29, 2026" : "Holiday weekends · through New Year’s Day"}
            </p>
            <h2 id="holiday-parking-heading" className="mt-1 font-serif text-xl font-semibold leading-tight">
              {thanksgivingParkingWeek(now) ? "City garages and street parking are free" : "Free weekend garage parking"}
            </h2>
            {thanksgivingParkingWeek(now) ? (
              <details className="mt-1 text-sm">
                <summary className="min-h-11 cursor-pointer content-center font-semibold">More holiday dates</summary>
                <p>{HOLIDAY_WEEKEND_PARKING}</p>
                <SourceLink href={CITY_HOLIDAY_PARKING_URL}>City holiday schedule</SourceLink>
              </details>
            ) : (
              <><p className="mt-1 text-sm">Saturday at 8 AM through Monday at 6 AM.</p><SourceLink href={CITY_HOLIDAY_PARKING_URL}>City holiday schedule</SourceLink></>
            )}
          </aside>
        )}
        <div className="flex flex-wrap gap-2 pt-1 md:col-start-1">
          <Link
            href="/map?mode=browse&intent=parking"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold"
            style={{ background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }}
          >
            Parking map
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </Link>
          <a
            href="#garages"
            className="inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            Choose a garage
          </a>
        </div>
      </header>

      <ParkingCostComparison today={easternDayKey(now)} arrivalDefault={nextParkingArrival(now)} />
      <GarageDirectory />

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
              color: "var(--app-cool-text)",
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
            <Accessibility className="h-5 w-5" style={{ color: "var(--app-cool-text)" }} aria-hidden />
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
              className="inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-cool-text)" }}
            >
              {PARKING_OFFICE.phone}
            </a>
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--app-ink-2)" }}>Take your ticket with you. Cash, coin, or card payments are accepted at a first-level pay station. At the exit, use a card or a ticket already validated at a pay station.</p>
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
