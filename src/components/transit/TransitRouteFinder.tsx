"use client";

import { useMemo, useState } from "react";
import { Bus, ChevronDown, Search, X } from "lucide-react";
import { requestTransitRouteFocus } from "@/lib/transit-focus";

/**
 * TransitRouteFinder — the "All routes" list with a search box.
 *
 * TransIT runs ~36 routes; the old list rendered every card in a flat grid,
 * so finding "the one to the mall" or "the Brunswick route" meant scanning all
 * of them. This adds one search over route name AND its destinations, so a
 * place name or a route number filters instantly. Pure client filter over the
 * routes the server already grouped.
 */

export type RouteRow = {
  id: string;
  short: string;
  name: string;
  destinations: string[];
  variationCount: number;
};

export default function TransitRouteFinder({ routes }: { routes: readonly RouteRow[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const q = query.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!q) return routes;
    return routes.filter(
      (r) => r.name.toLowerCase().includes(q) || r.destinations.some((d) => d.toLowerCase().includes(q)),
    );
  }, [routes, q]);
  const visible = q || expanded ? shown : shown.slice(0, 8);
  const hiddenCount = shown.length - visible.length;

  return (
    <details
      className="group overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Find a bus route
          </span>
          <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            Search {routes.length} routes, then frame one on the live map
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition group-open:rotate-180"
          strokeWidth={2.25}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
      </summary>

      <section className="space-y-3 border-t p-3" style={{ borderColor: "var(--app-border)" }}>
        <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search routes by number or where they go"
          placeholder="Route number or destination"
          className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
        </div>

      {shown.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          {routes.length === 0 ? "Route data is temporarily unavailable." : `No route matches “${query.trim()}”.`}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((r) => (
            <li key={r.name}>
              <button
                type="button"
                data-transit-route-id={r.id}
                onClick={() => {
                  requestTransitRouteFocus(r.id);
                  document.getElementById("live-network-heading")?.scrollIntoView({
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                    block: "start",
                  });
                }}
                className="tactile-interactive relative h-full w-full overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left"
                style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
              >
                <div aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--app-cool)" }} />
                <div className="ml-2 flex items-start gap-2.5">
                  <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}>
                    <Bus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                      {r.short} · {r.name}
                    </p>
                    {r.destinations.length > 0 && (
                      <p className="text-[12px] leading-snug text-pretty" style={{ color: "var(--app-ink-2)" }}>
                        {r.destinations.join(" · ")}
                      </p>
                    )}
                    <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                      {r.variationCount} {r.variationCount === 1 ? "variation" : "variations"}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!q && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="tap-44-y mx-auto flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Show {hiddenCount} more routes
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      )}
      {!q && expanded && shown.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="tap-44-y mx-auto flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Show fewer routes
          <ChevronDown className="h-3.5 w-3.5 rotate-180" strokeWidth={2.25} aria-hidden />
        </button>
      )}
      </section>
    </details>
  );
}
