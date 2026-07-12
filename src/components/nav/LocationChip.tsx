"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, Loader2, AlertCircle, Check, ChevronDown, ArrowUpRight, Globe } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { haptic } from "@/lib/haptics";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getScope, setScope, scopeTownSlug, scopeLabel, type Scope } from "@/lib/scope";

/**
 * TopBar location chip — the browsing-scope selector (UX-02).
 *
 * This is the single entry point to the shared scope lens (lib/scope.ts):
 * "near me", the whole county, or one town. Before UX-02 the town rows just
 * NAVIGATED to /m/<slug> — a jump away, not a lens you apply in place. Now a
 * town row SETS the scope and router.refresh()es, so the surfaces that read
 * scope (the list answers, the Today masthead, and — as their adapters land —
 * the map and events board) re-rank around it without leaving the page. The
 * town guide is still one tap away as a secondary "Open guide" row, so the old
 * destination is never lost.
 *
 * The chip label always reflects the current scope, so a tap is never dead
 * even on a surface whose adapter hasn't shipped yet: you can see the lens
 * changed, and it persists to the next surface that honors it.
 *
 * Dropdown uses inline state + a click-outside listener (vs a popover lib) —
 * the menu is small enough that the dependency wouldn't earn its bytes.
 */
export default function LocationChip() {
  const router = useRouter();
  const { state, request } = useGeolocation();
  const [open, setOpen] = useState(false);
  const [scope, setScopeState] = useState<Scope | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Hydrate the current scope post-mount (localStorage is client-only, so an
  // SSR read would mismatch). Re-read whenever the menu opens so a scope set
  // on another tab/surface shows correctly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount storage read
    setScopeState(getScope());
  }, [open]);

  const applyScope = (next: Scope | null) => {
    haptic("light");
    setScope(next);
    setScopeState(next);
    setOpen(false);
    // Server components re-render with the new fr_scope cookie.
    router.refresh();
  };

  // Find nearest municipality center if we have a position (labels "near me").
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

  // Click-outside / Escape to close.
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

  const scopeTown = scopeTownSlug(scope);

  // The chip label follows the scope first; "near me" borrows the live
  // geolocation readout so it still reads "Near Brunswick" once granted.
  let label = scope ? scopeLabel(scope) : "Frederick, MD";
  let LabelIcon = MapPin;
  let labelColor: string = scope ? "var(--app-ink-2)" : "var(--app-ink-3)";
  if (scope === "nearme") {
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
    } else {
      LabelIcon = Navigation;
    }
  } else if (scope === "county") {
    LabelIcon = Globe;
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
          className={state.status === "loading" && scope === "nearme" ? "h-3 w-3 animate-spin" : "h-3 w-3"}
          strokeWidth={2}
          aria-hidden
        />
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Set what you're browsing"
          className="absolute right-0 top-full z-[var(--z-dropdown)] mt-1.5 w-[230px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          {/* Near me — sets scope AND requests the fix (the two go together;
              a nearme scope with no device fix falls back to home server-side
              but the granted position sharpens client surfaces). */}
          <button
            type="button"
            onClick={() => {
              if (state.status !== "granted") request();
              applyScope("nearme");
            }}
            role="menuitemradio"
            aria-checked={scope === "nearme"}
            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ color: scope === "nearme" ? "var(--app-brand)" : "var(--app-ink-2)" }}
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: scope === "nearme" ? "var(--app-brand)" : "var(--app-cool)" }} />
            Near me
            {scope === "nearme" && <Check className="ml-auto h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
          </button>

          {/* Whole county — clears any town lens. */}
          <button
            type="button"
            onClick={() => applyScope("county")}
            role="menuitemradio"
            aria-checked={scope === "county"}
            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ color: scope === "county" ? "var(--app-brand)" : "var(--app-ink-2)" }}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            Whole county
            {scope === "county" && <Check className="ml-auto h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
          </button>

          <div className="border-t" style={{ borderColor: "var(--app-border)" }} />

          {/* Towns — each SETS the scope in place. The nearest town (when
              located) is hinted; the active scope town carries the check. */}
          <ul className="max-h-[46vh] overflow-y-auto py-1">
            {MUNICIPALITIES.map((m) => {
              const isActive = scopeTown === m.slug;
              const isNearest = scope === "nearme" && nearestMuni?.slug === m.slug;
              return (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => applyScope(`town:${m.slug}`)}
                    role="menuitemradio"
                    aria-checked={isActive}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition hover:bg-[var(--app-bg-sunken)]"
                    style={{ color: isActive ? "var(--app-brand)" : "var(--app-ink-2)" }}
                  >
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="font-medium">{m.name}</span>
                    {isNearest && !isActive && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-cool)" }}>
                        Nearest
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Secondary escape hatch: the town guide, the old primary
              destination. Shown only when a town scope is active, so the jump
              is always to the town you're browsing. */}
          {scopeTown && MUNICIPALITY_BY_SLUG[scopeTown] && (
            <>
              <div className="border-t" style={{ borderColor: "var(--app-border)" }} />
              <Link
                href={`/m/${scopeTown}`}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
                style={{ color: "var(--app-brand-press)" }}
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                Open {MUNICIPALITY_BY_SLUG[scopeTown].name} guide
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
