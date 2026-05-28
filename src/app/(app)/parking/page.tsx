import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleParking,
  Clock,
  CreditCard,
  Smartphone,
  Zap,
  ExternalLink,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import { PARKING_GARAGES } from "@/data/parking-garages";

export const metadata: Metadata = {
  title: "Parking",
  description:
    "Downtown Frederick parking — the five city-owned garages, where to park for Alive @ Five, Carroll Creek, the Weinberg, and how the ParkMobile zone system works.",
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
 * The page deliberately doesn't list per-hour rates — those drift
 * and the editor hasn't confirmed them yet. Linking out to the
 * City's parking page for current rates is the honest move until
 * we have rate data we trust.
 *
 * Phase B (deferred): street-parking ParkMobile zone polygons.
 * Requires shapefile from the City Parking Department.
 */
export default function ParkingPage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-7 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

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
          your destination — distances downtown are tiny, but the
          right garage saves a five-minute walk.
        </p>
      </header>

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
                className="mt-0.5 block text-[11.5px] leading-snug"
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
                className="mt-0.5 block text-[11.5px] leading-snug"
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
                color: "var(--app-accent)",
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
                className="mt-0.5 block text-[11.5px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                If you park downtown daily, the City Parking Department
                sells monthly permits per garage.
              </span>
            </span>
          </li>
        </ul>
      </section>

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
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {g.payment.includes("park-mobile") && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            "color-mix(in srgb, var(--app-brand) 10%, transparent)",
                          color: "var(--app-brand)",
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

      <footer
        className="space-y-2 border-t pt-4 text-[12px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          For current rates, monthly permit pricing, and event-day
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
