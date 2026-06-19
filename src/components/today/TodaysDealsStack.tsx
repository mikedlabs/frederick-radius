import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Tag } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Today's Intel — the verified day-of-week specials as rich, photo-forward
 * cards with an EMBOSSED GOLD DENOMINATION (the "$10 / $4 / $1" struck like a
 * gift-card figure). The card face carries the venue's real photo, the deal in
 * serif, and the day/town/hours in mono; the denomination is the foil-gold
 * star. Shares the photo-card language of the Happy-Hour wallet above it (so
 * the moat surfaces read as one set) and adds the struck figure on top, so
 * Intel is the richer of the two, not the plainer. Server component.
 */
const MAX_ROWS = 12;

/** Split a deal hook ("$10 OFF", "25% OFF", "FROM $5", "$4") into the big
 *  struck figure and a small qualifier for the embossed denomination. */
function denom(hook: string): { figure: string; label: string } {
  const m = hook.match(/\$\s?\d+(?:\.\d{1,2})?|\d{1,3}\s?%/);
  if (!m) return { figure: hook, label: "" };
  return {
    figure: m[0].replace(/\s+/g, ""),
    label: hook.replace(m[0], "").replace(/[^a-zA-Z%]/g, " ").trim().toLowerCase(),
  };
}

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
        <CategoryIcon slug={category} className="h-5 w-5" />
      ) : (
        <Tag className="h-5 w-5" strokeWidth={1.6} />
      )}
    </div>
  );
}

function IntelCard({ deal: d }: { deal: TodaysDeal }) {
  const { hook, rest } = splitDeal(d.offer);
  const dealText = hook ? rest : d.offer;
  const body = hook && dealText ? dealText.charAt(0).toLowerCase() + dealText.slice(1) : dealText;
  const fig = hook ? denom(hook) : null;
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive flex items-stretch gap-3 overflow-hidden rounded-[var(--app-radius-md)] p-2.5"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
      }}
    >
      {/* Venue photo (or a designed plate). */}
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--app-radius-sm)]"
        style={{ backgroundColor: "var(--app-brand-2)" }}
      >
        {d.photo ? (
          <Image src={d.photo} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <PhotoFallback category={d.category} />
        )}
      </div>

      {/* The deal — venue, the offer, the when/where. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <h3 className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
          {d.name}
        </h3>
        <p className="line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {body}
        </p>
        {meta && (
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {meta}
          </p>
        )}
      </div>

      {/* The struck gold denomination — the foil figure (AA-safe gold), raised
          with a top highlight. Only when the deal carries a figure. */}
      {fig && (
        <div
          className="flex shrink-0 flex-col items-center justify-center self-stretch pl-3"
          style={{ borderLeft: "1px solid color-mix(in srgb, var(--app-ink) 10%, transparent)" }}
        >
          <span
            className="font-serif font-bold leading-none tabular-nums"
            style={{ fontSize: 28, color: "var(--app-accent-press)", textShadow: "0 1px 0 rgba(255,255,255,0.7)" }}
          >
            {fig.figure}
          </span>
          {fig.label && (
            <span className="mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-accent-press)" }}>
              {fig.label}
            </span>
          )}
        </div>
      )}
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
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2">
      {/* Slim masthead — the cards are the visual interest now. */}
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-accent-press)" }}>
            Today&rsquo;s Intel
          </span>
          <span className="font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {weekday}
          </span>
        </div>
        <span className="flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-2)" }}>
          <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          {deals.length} verified
        </span>
      </div>

      {/* The deck of struck-denomination cards. */}
      {shown.length === 0 ? (
        <p className="px-0.5 py-2 font-serif text-[14px]" style={{ color: "var(--app-ink-3)" }}>
          No verified intel today.
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
        All intel, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
