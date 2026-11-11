import NearbyThumbnail from "./NearbyThumbnail";
import PlaceSectionLabel from "@/components/place/PlaceSectionLabel";
import { getNearbyWikipedia } from "@/lib/integrations/wikiContext";

/**
 * "Around here": the nearest Wikipedia articles to a place, the
 * "what am I looking at" context layer (data-audit source: Wikipedia
 * GeoSearch). Streams in via Suspense so it never blocks the page, renders
 * nothing when there's no nearby history, and always credits Wikipedia
 * (CC BY-SA). Deliberately quiet: this is context, not another directory.
 *
 * PLAIN TOOL: an unboxed section under the place page's 13px uppercase
 * label. Articles are ruled rows with a 17px sans title, a tabular sans
 * distance and a 14px muted extract; the page draws the rule above it.
 */
function distanceLabel(m: number): string {
  const ft = m * 3.28084;
  if (ft < 1000) return `${Math.round(ft / 10) * 10} ft`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

export default async function NearbyContext({
  lat,
  lng,
  excludeName,
}: {
  lat: number;
  lng: number;
  /** The place's own name: drop its own article from the "nearby" list. */
  excludeName?: string;
}) {
  const raw = await getNearbyWikipedia(lat, lng, { radiusM: 800, limit: 4 });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = excludeName ? norm(excludeName) : "";
  // This is supporting context, not a second directory beneath the place.
  // Two nearby references preserve the useful local-history layer without
  // making the actionable place page end in a long, tangential article list.
  const items = raw.filter((p) => !key || norm(p.title) !== key).slice(0, 2);
  if (items.length === 0) return null;

  return (
    <section className="space-y-1">
      <PlaceSectionLabel>Around here</PlaceSectionLabel>
      <ul className="divide-y divide-[var(--app-border)]">
        {items.map((p) => (
          <li key={p.pageId} className="flex items-start gap-3 py-3">
            {/* The article's own decorative photo disappears on failure;
                its title, source link, distance and extract remain useful. */}
            {p.thumbnail ? <NearbyThumbnail src={p.thumbnail} /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44-y inline-flex items-center text-[17px] font-semibold leading-snug tracking-tight hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.title}
                </a>
                <span
                  className="shrink-0 text-[14px] tabular-nums"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {distanceLabel(p.distanceM)}
                </span>
              </div>
              <p
                className="text-[14px] leading-relaxed"
                style={{
                  color: "var(--app-ink-2)",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {p.extract}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        Context source: Wikipedia (CC BY-SA)
      </p>
    </section>
  );
}
