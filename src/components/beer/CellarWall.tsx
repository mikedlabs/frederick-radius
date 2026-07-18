import { ALL_BEERS, STYLE_FAMILIES } from "@/data/beers";

/**
 * CellarWall — every signature beer in the county as one band of color.
 *
 * The catalog answers "find me a beer"; this answers "show me the
 * cellar." Each band is one beer: its color is the style family's, its
 * height is its strength, and the bands are grouped family by family so
 * the wall reads like a spectrum — pale crisp lagers on one end, dark
 * roast on the other. 174 beers become a single glanceable fingerprint
 * of Frederick County brewing, printed server-side with zero client
 * code.
 *
 * The wall itself is decorative to a screen reader; the sr-only summary
 * and the legend (real text, family counts) carry the information.
 */
const ABV_FLOOR = 3.5;
const ABV_CEIL = 11;

export default function CellarWall() {
  const byFamily = STYLE_FAMILIES.map((family) => ({
    family,
    beers: ALL_BEERS
      .filter((beer) => beer.family === family.key)
      .sort((a, b) => (a.abv ?? ABV_FLOOR) - (b.abv ?? ABV_FLOOR)),
  })).filter((group) => group.beers.length > 0);
  const total = byFamily.reduce((sum, group) => sum + group.beers.length, 0);
  if (total === 0) return null;

  return (
    <figure aria-label="The county cellar at a glance" className="m-0">
      <p className="sr-only">
        {total} signature beers across {byFamily.length} style families, from
        crisp lagers to dark stouts. The full searchable catalog follows.
      </p>
      <div aria-hidden className="flex h-24 items-end gap-px overflow-hidden rounded-[var(--app-radius-sm)] sm:h-28">
        {byFamily.map((group) =>
          group.beers.map((beer, i) => {
            const abv = beer.abv ?? ABV_FLOOR;
            const pct = Math.max(0, Math.min(1, (abv - ABV_FLOOR) / (ABV_CEIL - ABV_FLOOR)));
            const height = 34 + Math.round(pct * 66);
            return (
              <span
                key={`${beer.brewerySlug}-${beer.name}-${i}`}
                title={`${beer.name} · ${beer.style}${beer.abv != null ? ` · ${beer.abv.toFixed(1)}%` : ""}`}
                className="min-w-0 flex-1"
                style={{
                  height: `${height}%`,
                  background: `linear-gradient(180deg, ${group.family.base}, ${group.family.deep})`,
                }}
              />
            );
          }),
        )}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {byFamily.map(({ family, beers }) => (
          <span key={family.key} className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--app-ink-2)" }}>
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ background: `linear-gradient(180deg, ${family.base}, ${family.deep})` }}
            />
            {family.label}
            <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>{beers.length}</span>
          </span>
        ))}
        <span className="inline-flex items-center text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
          Taller bands are stronger pours.
        </span>
      </figcaption>
    </figure>
  );
}
