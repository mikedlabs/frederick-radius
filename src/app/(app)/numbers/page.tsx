import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { computeCountyNumbers, type LeaderRow } from "@/lib/county-numbers";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/numbers" },
  title: "Frederick County in numbers",
  description:
    "See counts of places, towns, brewery pours, field notes, and other records in the Frederick Radius dataset.",
};

// The numbers change when the dataset changes (deploys, overrides, the
// nightly recomputes) — daily is honest and cheap.
export const revalidate = 86_400;

/** Roman-numeraled plate heading, same idiom as the Compass index. */
function Plate({
  numeral,
  title,
  children,
}: {
  numeral: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <header className="mb-3 flex items-baseline gap-2.5">
        <span className="font-mono text-[11px] font-bold tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
          {numeral}.
        </span>
        <h2 className="font-serif text-[22px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 self-center" style={{ background: "var(--app-border)" }} />
      </header>
      {children}
    </section>
  );
}

/** A hero figure: big mono number, quiet label under it. */
function Stat({ value, label, href }: { value: string; label: string; href?: string }) {
  const body = (
    <>
      <span className="block font-mono text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
        {value}
      </span>
      <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </span>
    </>
  );
  const cls = "block rounded-[var(--app-radius-md)] border p-3";
  const style = { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" };
  return href ? (
    <Link href={href} className={`${cls} tactile-interactive`} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

/**
 * Leader rows — label · thin bar · mono count. A table wearing a bar, so
 * every value reads directly (no hover layer needed); one hue since length,
 * not color, carries the magnitude.
 */
function Leaders({ rows, unit }: { rows: LeaderRow[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ol
      className="overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      aria-label={unit}
    >
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="w-[38%] min-w-0 shrink-0 truncate text-[13px] font-medium" style={{ color: "var(--app-ink)" }}>
              {r.label}
            </span>
            <span className="min-w-0 flex-1">
              <span
                aria-hidden
                className="block h-2 rounded-r-[4px]"
                style={{
                  width: `${Math.max(2, (r.count / max) * 100)}%`,
                  background: "var(--app-cool)",
                  opacity: 0.85,
                }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
              {r.count.toLocaleString()}
            </span>
          </>
        );
        const rowCls = "flex min-h-11 items-center gap-3 px-3 py-2";
        return (
          <li key={r.label} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
            {r.href ? (
              <Link href={r.href} className={`${rowCls} transition hover:bg-[var(--app-bg-sunken)]`}>
                {inner}
              </Link>
            ) : (
              <div className={rowCls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function NumbersPage() {
  const n = computeCountyNumbers();
  return (
    <div className="relative space-y-9 pb-4">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          The almanac
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Frederick County, counted.
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Figures on this page are calculated from the guide&rsquo;s current
          datasets when the page builds. Tap a linked number to browse the
          records behind it.
        </p>
      </header>

      <Plate numeral="I" title="The catalog">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Stat value={n.catalog.places.toLocaleString()} label="place records in the guide" href="/places" />
          <Stat value={String(n.catalog.towns)} label="towns and villages" href="/towns" />
          <Stat value={n.catalog.verifiedHours.toLocaleString()} label="with posted hours in the dataset" href="/rhythm" />
          <Stat value={n.catalog.rated.toLocaleString()} label="with a Google rating" />
          <Stat value={n.catalog.fourEightPlus.toLocaleString()} label="rated 4.8 stars or better" />
          <Stat value={n.fieldwork.notedPlaces.toLocaleString()} label="with field-note records" />
        </div>
      </Plate>

      <Plate numeral="II" title="Where everything is">
        <Leaders rows={n.perTown} unit="Places per town" />
      </Plate>

      <Plate numeral="III" title="What the county is made of">
        <Leaders rows={n.topCategories} unit="Places by kind" />
      </Plate>

      <Plate numeral="IV" title="The pour book">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat value={String(n.beer.beers)} label="signature pours cataloged" href="/beer" />
          <Stat value={String(n.beer.breweries)} label="breweries represented" href="/beer" />
          <Stat value={`${n.beer.strongestAbv.toFixed(1)}%`} label="highest ABV in the guide" />
          <Stat value={`${n.beer.medianAbv.toFixed(1)}%`} label="median ABV in the guide" />
        </div>
        <div className="mt-2.5">
          <Leaders rows={n.beer.families} unit="Pours by style family" />
        </div>
        {n.beer.topRated && (
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
            The highest Untappd rating in the guide belongs to <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{n.beer.topRated.name}</span>{" "}
            ({n.beer.topRated.brewery}), ★ {n.beer.topRated.rating.toFixed(2)}.
          </p>
        )}
      </Plate>

      <Plate numeral="V" title="Guide notes">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat value={String(n.fieldwork.happyHours)} label="with a cited happy-hour record" href="/happy-hour" />
          <Stat value={String(n.fieldwork.parkingTips)} label="with a parking note" />
          <Stat value={String(n.fieldwork.insiderNotes)} label="with an insider note" />
          <Stat value={String(n.county.farmersMarkets)} label="farmers markets on the calendar" href="/category/market" />
        </div>
      </Plate>

      <Plate numeral="VI" title="The county ledger">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat value={n.county.nonprofits.toLocaleString()} label="registered nonprofits (IRS record)" href="/nonprofits" />
          <Stat value={String(n.county.shippingPoints)} label="places to mail a package" href="/shipping" />
          {n.county.oldestTown && (
            <Stat value={String(n.county.oldestTown.est)} label={`${n.county.oldestTown.name} founded, earliest in the mapped town data`} href="/towns" />
          )}
          <Stat value={n.county.townsPopulation.toLocaleString()} label="people in the mapped towns (2020 data)" href="/towns" />
        </div>
      </Plate>

      <p className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        These counts come from the shipped datasets at build time and update
        when the guide rebuilds.
        <Link href="/trust" className="tap-44-y inline-flex items-center gap-1 font-semibold underline underline-offset-2" style={{ color: "var(--app-ink-2)" }}>
          How Radius checks data
          <ArrowRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </Link>
      </p>
    </div>
  );
}
