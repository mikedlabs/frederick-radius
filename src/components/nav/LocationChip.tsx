"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Navigation, Loader2, AlertCircle, Check, ChevronDown, ChevronLeft, ArrowUpRight, Globe, X } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { haptic } from "@/lib/haptics";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance } from "@/lib/geo";
import { getScope, parseScope, setScope, scopeTownSlug, scopeLabel, subscribeScopeChange, type Scope } from "@/lib/scope";
import { locationScopeHref } from "./locationScopeNavigation";

/**
 * TopBar location chip — the browsing-scope selector (UX-02).
 *
 * This is the single entry point to the shared scope lens (lib/scope.ts):
 * "near me", the whole county, or one town. Before UX-02 the town rows just
 * NAVIGATED to /m/<slug> — a jump away, not a lens you apply in place. Now a
 * town row SETS the scope and router.refresh()es, so the surfaces that read
 * scope (the list answers and Today's open-place decision, plus the map and
 * events board) re-rank around it without leaving the page. Countywide Today
 * modules stay explicitly labeled as such. The town guide is still one tap
 * away as a secondary "Open guide" row, so the old destination is never lost.
 *
 * The chip label always reflects the current scope, so a tap is never dead
 * even on a surface whose adapter hasn't shipped yet: you can see the lens
 * changed, and it persists to the next surface that honors it.
 *
 * Dropdown uses inline state + a click-outside listener (vs a popover lib) —
 * the menu is small enough that the dependency wouldn't earn its bytes.
 */
export default function LocationChip({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, request } = useGeolocation();
  const [open, setOpen] = useState(false);
  const [showTowns, setShowTowns] = useState(false);
  const [storedScope, setScopeState] = useState<Scope | null>(null);
  const scope = parseScope(searchParams.get("in")) ?? storedScope;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePicker = useCallback((restoreFocus = true) => {
    setOpen(false);
    setShowTowns(false);
    if (restoreFocus) {
      // Wait for React to remove the picker before returning focus to the
      // control that opened it. Otherwise a focused Done/town button vanishes
      // and browsers fall back to <body>.
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  // Hydrate post-mount, then follow changes made by Map, Events, or another
  // tab. The label is the global scope readout, not menu-local state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount storage read
    setScopeState(getScope());
    return subscribeScopeChange(setScopeState);
  }, []);

  const applyScope = (next: Scope | null) => {
    haptic("light");
    setScope(next);
    setScopeState(next);
    closePicker();
    const href = locationScopeHref(window.location.href, next);
    if (href) {
      if (window.location.pathname === "/map") {
        // Native history keeps the live map mounted while synchronizing its
        // URL-owned query and scope. The scope event above moves the camera.
        window.history.replaceState(null, "", href);
      } else {
        router.replace(href, { scroll: false });
      }
    } else {
      // Other server surfaces consume the new shared scope cookie directly.
      router.refresh();
    }
  };

  // Every town, sorted by how far it is from the reader. This loop already ran
  // over all thirteen and kept one, which meant the menu below listed towns in
  // file order with no distances while the answer to "which of these is
  // actually close to me" had just been computed and dropped.
  const townsByDistance = useMemo(() => {
    if (state.status !== "granted") return null;
    return MUNICIPALITIES.map((m) => {
      const dx =
        (m.centroid.lng - state.position.lng) *
        111 *
        Math.cos((state.position.lat * Math.PI) / 180);
      const dy = (m.centroid.lat - state.position.lat) * 111;
      return {
        slug: m.slug,
        name: m.name,
        distance_km: Math.sqrt(dx * dx + dy * dy),
      };
    }).sort((a, b) => a.distance_km - b.distance_km);
  }, [state]);
  const nearestMuni = townsByDistance?.[0] ?? null;

  // Click-outside / Escape to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      // Preserve the user's intended outside-click target instead of stealing
      // focus back after that target receives the click.
      if (!wrapRef.current?.contains(e.target as Node)) closePicker(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [closePicker, open]);

  const scopeTown = scopeTownSlug(scope);

  // The chip label follows the scope first; "near me" borrows the live
  // geolocation readout so it still reads "Near Brunswick" once granted.
  let label = scope ? scopeLabel(scope) : compact ? "Frederick County" : "Frederick, MD";
  let LabelIcon = MapPin;
  let labelColor: string = scope ? "var(--app-ink-2)" : "var(--app-ink-3)";
  if (scope === "nearme") {
    if (state.status === "granted" && nearestMuni) {
      // Miles and feet, through the same helper the other 119 call sites use.
      // This chip was the one place in a Maryland app that reported kilometers.
      label = nearestMuni.distance_km < 1
        ? `Near ${nearestMuni.name}`
        : `${formatDistance(nearestMuni.distance_km * 1000)} from ${nearestMuni.name}`;
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
  const compactLabel =
    scope === "nearme"
      ? "Near me"
      : scopeTown && MUNICIPALITY_BY_SLUG[scopeTown]
        ? MUNICIPALITY_BY_SLUG[scopeTown].name
        : "County";

  return (
    <div ref={wrapRef} className="relative min-w-0 shrink-0">
      <button
        ref={triggerRef}
        data-location-chip
        data-compact={compact || undefined}
        type="button"
        onClick={() => {
          haptic("light");
          if (open) closePicker();
          else setOpen(true);
        }}
        aria-expanded={open}
        aria-controls="location-scope-choices"
        aria-label={`Change town or location scope. Current scope: ${label}`}
        title={`Town and location: ${label}`}
        className="inline-flex h-11 min-w-11 max-w-[108px] items-center justify-center gap-1 overflow-hidden rounded-full border bg-[var(--app-bg-elevated)] px-2 text-[12px] font-semibold leading-none transition hover:bg-[var(--app-bg-sunken)] active:scale-95 sm:max-w-none sm:justify-start"
        style={{ borderColor: "var(--app-border)", color: labelColor }}
      >
        <LabelIcon
          className={state.status === "loading" && scope === "nearme" ? "h-4 w-4 shrink-0 animate-spin sm:h-3 sm:w-3" : "h-4 w-4 shrink-0 sm:h-3 sm:w-3"}
          strokeWidth={2}
          aria-hidden
        />
        {compact ? (
          <>
            {/* A complete short scope beats a clipped full name at the 320px
                support floor. The map header swaps to the full label as soon
                as 360px is available. */}
            <span data-location-scope-label="compact" className="min-w-0 truncate">
              {compactLabel}
            </span>
            <span data-location-scope-label="full" className="min-w-0 truncate sm:max-w-[160px]">
              {label}
            </span>
          </>
        ) : (
          <>
            {/* At the common 390px phone width, show one complete scope word
                instead of squeezing "Frederick, MD" into a clipped chip.
                Wider headers restore the full readout. */}
            <span
              data-location-scope-label="compact"
              className="hidden min-w-0 truncate min-[390px]:block sm:hidden"
            >
              {compactLabel}
            </span>
            <span
              data-location-scope-label="full"
              className="hidden min-w-0 truncate sm:block sm:max-w-[160px]"
            >
              {label}
            </span>
          </>
        )}
        <ChevronDown className="hidden h-3 w-3 opacity-60 min-[390px]:block" strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div
          id="location-scope-choices"
          role="group"
          aria-label="Set what you're browsing"
          data-location-scope-menu
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)_+_var(--app-topbar-h)_+_0.375rem)] z-[var(--z-dropdown)] flex max-h-[min(62dvh,31rem)] flex-col overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-shadow-3)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[230px] sm:max-h-[min(70dvh,34rem)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div
            className="flex min-h-11 shrink-0 items-center justify-between border-b px-3 sm:hidden"
            style={{ borderColor: "var(--app-border)" }}
          >
            <strong className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Choose an area
            </strong>
            <button
              type="button"
              onClick={() => closePicker()}
              aria-label="Done choosing an area"
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Done
              <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
          {/* Near me — sets scope AND requests the fix (the two go together;
              a nearme scope with no device fix falls back to home server-side
              but the granted position sharpens client surfaces). */}
          <button
            type="button"
            onClick={() => {
              if (state.status !== "granted") request();
              applyScope("nearme");
            }}
            aria-pressed={scope === "nearme"}
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
            aria-pressed={scope === "county"}
            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ color: scope === "county" ? "var(--app-brand)" : "var(--app-ink-2)" }}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            Whole county
            {scope === "county" && <Check className="ml-auto h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
          </button>

          <div className="border-t" style={{ borderColor: "var(--app-border)" }} />

          {!showTowns && scopeTown && MUNICIPALITY_BY_SLUG[scopeTown] ? (
            <div
              className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-[12px] font-medium"
              style={{ color: "var(--app-brand-press)" }}
            >
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              {MUNICIPALITY_BY_SLUG[scopeTown].name}
            </div>
          ) : null}

          {/* This disclosure trigger stays mounted in both states. Keyboard
              focus therefore stays on the same control when the town list
              opens or closes, and aria-expanded always describes the visible
              list instead of disappearing at the moment it becomes true. */}
          <button
            type="button"
            data-town-disclosure
            onClick={() => setShowTowns((visible) => !visible)}
            aria-expanded={showTowns}
            aria-controls="location-town-choices"
            aria-label={showTowns ? "Hide town choices and return to area choices" : "Show town choices"}
            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ color: "var(--app-ink-2)" }}
          >
            {showTowns ? (
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            ) : (
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            )}
            {showTowns
              ? "Back to area choices"
              : scopeTown
                ? "Choose another town"
                : "Choose a town"}
            <ChevronDown
              className={`ml-auto h-3.5 w-3.5 transition-transform ${showTowns ? "rotate-180" : "-rotate-90"}`}
              strokeWidth={2}
              aria-hidden
            />
          </button>

          {/* Towns remain a deliberate second step instead of covering the
              map with thirteen choices every time someone only needs Near me
              or Whole county. Keeping the controlled list mounted also gives
              aria-controls a stable target. */}
          <ul id="location-town-choices" hidden={!showTowns} className="py-1">
            {(townsByDistance ?? MUNICIPALITIES).map((m) => {
              const isActive = scopeTown === m.slug;
              const distance =
                townsByDistance && "distance_km" in m
                  ? formatDistance(m.distance_km * 1000)
                  : null;
              return (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => applyScope(`town:${m.slug}`)}
                    aria-pressed={isActive}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition hover:bg-[var(--app-bg-sunken)]"
                    style={{ color: isActive ? "var(--app-brand)" : "var(--app-ink-2)" }}
                  >
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="font-medium">{m.name}</span>
                    {distance && (
                      <span
                        className="ml-auto text-[11px] tabular-nums"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {distance}
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
          {!showTowns && scopeTown && MUNICIPALITY_BY_SLUG[scopeTown] && (
            <>
              <div className="border-t" style={{ borderColor: "var(--app-border)" }} />
              <Link
                href={`/m/${scopeTown}`}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-[12px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
                style={{ color: "var(--app-brand-press)" }}
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                Open {MUNICIPALITY_BY_SLUG[scopeTown].name} guide
              </Link>
            </>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
