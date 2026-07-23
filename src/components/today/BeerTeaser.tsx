import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BREWERIES } from "@/data/beers";
import BeerColorRibbon from "@/components/beer/BeerColorRibbon";

/**
 * BeerTeaser — the /today door to /beer (owner ask: the beer page needed a
 * better way to be seen). The color ribbon rides the top edge as an instantly
 * recognizable signature, the same spectrum that heads /beer, so tapping in
 * feels like the same place. Signature Frederick draw, so it earns a spot on
 * the home surface rather than hiding in the toolbox.
 */
export default function BeerTeaser() {
  return (
    <Link
      href="/beer"
      className="tactile-interactive group block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <BeerColorRibbon height={10} />
      <div className="flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Frederick beer
          </p>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {`Browse ${BREWERIES.length} local breweries and see live pours from connected taprooms.`}
          </p>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-70"
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
    </Link>
  );
}
