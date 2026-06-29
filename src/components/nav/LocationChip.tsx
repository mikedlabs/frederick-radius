"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Navigation, Loader2, AlertCircle, Check, ChevronDown } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { haptic } from "@/lib/haptics";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * TopBar location chip — combined location indicator + town switcher.
 *
 * Pre-launch this chip just said "Frederick, MD" and triggered a
 * geolocation prompt on tap. It served the location role but did
 * nothing for the much more common ask: "I'm browsing a different
 * town in the county — can I just say so?"
 *
 * Now it's a small dropdown. Tap → menu opens with two clusters:
 *
 *   1. Use my location (or, when location is already granted,
 *      "Clear my location"). Same behavior as before.
 *   2. The 13 municipalities, with the nearest one (when location
 *      is granted) flagged with a check.
 *
 * Each town entry is a real <Link> to /m/<slug> so navigation feels
 * instant and Next prefetcher warms the targets. The chip label
 * tracks the location state: "Frederick, MD" idle, "Locating…" while
 * resolving, "Near Brunswick" or "3.2 km from Mount Airy" when
 * granted.
 *
 * Dropdown uses inline state + a click-outside listener (vs Headless
 * UI or another popover lib) — the menu is small enough that the
 * extra dependency wouldn't earn its bytes.
 */
export default function LocationChip() {
  const { state, request, clear } = useGeolocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Find nearest municipality center if we have a position.
  const nearestMuni = useMemo(() => {
    if (state.status !== "granted") return null;
    let best: { slug: string; name: string; distance_km: number } | null = null;
    for (const m of MUNICIPALITIES) {
      const dx = (m.centroid.lng - state.position.lng) * 111 * Math.cos((state.position.lat * Math.PI) / 180);
      const dy = (m.centroid.lat - state.position.lat) * 111;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!best || d < best.distance_km) {
        best = { slug: m.slug, name: m.name, distance_km: d };
      }
    }
    return best;
  }, [state]);

  // Click-outside / Escape to close. Lightweight; the menu re-mounts
  // each open, so we don't need full focus management.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The chip label changes with location state. Three cases.
  let label = "Frederick, MD";
  let LabelIcon = MapPin;
  let labelColor: string = "var(--app-ink-3)";
  if (state.status === "granted" && nearestMuni) {
    label = nearestMuni.distance_km < 1
      ? `Near ${nearestMuni.name}`
      : `${nearestMuni.distance_km.toFixed(1)} km from ${nearestMuni.name}`;
    LabelIcon = Navigation;
    labelColor = "var(--app-cool)";
  } else if (state.status === "loading") {
    label = "Locating…";
    LabelIcon = Loader2;
  } else if (state.status === "denied") {
    LabelIcon = AlertCircle;
    labelColor = "var(--app-warning)";
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          haptic("light");
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="tap-44 inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
        style={{ borderColor: "var(--app-border)", color: labelColor }}
      >
        <LabelIcon
          className={state.status === "loading" ? "h-3 w-3 animate-spin" : "h-3 w-3"}
          strokeWidth={2}
          aria-hidden
        />
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch town or use location"
          className="absolute right-0 top-full z-[var(--z-dropdown)] mt-1.5 w-[220px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          {/* Location action — request OR clear depending on state. */}
          <button
            type="button"
            onClick={() => {
              haptic("medium");
              if (state.status === "granted") clear();
              else request();
              setOpen(false);
            }}
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ color: "var(--app-ink-2)" }}
          >
            {state.status === "granted" ? (
              <>
                <Navigation className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-cool)" }} />
                Clear my location
              </>
            ) : (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                Use my location
              </>
            )}
          </button>

          <div className="border-t" style={{ borderColor: "var(--app-border)" }} />

          {/* Towns list. Each one navigates to /m/<slug>. The nearest
              town (when location granted) gets a check mark; otherwise
              no row is marked active because the chip itself doesn't
              "own" a town the way a /m page does. */}
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {MUNICIPALITIES.map((m) => {
              const isNearest = nearestMuni?.slug === m.slug;
              return (
                <li key={m.slug}>
                  <Link
                    href={`/m/${m.slug}`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-[12px] transition hover:bg-[var(--app-bg-sunken)]"
                    style={{ color: isNearest ? "var(--app-brand)" : "var(--app-ink-2)" }}
                  >
                    {isNearest ? (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="font-medium">{m.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
