import Image from "next/image";
import { getNearbyWikipedia } from "@/lib/integrations/wikiContext";

/**
 * "Around here" — the nearest Wikipedia articles to a place, the
 * "what am I looking at" context layer (data-audit source: Wikipedia
 * GeoSearch). Streams in via Suspense so it never blocks the page, renders
 * nothing when there's no nearby history, and always credits Wikipedia
 * (CC BY-SA). Deliberately quiet: this is context, not another directory.
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
  /** The place's own name — drop its own article from the "nearby" list. */
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
    <section className="space-y-3">
      <h2 className="text-title" style={{ color: "var(--app-ink)" }}>
        Around here
      </h2>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.pageId} className="flex items-start gap-3">
            {/* The article's own lead image — requested from the API since the
                start and dropped at render until Aug 2026. Decorative next to
                the linked title, so empty alt; self-hides when absent. */}
            {p.thumbnail ? (
              <Image
                src={p.thumbnail}
                alt=""
                width={56}
                height={56}
                className="mt-0.5 h-14 w-14 shrink-0 rounded-[var(--app-radius-sm)] object-cover"
                style={{ boxShadow: "var(--app-edge)" }}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44-y inline-flex items-center font-serif text-[15px] font-semibold leading-snug hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.title}
                </a>
                <span
                  className="shrink-0 font-mono text-[11px] tabular-nums"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {distanceLabel(p.distanceM)}
                </span>
              </div>
              <p
                className="text-[13px] leading-relaxed"
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
      <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Context source: Wikipedia (CC BY-SA)
      </p>
    </section>
  );
}
