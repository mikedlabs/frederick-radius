import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";
import IconStamp from "@/components/ui/IconStamp";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Today's Intel — the verified day-of-week specials as a LETTERPRESS MENU.
 *
 * High-end the way the brand defines it: restraint executed as material craft,
 * not chrome. Opaque card stock + paper grain, raised one notch above the photo
 * wallet above it (elev-2) so the imageless plate still reads as the anchor; an
 * editorial masthead with a big serif date struck by a gold foil bar; ONE hero
 * special (a gold category seal + larger serif deal) set off by a debossed rule;
 * then a refined, small-caps supporting index; closed by an embossed wax seal.
 * Typography + depth + foil do the work — no boxes, no badges. Server component.
 */
const MAX_ROWS = 12;

/**
 * One menu line. The hero (first) row is the focal special — a gold category
 * seal, larger serif, a stronger debossed break above it. Supporting rows are
 * the quiet index — smaller serif, small-caps venue label, soft hairline rule.
 * Deal-first either way: the offer leads (figure popped in gold), venue + town
 * + hours follow as attribution.
 */
function IntelRow({ deal: d, hero = false }: { deal: TodaysDeal; hero?: boolean }) {
  const { hook, rest } = splitDeal(d.offer);
  // With a gold figure, the body recedes a half-step beneath it; with none, the
  // offer carries the deal at full weight.
  const tail = hook ? rest : d.offer;
  const body = hook && tail ? tail.charAt(0).toLowerCase() + tail.slice(1) : tail;
  const bodyColor = hook
    ? hero ? "var(--app-ink-2)" : "var(--app-ink-3)"
    : hero ? "var(--app-ink)" : "var(--app-ink-2)";
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");
  const cat = d.category ? CATEGORY_BY_SLUG[d.category] : undefined;

  // The hero gets a stronger ink rule (the "break before the special"); the
  // supporting rows get the soft debossed hairline.
  const borderTop = hero
    ? "1px solid color-mix(in srgb, var(--app-ink) 20%, transparent)"
    : "1px solid color-mix(in srgb, var(--app-border) 45%, transparent)";

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className={`tactile-interactive group flex items-start gap-3 ${hero ? "py-4" : "py-3"}`}
      style={{ borderTop }}
    >
      {/* The one engraved anchor — hero only, gold seal. Omitted when the
          category has no glyph (a lone generic pin reads cheaper than none). */}
      {hero && cat && (
        <span className="mt-0.5 shrink-0">
          <IconStamp size="sm" accent="var(--app-accent)">
            <CategoryIcon slug={d.category!} />
          </IconStamp>
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* The deal — figure in foil gold, body in serif, clamped (long deals
            never wall-of-text; the full text is one tap away). */}
        <p
          className={`font-serif font-semibold leading-snug tracking-tight ${
            hero ? "line-clamp-3 text-[17px]" : "line-clamp-2 text-[15px]"
          }`}
        >
          {hook && (
            <span
              className={`font-mono font-bold tabular-nums tracking-[0.01em] ${hero ? "text-[15px]" : "text-[14px]"}`}
              style={{ color: "var(--app-accent-press)" }}
            >
              {hook}
            </span>
          )}
          {hook ? " " : ""}
          <span style={{ color: bodyColor }}>{body}</span>
        </p>

        {/* Attribution: hero venue set as a serif title; supporting venues as a
            small-caps whisper. Hours/town in quiet mono. */}
        <p className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 ${hero ? "mt-1.5" : "mt-1"}`}>
          {hero ? (
            <span className="font-serif text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {d.name}
            </span>
          ) : (
            <span
              className="max-w-full truncate text-[12px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: "var(--app-ink-2)" }}
            >
              {d.name}
            </span>
          )}
          {meta && (
            <span
              className={`shrink-0 font-mono uppercase ${hero ? "text-[10px] tracking-[0.07em]" : "text-[9.5px] tracking-[0.06em]"}`}
              style={{ color: "var(--app-ink-3)" }}
            >
              {meta}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export default function TodaysDealsStack({
  deals,
  weekday,
  dayNum,
}: {
  deals: TodaysDeal[];
  weekday: string;
  dayNum: string;
}) {
  const shown = deals.slice(0, MAX_ROWS);

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2">
      {/* The plate — opaque card stock + paper grain, raised a notch (elev-2) so
          the imageless ledger out-depths the photo wallet above it. */}
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] px-5 pb-4 pt-4"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-2), var(--app-hi), var(--app-edge)",
        }}
      >
        {/* Masthead — eyebrow + serif weekday on the left, a commanding date
            numeral struck by a gold foil bar on the right. */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-accent-press)" }}>
              Today&rsquo;s Intel
            </p>
            <p
              className="mt-1 font-serif text-[26px] font-semibold leading-none tracking-tight max-[359px]:text-[22px]"
              style={{ color: "var(--app-ink)" }}
            >
              {weekday}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="font-serif text-[40px] font-semibold leading-none tabular-nums tracking-tight max-[359px]:text-[34px]"
              style={{ color: "var(--app-ink)" }}
            >
              {dayNum}
            </p>
            {/* Struck gold foil bar — an honest, display-reliable foil stamp
                under the numeral (never a CSS bevel). */}
            <span aria-hidden className="ml-auto mt-1 block h-[2px] w-7 rounded-full" style={{ background: "var(--app-accent)" }} />
            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              {deals.length} verified
            </p>
          </div>
        </div>

        {/* Struck ornament between masthead and menu. */}
        <div aria-hidden className="mb-1 mt-3.5 flex items-center gap-2.5">
          <span className="h-px flex-1" style={{ background: "color-mix(in srgb, var(--app-ink) 14%, transparent)" }} />
          <span className="h-[5px] w-[5px] rotate-45" style={{ background: "var(--app-accent)" }} />
          <span className="h-px flex-1" style={{ background: "color-mix(in srgb, var(--app-ink) 14%, transparent)" }} />
        </div>

        {/* The menu — a hero special, then the refined index. */}
        {shown.length === 0 ? (
          <p className="py-4 text-center font-serif text-[14px]" style={{ color: "var(--app-ink-3)" }}>
            No verified intel today.
          </p>
        ) : (
          <ul>
            {shown.map((d, i) => (
              <li key={d.slug}>
                <IntelRow deal={d} hero={i === 0} />
              </li>
            ))}
          </ul>
        )}

        {/* Embossed wax seal sign-off. */}
        <div
          className="mt-4 flex flex-col items-center gap-1.5 pt-3.5"
          style={{ borderTop: "1px solid color-mix(in srgb, var(--app-border) 40%, transparent)" }}
        >
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand-2) 12%, var(--app-bg-elevated-solid))",
              boxShadow: "var(--app-edge), var(--app-hi)",
              color: "var(--app-brand-2)",
            }}
          >
            <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-2)" }}>
            Verified at the source
          </span>
        </div>
      </div>

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
