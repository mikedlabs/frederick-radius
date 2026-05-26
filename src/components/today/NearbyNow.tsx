"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Navigation,
  Loader2,
  MapPin,
  CalendarClock,
  Landmark,
  ChevronRight,
  X,
} from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useMounted } from "@/hooks/useSaved";
// A2.6: import the NearbyContext TYPE only. The nearbyNow function
// itself (and the places-client.json it transitively pulls in) now
// lives behind /api/nearby. `import type` is erased at build, so this
// line costs zero bytes in the client bundle.
import type { NearbyContext } from "@/lib/connect";
import { formatDistance } from "@/lib/geo";
import { formatEventWhen } from "@/lib/loaders/events";
import PlaceCard from "@/components/place/PlaceCard";
import LiveDot from "@/components/ui/LiveDot";
import { haptic } from "@/lib/haptics";

// Tiny pure helper — was previously imported from lib/connect, but
// inlining it lets us drop the connect runtime import entirely.
function isNearbyEmpty(ctx: NearbyContext): boolean {
  return (
    ctx.counts.openPlaces === 0 &&
    ctx.counts.liveEvents === 0 &&
    ctx.counts.upcomingEvents === 0
  );
}

/**
 * NearbyNow — the location-aware, county-wide "what's around me right
 * now" surface. This is the visible payoff of the connectivity layer
 * (src/lib/connect.ts): instead of a town-gated list anchored to a
 * static city center, it fuses the user's *actual* position to the
 * municipality they are in, that municipality's civic context, and the
 * open places + live/soon events nearest to them — anywhere in the
 * county. A user in Brunswick sees the Thurmont thing that is genuinely
 * closer to them, not just downtown Frederick.
 *
 * Privacy posture: location is strictly opt-in (useGeolocation never
 * auto-prompts), resolved entirely on-device (no reverse-geocode key,
 * see connect.ts), and one tap clears it. Civic anchors link to the
 * in-app municipality page, never auto-open external gov PDFs.
 */

const SECTION_CARD =
  "rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]";

export default function NearbyNow() {
  const mounted = useMounted();
  const { state, request, clear } = useGeolocation();

  // Fetch the join from /api/nearby whenever the resolved position
  // changes. A small AbortController guard so a fast position swap
  // (e.g. user moves between towns while loading) doesn't show a
  // stale answer. The result is request-scoped on the server, edge-
  // cached with s-maxage=60.
  const [ctx, setCtx] = useState<NearbyContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.status !== "granted") {
      setCtx(null);
      setLoading(false);
      return;
    }
    const { lng, lat } = state.position;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/nearby?lng=${lng}&lat=${lat}&limit=6`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: NearbyContext) => {
        setCtx(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err && err.name !== "AbortError") {
          setCtx(null);
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [state]);

  // Until mounted, render nothing — useGeolocation hydrates from cache in
  // an effect, so a server/client mismatch is otherwise possible here.
  if (!mounted) return null;

  // ── Opt-in prompt (idle / denied / unavailable / error) ──────────────
  if (state.status !== "granted") {
    const loading = state.status === "loading";
    const blocked =
      state.status === "denied" || state.status === "unavailable";
    return (
      <section
        className={SECTION_CARD}
        style={{ borderColor: "var(--app-border)" }}
        aria-label="Around you"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Navigation className="h-4 w-4" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {blocked
                ? "Location is off"
                : "What’s happening around you"}
            </p>
            <p
              className="text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {blocked
                ? "Browsing the whole county. Enable location in your browser for a view centered on you."
                : "County-wide — open places, live events, and civic context nearest to wherever you are."}
            </p>
          </div>
          {!blocked && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                request();
              }}
              disabled={loading}
              className="tap-press shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-brand)",
                color: "#fff",
              }}
            >
              {loading ? "Locating…" : "Use my location"}
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Granted: the connected, county-wide nearby picture ───────────────
  // First render after grant: the /api/nearby fetch hasn't returned
  // yet. Show a small loading row that matches the granted-state
  // layout so there's no jump when context arrives.
  if (!ctx) {
    if (loading) {
      return (
        <section
          className={SECTION_CARD}
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Around you"
          aria-busy="true"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            </span>
            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Finding what&apos;s around you…
            </p>
          </div>
        </section>
      );
    }
    // Fetch failed silently (e.g. offline). Don't show a broken slot.
    return null;
  }
  const empty = isNearbyEmpty(ctx);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={SECTION_CARD}
      style={{ borderColor: "var(--app-border)" }}
      aria-label={`Around you — ${ctx.label}`}
    >
      {/* Header: resolved location + clear */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="inline-flex min-w-0 items-center gap-2">
          <MapPin
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={2.5}
            style={{ color: "var(--app-brand)" }}
            aria-hidden
          />
          <span className="min-w-0">
            <span
              className="block truncate text-[13px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Around you · {ctx.label}
            </span>
            <Link
              href={`/m/${ctx.municipality.slug}`}
              onClick={() => haptic("light")}
              className="text-[10px] font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {ctx.municipality.name} · see the town
            </Link>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            haptic("light");
            clear();
          }}
          aria-label="Clear my location"
          title="Clear my location"
          className="tap-press grid h-7 w-7 shrink-0 place-items-center rounded-full border"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
          }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {empty ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[12px] leading-snug"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Quiet around you right now.{" "}
          <Link
            href="/events"
            className="font-semibold"
            style={{ color: "var(--app-brand)" }}
          >
            See what’s on across the county
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {/* Live right now — county-wide, nearest first */}
          {ctx.liveEvents.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <LiveDot />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Live now · near you
                </span>
              </div>
              <ul className="space-y-1.5">
                {ctx.liveEvents.slice(0, 4).map((e) => (
                  <li key={e.slug}>
                    <Link
                      href={`/events/${e.slug}`}
                      onClick={() => haptic("light")}
                      className="tap-press flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {e.title}
                        </p>
                        <p
                          className="truncate text-[11px] leading-snug"
                          style={{ color: "var(--app-ink-2)" }}
                        >
                          {e.venue_name}
                          {e.distance_m !== undefined &&
                            ` · ${formatDistance(e.distance_m)}`}
                        </p>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2}
                        style={{ color: "var(--app-ink-3)" }}
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Starting soon — next 24h, soonest first */}
          {ctx.upcomingEvents.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <CalendarClock
                  className="h-3.5 w-3.5"
                  strokeWidth={2.5}
                  style={{ color: "var(--app-cool)" }}
                  aria-hidden
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Starting soon · near you
                </span>
              </div>
              <ul className="space-y-1.5">
                {ctx.upcomingEvents.slice(0, 3).map((e) => (
                  <li key={e.slug}>
                    <Link
                      href={`/events/${e.slug}`}
                      onClick={() => haptic("light")}
                      className="tap-press flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {e.title}
                        </p>
                        <p
                          className="truncate text-[11px] leading-snug"
                          style={{ color: "var(--app-ink-2)" }}
                        >
                          {formatEventWhen(e)}
                          {e.distance_m !== undefined &&
                            ` · ${formatDistance(e.distance_m)}`}
                        </p>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2}
                        style={{ color: "var(--app-ink-3)" }}
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Open near you — places, true-distance sorted */}
          {ctx.openPlaces.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <MapPin
                  className="h-3.5 w-3.5"
                  strokeWidth={2.5}
                  style={{ color: "var(--app-brand)" }}
                  aria-hidden
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Open near you
                </span>
              </div>
              <ul className="space-y-2">
                {ctx.openPlaces.slice(0, 4).map((p) => (
                  <li key={p.slug}>
                    <PlaceCard place={p} compact />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Civic context for the resolving municipality */}
      {ctx.civic.length > 0 && (
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <Landmark
              className="h-3.5 w-3.5"
              strokeWidth={2.5}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Civic context · {ctx.municipality.name}
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5 px-1">
            {ctx.civic.slice(0, 4).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/m/${a.municipality_slug}`}
                  onClick={() => haptic("light")}
                  className="tap-press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink-2)",
                  }}
                >
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}
