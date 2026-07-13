"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X, ChevronDown, ChevronRight } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { HistoricMarker } from "@/lib/integrations/historicSites";

/**
 * MarkersExplorer — the roadside-marker list as a FIND surface.
 *
 * There are a lot of markers, each with a full inscription, and the old page
 * rendered every one as a tall card in one uninterrupted scroll grouped only
 * by town. Reading the inscription IS the point, so we keep it — but bound it:
 *
 *   - SEARCH over title, town, and the inscription text, so "railroad",
 *     "Barbara Fritchie", or a town name jumps straight to the marker.
 *   - Off search, each TOWN folds into its own disclosure (the busiest town
 *     opens by default); you expand the corner you care about instead of
 *     scrolling the whole county.
 *   - Each marker's inscription is clamped so a card is a bounded height, not
 *     a wall of text.
 *
 * Plain client filter over data the server already fetched; no network.
 */

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name ?? "Around the county";

function matches(m: HistoricMarker, q: string): boolean {
  return (
    m.title.toLowerCase().includes(q) ||
    (m.inscription ?? "").toLowerCase().includes(q) ||
    (m.town ?? "").toLowerCase().includes(q) ||
    muniName(m.municipality).toLowerCase().includes(q)
  );
}

type Group = { slug: string; name: string; list: HistoricMarker[] };

export default function MarkersExplorer({ markers }: { markers: readonly HistoricMarker[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const groups: Group[] = useMemo(() => {
    const byMuni = new Map<string, HistoricMarker[]>();
    for (const m of markers) {
      const a = byMuni.get(m.municipality);
      if (a) a.push(m);
      else byMuni.set(m.municipality, [m]);
    }
    return [...byMuni.entries()]
      .map(([slug, list]) => ({ slug, name: muniName(slug), list }))
      .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));
  }, [markers]);

  const results = useMemo(
    () => (searching ? markers.filter((m) => matches(m, q)) : []),
    [markers, q, searching],
  );

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

      {/* Search — jump to a marker by name, town, or a word in the text. */}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search markers by name, town, or inscription"
          placeholder="Search markers: railroad, a town, a name…"
          className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {searching ? (
        <div className="space-y-2.5">
          <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {results.length === 0 ? "No markers matched" : `${results.length} ${results.length === 1 ? "marker" : "markers"} for “${query.trim()}”`}
          </p>
          {results.map((m) => (
            <MarkerCard key={m.id} m={m} />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g, i) => (
            <TownGroup key={g.slug} group={g} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function TownGroup({ group, defaultOpen }: { group: Group; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap-44-y flex w-full items-center justify-between rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-left"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <span className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {group.name}
          <span className="ml-2 font-mono text-[11px] font-normal tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {group.list.length}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2.5">
          {group.list.map((m) => (
            <MarkerCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A marker, bounded: title, town/year, the inscription clamped to a few
 *  lines (still readable, no longer a wall), and the map link. */
function MarkerCard({ m }: { m: HistoricMarker }) {
  return (
    <article
      className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <h3 className="font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
        {m.title}
      </h3>
      <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        {m.town || muniName(m.municipality)}
        {m.year ? ` · placed ${m.year}` : ""}
      </p>
      {m.inscription && (
        <p className="mt-1.5 line-clamp-4 text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {m.inscription}
        </p>
      )}
      <a
        href={`/map?at=${m.lat},${m.lng}`}
        className="tap-44 relative mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Find it on the map
      </a>
    </article>
  );
}
