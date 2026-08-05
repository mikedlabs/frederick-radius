import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { todayDealAvailability } from "@/lib/today/dealAvailability";

/**
 * Today's specials as a direct, scan-first ledger. Offer, venue, and timing
 * stay visible without expanding anything; the whole row opens the place.
 */
const MAX_ROWS = 3;

const STATUS_COLOR = {
  now: "var(--app-positive)",
  later: "var(--app-accent-press)",
  today: "var(--app-ink-3)",
  earlier: "var(--app-ink-3)",
} as const;

export default function TodaysDealsStack({
  deals,
  weekday,
  now,
  embedded = false,
}: {
  deals: TodaysDeal[];
  weekday: string;
  now: Date;
  embedded?: boolean;
}) {
  // One denominator for "specials": everything still actionable today (live
  // now, later, or unclocked-today). The footer used to count ALL of today's
  // deals including the ones already over, so the band's "3 specials" meta
  // and a "See all 31 specials" footer could disagree on the same screen.
  const actionable = deals
    .map((deal, index) => ({
      deal,
      index,
      availability: todayDealAvailability(deal.hours, weekday, now),
    }))
    .filter(({ availability }) => availability.state !== "earlier");
  const shown = actionable
    .sort((a, b) => a.availability.rank - b.availability.rank || a.index - b.index)
    .slice(0, MAX_ROWS);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="today-specials-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h3
            id="today-specials-heading"
            className={`${embedded ? "text-[17px] font-sans font-semibold" : "text-[20px] font-serif"} leading-tight tracking-[-0.01em]`}
            style={{ color: "var(--app-ink)" }}
          >
            Specials
          </h3>
        </div>
        <span
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--app-positive) 10%, var(--app-bg-elevated))",
            color: "var(--app-positive)",
          }}
        >
          <BadgeCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Verified
        </span>
      </div>

      <ol
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
          {shown.map(({ deal, availability }) => {
            const category = deal.category ?? "restaurant";
            return (
              <li
                key={deal.slug}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Link
                  href={`/places/${deal.slug}`}
                  className="group flex min-h-[88px] items-start gap-3 px-3.5 py-3.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)]"
                >
                  <PlaceMedallion
                    place={{
                      slug: deal.slug,
                      name: deal.name,
                      category,
                      google_photo_url: deal.photo,
                    }}
                    size={44}
                    className="mt-0.5"
                  />

                  <span className="min-w-0 flex-1">
                    {/* text-wrap pretty: multi-line deal headlines ("… by the
                        bottle / only") otherwise orphan their last word. */}
                    <span
                      className="block font-sans text-[17px] font-semibold leading-[1.22] tracking-[-0.01em] [text-wrap:pretty]"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {deal.headline}
                    </span>
                    <span
                      className="mt-1 block text-[13.5px] font-semibold leading-snug"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {deal.name}
                      {deal.town ? (
                        <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>
                          {" · "}
                          {deal.town}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] leading-none">
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold"
                        style={{ color: STATUS_COLOR[availability.state] }}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: STATUS_COLOR[availability.state] }}
                        />
                        {availability.label}
                      </span>
                      {availability.when ? (
                        <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                          {availability.when}
                        </span>
                      ) : null}
                      {deal.terms ? (
                        <span style={{ color: "var(--app-ink-3)" }}>{deal.terms}</span>
                      ) : null}
                    </span>
                  </span>

                  <ChevronRight
                    aria-hidden
                    className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2.25}
                    style={{ color: "var(--app-ink-3)" }}
                  />
                </Link>
              </li>
            );
          })}
      </ol>

      <Link
        href="/deals"
        className="tap-44 flex min-h-11 items-center justify-between px-0.5 text-[13px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        {actionable.length > shown.length
          ? `See all ${actionable.length} specials still on today`
          : "See the full week of specials"}
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      </Link>
    </section>
  );
}
