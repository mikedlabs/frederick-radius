import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * Today's Intel — the verified day-of-week specials set as a beautiful ALMANAC
 * MENU page: a warm paper plate with an editorial masthead (the serif day + a
 * big date numeral), a small struck ornament, then elegant priced lines (serif
 * venue · a fine dotted leader · the gold figure in the right-hand price
 * column), generous whitespace, and a quiet centered "verified at the source"
 * sign-off. Keeps the /happy-hour priced-index DNA but trades the utilitarian
 * ruled grid for editorial grace — typography carries the hierarchy. Server
 * component (plain Links).
 */
const MAX_ROWS = 12;

/** One menu line: serif venue · dotted leader · gold figure, then the gist. */
function IntelRow({ deal: d }: { deal: TodaysDeal }) {
  const { hook, rest } = splitDeal(d.offer);
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive group block py-2.5"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="shrink-0 truncate font-serif text-[16px] font-semibold leading-tight tracking-[-0.01em]"
          style={{ color: "var(--app-ink)", maxWidth: "58%" }}
        >
          {d.name}
        </span>
        <span
          aria-hidden
          className="mb-1 flex-1 self-end"
          style={{ borderBottom: "1.5px dotted color-mix(in srgb, var(--app-ink) 22%, transparent)" }}
        />
        <span
          className="shrink-0 text-right font-mono text-[14px] font-bold tabular-nums tracking-[0.01em]"
          style={{ minWidth: "56px", color: hook ? "var(--app-accent-press)" : "var(--app-ink-3)" }}
        >
          {hook ?? "Specials"}
        </span>
      </div>
      {(rest || meta) && (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {rest || d.offer}
          </span>
          {meta && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
              {meta}
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
  dayNum,
}: {
  deals: TodaysDeal[];
  weekday: string;
  dayNum: string;
}) {
  const shown = deals.slice(0, MAX_ROWS);

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2">
      {/* The almanac plate. */}
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] px-4 pb-3.5 pt-4"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
        }}
      >
        {/* Masthead: the eyebrow + serif day on the left, a big date numeral on
            the right. */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-accent-press)" }}>
              Today&rsquo;s Intel
            </p>
            <p className="mt-1 font-serif text-[20px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
              {weekday}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-serif text-[24px] font-semibold leading-none tabular-nums tracking-tight" style={{ color: "var(--app-ink)" }}>
              {dayNum}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              {deals.length} verified
            </p>
          </div>
        </div>

        {/* A small struck ornament between the masthead and the menu. */}
        <div aria-hidden className="mb-1 mt-3 flex items-center gap-2.5">
          <span className="h-px flex-1" style={{ background: "color-mix(in srgb, var(--app-ink) 16%, transparent)" }} />
          <span className="h-[5px] w-[5px] rotate-45" style={{ background: "var(--app-accent)" }} />
          <span className="h-px flex-1" style={{ background: "color-mix(in srgb, var(--app-ink) 16%, transparent)" }} />
        </div>

        {/* The menu — elegant priced lines, soft hairline dividers. */}
        <ul className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--app-border) 45%, transparent)" }}>
          {shown.map((d) => (
            <li key={d.slug}>
              <IntelRow deal={d} />
            </li>
          ))}
        </ul>

        {/* A quiet, centered sign-off. */}
        <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-2)" }}>
          <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          Verified at the source
        </p>
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
