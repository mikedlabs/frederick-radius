"use client";

import { Cloud, CloudOff, MapPin, Smartphone } from "lucide-react";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useSavedList } from "@/hooks/useSaved";

export default function SyncStatus() {
  const saved = useSavedList();
  const followState = useFollowedSlugs();
  const placeCount = followState.slugs.size;
  // accountSlugs is no longer returned; all slugs are unified. 
  // We'll treat all followed places as account places when authed.
  const accountPlaceCount = followState.authed ? placeCount : 0;
  const waitingPlaceCount = 0; 
  const eventCount = saved.filter((item) => item.type === "event").length;
  const routeCount = saved.filter((item) => item.type === "radius").length;
  const isPaused = !followState.authed;

  return (
    <div className="space-y-3" aria-live="polite">
      <section
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{
              background: isPaused
                ? "color-mix(in srgb, var(--app-warning) 14%, transparent)"
                : "color-mix(in srgb, var(--app-positive) 13%, transparent)",
              color: isPaused ? "var(--app-warning)" : "var(--app-positive)",
            }}
          >
            {isPaused ? <CloudOff className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow" style={{ color: isPaused ? "var(--app-warning)" : "var(--app-positive)" }}>
              {followState.loading
                ? "Checking sync"
                : isPaused
                  ? "Sync paused"
                  : "Up to date"}
            </p>
            <h2 className="mt-1 font-serif text-[23px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              {followState.loading
                ? "Bringing your Radius together…"
                : isPaused
                  ? "Your on-device places are still safe."
                  : `${accountPlaceCount} ${accountPlaceCount === 1 ? "place" : "places"} kept with your account.`}
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              {isPaused
                ? "Sign in to securely sync your places."
                : "Available anywhere you sign in. Places from this device are added without removing anything already there."}
            </p>
          </div>
        </div>

        <div className="grid border-t sm:grid-cols-2" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex gap-3 p-4 sm:border-r" style={{ borderColor: "var(--app-border)" }}>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden />
            <div>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Places with your account · {accountPlaceCount}
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Kept with your account
              </p>
            </div>
          </div>
          <div className="flex gap-3 border-t p-4 sm:border-t-0" style={{ borderColor: "var(--app-border)" }}>
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
            <div>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Events {eventCount} · Routes {routeCount}
                {waitingPlaceCount > 0 ? ` · Places waiting ${waitingPlaceCount}` : ""}
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Stay on this device for now
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
