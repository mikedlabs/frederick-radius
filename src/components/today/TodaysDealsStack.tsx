import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Tag } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import DealLines from "@/components/happy/DealLines";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Today's specials — the verified day-of-week deals as photo-forward cards.
 *
 * Every card reads the SAME way: venue photo (or a designed plate), the offer
 * as clause lines (each figure glued to its item, e.g. "$8 old fashioneds"),
 * and the day/town/hours in mono. The old embossed-gold denomination was
 * dropped (owner call): it only rendered for deals that named exactly one
 * figure, so a "$8" card sat beside a figure-less "Whiskey Wednesday returns"
 * card and the set read as half-finished. A hero number that can't appear on
 * every card is inconsistent by nature, so it comes off entirely, and the
 * offer text carries the value uniformly. Server component.
 */
const MAX_ROWS = 12;

/** The photo-less fallback: a tinted plate with the category glyph in gold. */
function PhotoFallback({ category }: { category?: string }) {
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{
        background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 32%, var(--app-brand-2)) 0%, var(--app-brand-2) 78%)",
        color: "color-mix(in srgb, var(--app-accent) 55%, var(--app-on-brand))",
      }}
    >
      {category && CATEGORY_BY_SLUG[category] ? (
        <CategoryIcon slug={category} className="h-7 w-7" />
      ) : (
        <Tag className="h-7 w-7" strokeWidth={1.6} />
      )}
    </div>
  );
}

function IntelCard({ deal: d }: { deal: TodaysDeal }) {
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive flex items-stretch gap-3.5 overflow-hidden rounded-[var(--app-radius-md)] p-3"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
      }}
    >
      {/* Venue photo (or a designed plate) — larger for presence. The tinted
          glyph plate ALWAYS renders as the base layer, with the photo layered
          over it, so a missing OR failed photo shows the designed plate — a
          card can never render as a bare spruce rectangle (Jul-8 audit: five
          of seven cards were flat green slabs when photos didn't load). */}
      <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[var(--app-radius-sm)]">
        <PhotoFallback category={d.category} />
        {d.photo && <Image src={d.photo} alt="" fill sizes="76px" className="object-cover" />}
      </div>

      {/* The deal — venue, the offer as clause lines, the when/where. Every card
          renders identically now (no conditional hero figure). */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <h3 className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
          {d.name}
        </h3>
        <DealLines deal={d.offer} max={2} className="space-y-0.5 text-[12.5px]" />
        {meta && (
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {meta}
          </p>
        )}
      </div>
    </Link>
  );
}

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

      {/* The deck of struck-denomination cards. */}
      {shown.length === 0 ? (
        <p className="px-0.5 py-2 font-serif text-[14px]" style={{ color: "var(--app-ink-3)" }}>
          No verified specials today.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.slug}>
              <IntelCard deal={d} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/deals"
        className="tap-44 flex items-center justify-between px-0.5 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        All specials, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
