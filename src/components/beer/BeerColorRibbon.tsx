import { ALL_BEERS } from "@/data/beers";
import { beerColor, colorLuminance } from "@/lib/beer/beer-color";

/**
 * BeerColorRibbon — the /beer identity in one strip: every one of the 174
 * pours as a hair-thin bar, sorted pale-gold to near-black, so the eye reads
 * the whole catalog as a single spectrum. Purely decorative (aria-hidden);
 * it's the same beerColor map the mosaic tiles use, so the ribbon and the
 * wall below can never disagree on a color. Computed once at module load.
 */
const RIBBON_COLORS = ALL_BEERS.map((b) => beerColor(b.style, b.family)).sort(
  (a, b) => colorLuminance(b) - colorLuminance(a),
);

export default function BeerColorRibbon({
  className = "",
  height = 12,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={`flex overflow-hidden ${className}`}
      style={{ height }}
      aria-hidden
    >
      {RIBBON_COLORS.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}
