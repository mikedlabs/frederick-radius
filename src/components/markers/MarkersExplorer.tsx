"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X, Landmark } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { HistoricMarker } from "@/lib/integrations/historicSites";

/**
 * MarkersExplorer — the roadside markers as a COLLECTION, not a directory.
 *
 * There are only ~28, each a historical inscription at a point on the map, so
 * the plain stacked text list read like a database dump. This shows them as
 * field-guide specimen plates: each color-coded by its town, stamped with an
 * engraved seal and its placement year, the inscription as the plate body.
 *
 * Finding stays fast: a search over name/town/inscription, and a row of town
 * chips (color-matched to the plates) to filter to one corner of the county.
 * Pure client filter over the markers the server fetched; no network.
 */

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name ?? "Around the county";

// A stable palette cycled across towns, so a town keeps one color on its chip
// and all its plates — the visual key that replaces stacked section headers.
const TOWN_INKS = [
  "var(--app-brand)",
  "var(--app-cool)",
  "var(--app-accent-press)",
  "var(--app-brand-2)",
  "var(--app-positive)",
  "var(--app-warning-press)",
  "var(--app-brand-press)",
  "var(--app-ink-2)",
];

const INITIAL_MARKER_COUNT = 8;

function matches(m: HistoricMarker, q: string): boolean {
  return (
    m.title.toLowerCase().includes(q) ||
    (m.inscription ?? "").toLowerCase().includes(q) ||
    (m.town ?? "").toLowerCase().includes(q) ||
    muniName(m.municipality).toLowerCase().includes(q)
  );
}

export default function MarkersExplorer({ markers }: { markers: readonly HistoricMarker[] }) {
  const [query, setQuery] = useState("");
  const [town, setTown] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const towns = useMemo(() => {
    const byMuni = new Map<string, number>();
    for (const m of markers) byMuni.set(m.municipality, (byMuni.get(m.municipality) ?? 0) + 1);
    return [...byMuni.entries()]
      .map(([slug, count]) => ({ slug, name: muniName(slug), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [markers]);

  const inkFor = useMemo(() => {
    const m = new Map<string, string>();
    towns.forEach((t, i) => m.set(t.slug, TOWN_INKS[i % TOWN_INKS.length]));
    return m;
  }, [towns]);

  const shown = useMemo(() => {
    if (searching) return markers.filter((m) => matches(m, q));
    if (town) return markers.filter((m) => m.municipality === town);
    return markers;
  }, [markers, q, town, searching]);
  const isUnfiltered = !searching && town === null;
  const visibleMarkers = isUnfiltered && !expanded ? shown.slice(0, INITIAL_MARKER_COUNT) : shown;
  const hiddenCount = shown.length - visibleMarkers.length;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="display-3 font-serif" style={{ color: "var(--app-ink)" }}>
          Roadside markers
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
          {markers.length} markers · MDOT SHA
        </p>
      </div>

      {/* Search — by name, town, or a word in the inscription. */}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setExpanded(false);
          }}
          aria-label="Search markers by name, town, or inscription"
          placeholder="Search markers: railroad, a town, a name…"
          className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setExpanded(false); }} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {/* Town chips — color-matched to the plates. Hidden while searching. */}
      {!searching && (
        <div className="-mx-4 px-4">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => { setTown(null); setExpanded(false); }}
                aria-pressed={town === null}
                className="tap-44-y rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
                style={
                  town === null
                    ? { borderColor: "var(--app-ink)", background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }
                    : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }
                }
              >
                All <span className="font-mono text-[10.5px] opacity-70">{markers.length}</span>
              </button>
            </li>
            {towns.map((t) => {
              const ink = inkFor.get(t.slug)!;
              const on = town === t.slug;
              return (
                <li key={t.slug} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => { setTown(on ? null : t.slug); setExpanded(false); }}
                    aria-pressed={on}
                    className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
                    style={
                      on
                        ? { borderColor: ink, background: ink, color: "var(--app-on-brand, #fff)" }
                        : { borderColor: `color-mix(in srgb, ${ink} 32%, var(--app-border))`, background: "var(--app-bg-elevated)", color: "var(--app-ink)" }
                    }
                  >
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--app-on-brand, #fff)" : ink }} />
                    {t.name}
                    <span className="font-mono text-[10.5px] opacity-70">{t.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {searching && (
        <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {shown.length === 0 ? "No markers matched" : `${shown.length} ${shown.length === 1 ? "marker" : "markers"} for “${query.trim()}”`}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
          No marker matched. Try a plainer word, or another town.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {visibleMarkers.map((m) => (
            <MarkerPlate key={m.id} m={m} ink={inkFor.get(m.municipality) ?? "var(--app-brand)"} />
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <div className="border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="tap-44-y inline-flex items-center text-[13px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Show {hiddenCount} more markers
          </button>
        </div>
      )}
    </section>
  );
}

/** One marker as a field-guide specimen plate: a town-colored top band and
 *  seal, the town as an engraved eyebrow, a year stamp, the inscription as the
 *  body, and the map link. Textured paper + engraved edge, not a flat row. */
function MarkerPlate({ m, ink }: { m: HistoricMarker; ink: string }) {
  return (
    <li>
      <article
        className="relative flex h-full flex-col overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: `color-mix(in srgb, ${ink} 26%, var(--app-border))`,
          background: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span aria-hidden className="h-[3px] w-full" style={{ background: ink }} />
        <div className="flex flex-1 flex-col p-3.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${ink} 14%, var(--app-bg-elevated))`,
                color: `color-mix(in srgb, ${ink} 82%, var(--app-ink))`,
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
              }}
            >
              <Landmark className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: `color-mix(in srgb, ${ink} 72%, var(--app-ink))` }}>
              {m.town || muniName(m.municipality)}
            </span>
            {m.year && (
              <span className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
                {m.year}
              </span>
            )}
          </div>

          <h3 className="mt-2 font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {m.title}
          </h3>
          {m.inscription && (
            <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {m.inscription}
            </p>
          )}
          <a
            href={`/map?at=${m.lat},${m.lng}`}
            aria-label={`Find ${m.title} on the map`}
            className="tap-44 relative mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-semibold"
            style={{ color: `color-mix(in srgb, ${ink} 78%, var(--app-ink))` }}
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Find it on the map
          </a>
        </div>
      </article>
    </li>
  );
}
