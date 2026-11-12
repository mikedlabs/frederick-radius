"use client";

import { Cloud, CloudOff, MapPin, Smartphone } from "lucide-react";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useSavedList } from "@/hooks/useSaved";
import {
  ROW_HELP,
  SECTION_LABEL,
  SettingsRow,
  SettingsRows,
} from "@/components/settings/SettingsSection";

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

  // Status text uses text-safe tokens that hold contrast in both
  // appearances; the warning and positive fills are reserved for fills.
  const statusColor = isPaused ? "var(--app-live-text)" : "var(--app-forest-text)";

  return (
    <div aria-live="polite">
      <SettingsRows>
        <SettingsRow>
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-1 shrink-0" style={{ color: statusColor }}>
              {isPaused ? <CloudOff className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={SECTION_LABEL} style={{ color: statusColor }}>
                {followState.loading
                  ? "Checking sync"
                  : isPaused
                    ? "Sync paused"
                    : "Up to date"}
              </p>
              <h2 className="mt-1 font-sans text-[1.25rem] font-bold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                {followState.loading
                  ? "Bringing your Radius together…"
                  : isPaused
                    ? "Your on-device places are still safe."
                    : `${accountPlaceCount} ${accountPlaceCount === 1 ? "place" : "places"} kept with your account.`}
              </h2>
              <p className={`mt-1 ${ROW_HELP}`} style={{ color: "var(--app-ink-3)" }}>
                {isPaused
                  ? "Sign in to securely sync your places."
                  : "Available anywhere you sign in. Places from this device are added without removing anything already there."}
              </p>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow>
          <div className="flex gap-3">
            <MapPin className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold" style={{ color: "var(--app-ink)" }}>
                Places with your account · {accountPlaceCount}
              </p>
              <p className={`mt-0.5 ${ROW_HELP}`} style={{ color: "var(--app-ink-3)" }}>
                Kept with your account
              </p>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow>
          <div className="flex gap-3">
            <Smartphone className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold" style={{ color: "var(--app-ink)" }}>
                Events {eventCount} · Routes {routeCount}
                {waitingPlaceCount > 0 ? ` · Places waiting ${waitingPlaceCount}` : ""}
              </p>
              <p className={`mt-0.5 ${ROW_HELP}`} style={{ color: "var(--app-ink-3)" }}>
                Stay on this device for now
              </p>
            </div>
          </div>
        </SettingsRow>
      </SettingsRows>
    </div>
  );
}
