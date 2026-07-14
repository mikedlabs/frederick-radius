import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import DealsWallet from "@/components/today/DealsWallet";

/**
 * Today's specials — the verified day-of-week deals as a WALLET CARD STACK.
 *
 * The dossier masthead (verified seal + serif title + dateline rule) stays a
 * calm server-rendered header; the deals themselves are handed to DealsWallet,
 * which fans them as brand-hued laminated cards that tuck + raise EXACTLY like
 * the Saved page's wallet deck (the shared `.sw-*` language). One system across
 * the app: the specials you can go get today read like the places you saved.
 */
const MAX_ROWS = 12;

export default function TodaysDealsStack({
  deals,
  weekday,
}: {
  deals: TodaysDeal[];
  weekday: string;
  /** dayNum is still accepted by the caller; the rich-card masthead leads with
   *  the weekday instead of a giant numeral, so it's intentionally unused. */
  dayNum?: string;
}) {
  const shown = deals.slice(0, MAX_ROWS);

  return (
    <section aria-label={`Today's specials for ${weekday}`} className="space-y-3">
      {/* Dossier masthead — a pressed VERIFIED seal (the moat's trust anchor),
          the serif section title, and a mono dateline carrying the weekday +
          count, closed with the field-guide hairline rule. Reads as a filed
          report, not a loose list header. */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 px-0.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand-2) 15%, var(--app-bg-elevated))",
              boxShadow: "var(--app-edge), var(--app-hi)",
              color: "var(--app-brand-2)",
            }}
          >
            <BadgeCheck className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            {/* "Today's specials", not "Today's briefing": the bottom drawer is
                already "The full briefing", and two things named "briefing" on
                one page is a naming collision (Jul-8 audit). This header says
                the true thing — the tally line underneath already earns it. */}
            <h2 className="font-serif text-[19px] font-semibold leading-none tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
              Today&rsquo;s specials
            </h2>
            <p className="fg-eyebrow mt-1.5">
              {weekday} · {deals.length} verified {deals.length === 1 ? "special" : "specials"}
            </p>
          </div>
        </div>
        <div className="fg-rule" aria-hidden />
      </div>

      {/* The wallet deck — brand-hued laminated cards that fan + raise like the
          Saved deck (DealsWallet reuses the shipped .sw-* language). */}
      {shown.length === 0 ? (
        <p className="px-0.5 py-2 font-serif text-[14px]" style={{ color: "var(--app-ink-3)" }}>
          No verified specials today.
        </p>
      ) : (
        <DealsWallet deals={shown} />
      )}

      <Link
        href="/deals"
        className="tap-44 flex items-center justify-between px-0.5 text-[12px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        All specials, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
