import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Tag } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal, figureCount } from "@/lib/happyHourDeal";
import DealLines from "@/components/happy/DealLines";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Today's briefing — the verified day-of-week specials as rich, photo-forward
 * cards with an EMBOSSED GOLD DENOMINATION (the "$10 / $4 / $1" struck like a
 * gift-card figure). The card face carries the venue's real photo, the deal in
 * serif, and the day/town/hours in mono; the denomination is the foil-gold
 * star. Shares the photo-card language of the Happy-Hour wallet above it (so
 * the moat surfaces read as one set) and adds the struck figure on top, so
 * the briefing is the richer of the two, not the plainer. Server component.
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
        <CategoryIcon slug={category} className="h-7 w-7" />
      ) : (
        <Tag className="h-7 w-7" strokeWidth={1.6} />
      )}
    </div>
  );
}

function IntelCard({ deal: d }: { deal: TodaysDeal }) {
  // The struck gold denomination is only honest when the deal names exactly ONE
  // figure (then "$8" + "personal pizza" reads cleanly). For a multi-part deal a
  // single struck number would strand its subject, so we drop the figure and
  // render the offer as clause lines instead (each figure glued to its item).
  const { hook } = splitDeal(d.offer);
  const single = figureCount(d.offer) === 1 && Boolean(hook);
  const fig = single && hook ? denom(hook) : null;
  const body = d.offer ? d.offer.charAt(0).toUpperCase() + d.offer.slice(1) : d.offer;
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
      {/* Venue photo (or a designed plate) — larger for presence. */}
      <div
        className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[var(--app-radius-sm)]"
        style={{ backgroundColor: "var(--app-brand-2)" }}
      >
        {d.photo ? (
          <Image src={d.photo} alt="" fill sizes="76px" className="object-cover" />
        ) : (
          <PhotoFallback category={d.category} />
        )}
      </div>

      {/* The deal — venue, the offer, the when/where. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <h3 className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
          {d.name}
        </h3>
        {fig ? (
          <p className="line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {body}
          </p>
        ) : (
          <DealLines deal={d.offer} max={2} className="space-y-0.5 text-[12.5px]" />
        )}
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
    <section aria-label={`Today's briefing for ${weekday}`} className="space-y-3">
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
            <h2 className="font-serif text-[19px] font-semibold leading-none tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
              Today&rsquo;s briefing
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
