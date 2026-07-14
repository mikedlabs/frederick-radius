import { FAMILY_BY_KEY, type BeerWithBrewery } from "@/data/beers";

const prettyTown = (slug: string) =>
  slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * A beer as a card colored by what it is: a stout glows dark cocoa, a hazy IPA
 * burns orange, a sour is bright pink. The gradient darkens toward the bottom
 * so the white display type stays legible (large text, >=3:1). Used both in the
 * swipe deck (fills its draggable frame) and the directory grid.
 */
export default function BeerCard({ beer }: { beer: BeerWithBrewery }) {
  const fam = FAMILY_BY_KEY[beer.family];
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[var(--app-radius-lg)] p-5 text-white"
      style={{
        background: `linear-gradient(160deg, ${fam.base} 0%, ${fam.deep} 78%)`,
        boxShadow: "var(--app-elev-2), inset 0 1px 0 rgba(255,255,255,0.14)",
      }}
    >
      {/* Foam line + faint grain across the top. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.28), transparent)" }} />

      {/* Big, faint ABV watermark filling the middle so the card reads as a poster. */}
      {beer.abv != null && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-serif font-semibold leading-none"
          style={{ fontSize: "120px", color: "rgba(255,255,255,0.09)" }}
        >
          {beer.abv.toFixed(1)}
          <span style={{ fontSize: "52px" }}>%</span>
        </span>
      )}

      <div className="relative flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">
          {fam.label}
        </span>
        {beer.rating != null && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums"
            style={{ background: "rgba(0,0,0,0.28)" }}
            title="Untappd rating"
          >
            ★ {beer.rating.toFixed(2)}
          </span>
        )}
      </div>

      <div className="relative">
        <h3 className="font-serif text-[30px] font-semibold leading-[1.03] tracking-tight text-balance">
          {beer.name}
        </h3>
        <p className="mt-1 text-[13px] leading-snug text-white/90">{beer.notes}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/85">
          <span className="font-medium">{beer.style}</span>
          {beer.abv != null && (
            <>
              <span aria-hidden className="text-white/50">·</span>
              <span className="font-mono tabular-nums">{beer.abv.toFixed(1)}%</span>
            </>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/20 pt-2.5">
          <span className="text-[12px] font-semibold">
            {beer.breweryName}
            <span className="font-normal text-white/70">, {prettyTown(beer.town)}</span>
          </span>
          {beer.flagship && (
            <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">
              Flagship
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
