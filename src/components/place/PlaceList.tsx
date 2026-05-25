"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import PlaceCard from "./PlaceCard";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * PlaceList — wraps a list of PlaceCards with a Grid / List toggle.
 *
 * Two browsing modes for the same data:
 *   - Grid: 2-up photo-forward tiles (visual; "I'm browsing")
 *   - List: dense single-row cards (scannable; "I'm looking for one")
 *
 * The choice persists in localStorage so a resident who prefers
 * scanning gets list everywhere, a visitor who likes pictures gets
 * grid everywhere. Each surface still chooses its initial default
 * (`initialLayout`) so first-load reads correctly without flicker.
 *
 * Client component on purpose: the toggle is small + interactive,
 * and the pages that host it (/m/[town], /category/[slug]) stay
 * server components — only this island hydrates.
 */
export default function PlaceList({
  places,
  initialLayout = "grid",
  emptyMessage,
}: {
  places: PlaceCardData[];
  initialLayout?: "grid" | "list";
  emptyMessage?: string;
}) {
  const [layout, setLayout] = useState<"grid" | "list">(initialLayout);
  const [mounted, setMounted] = useState(false);

  // Read saved preference on mount. If absent, keep the page's
  // initialLayout (a city page defaults to grid, a category page
  // to list — the existing behavior is preserved).
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "grid" || saved === "list") setLayout(saved);
    } catch {
      /* localStorage unavailable; stick with initial */
    }
  }, []);

  function setAndStore(next: "grid" | "list") {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  if (places.length === 0) {
    return emptyMessage ? (
      <p
        className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink-3)",
        }}
      >
        {emptyMessage}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {places.length} {places.length === 1 ? "place" : "places"}
        </p>
        {/* Layout toggle. Hydration-safe: until mounted we render the
            initialLayout state, so the SSR pass and first client pass
            agree. Once mounted we resolve to any saved preference. */}
        <div
          className="inline-flex rounded-full border bg-[var(--app-bg-elevated)] p-0.5"
          style={{ borderColor: "var(--app-border)" }}
          role="radiogroup"
          aria-label="Layout"
        >
          <button
            type="button"
            onClick={() => setAndStore("grid")}
            role="radio"
            aria-checked={layout === "grid"}
            aria-label="Grid"
            title="Grid"
            className="grid h-7 w-7 place-items-center rounded-full transition-colors"
            style={{
              background:
                layout === "grid"
                  ? "color-mix(in srgb, var(--app-brand) 16%, transparent)"
                  : "transparent",
              color:
                layout === "grid"
                  ? "var(--app-brand)"
                  : "var(--app-ink-3)",
            }}
          >
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setAndStore("list")}
            role="radio"
            aria-checked={layout === "list"}
            aria-label="List"
            title="List"
            className="grid h-7 w-7 place-items-center rounded-full transition-colors"
            style={{
              background:
                layout === "list"
                  ? "color-mix(in srgb, var(--app-brand) 16%, transparent)"
                  : "transparent",
              color:
                layout === "list"
                  ? "var(--app-brand)"
                  : "var(--app-ink-3)",
            }}
          >
            <List className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {layout === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5">
          {places.map((p) => (
            <PlaceCard key={p.slug} place={p} variant="grid" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2" aria-busy={!mounted ? "true" : undefined}>
          {places.map((p) => (
            <li key={p.slug}>
              {/* compact=true drops the second metadata row (status +
                  rating + price) so the row reads tighter — list mode
                  is for scanning, not full-card detail. */}
              <PlaceCard place={p} variant="row" compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STORAGE_KEY = "fr.places-layout";
