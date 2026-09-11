"use client";

import { useEffect, useState } from "react";
import RippleMark from "@/components/brand/RippleMark";
import {
  formatOfflineAge,
  readOfflineSnapshot,
  type OfflineSnapshotView,
} from "@/lib/offline-snapshot";

function friendlyIdentifier(value: string): string {
  if (value === "nearme") return "Near me";
  if (value === "county") return "Whole county";
  return value
    .replace(/^town:/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function savedSummary(snapshot: NonNullable<OfflineSnapshotView["saved"]>): string {
  const parts = [
    snapshot.place ? `${snapshot.place} place${snapshot.place === 1 ? "" : "s"}` : null,
    snapshot.event ? `${snapshot.event} event${snapshot.event === 1 ? "" : "s"}` : null,
    snapshot.radius ? `${snapshot.radius} route${snapshot.radius === 1 ? "" : "s"}` : null,
    snapshot.beer ? `${snapshot.beer} beer${snapshot.beer === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * The service worker caches this generic shell only. IndexedDB fills the
 * optional handoff after hydration; no personalized HTML enters Cache Storage.
 */
export default function OfflinePage() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshotView | null>(null);
  const [checked, setChecked] = useState(false);
  const [readAt] = useState(() => Date.now());

  useEffect(() => {
    readOfflineSnapshot(readAt)
      .then(setSnapshot)
      .catch(() => setSnapshot(null))
      .finally(() => setChecked(true));
  }, [readAt]);

  const preferenceLabels = snapshot?.preferences
    ? [
        snapshot.preferences.homeMunicipality
          ? `Home: ${friendlyIdentifier(snapshot.preferences.homeMunicipality)}`
          : null,
        snapshot.preferences.scope
          ? `Area: ${friendlyIdentifier(snapshot.preferences.scope)}`
          : null,
        snapshot.preferences.mode
          ? friendlyIdentifier(snapshot.preferences.mode)
          : null,
        ...snapshot.preferences.interests.map(friendlyIdentifier),
      ].filter((label): label is string => Boolean(label))
    : [];
  const hasUsefulSnapshot = Boolean(
    snapshot?.today ||
    (snapshot?.saved && snapshot.saved.total > 0) ||
    preferenceLabels.length > 0,
  );

  return (
    <main
      className="mx-auto flex min-h-[82vh] w-full max-w-lg flex-col justify-center px-5 py-10"
      style={{ color: "var(--app-ink)" }}
    >
      <div className="flex items-center gap-3">
        <RippleMark size={52} tile />
        <div>
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Saved on this device
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-semibold leading-none tracking-tight">
            No connection
          </h1>
        </div>
      </div>

      <p
        className="mt-4 max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--app-ink-2)" }}
      >
        Radius could not reach the live sources. The small snapshot below was
        saved earlier and may have changed.
      </p>

      <div className="mt-5 space-y-3" aria-live="polite">
        {!checked ? (
          <div
            role="status"
            className="rounded-[var(--app-radius-lg)] border px-4 py-4 text-[13px]"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
              color: "var(--app-ink-2)",
              boxShadow: "var(--app-hi)",
            }}
          >
            Checking the last device snapshot…
          </div>
        ) : null}

        {checked && snapshot?.today ? (
          <section
            aria-labelledby="offline-today-title"
            className="overflow-hidden rounded-[var(--app-radius-lg)] border"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <h2
                id="offline-today-title"
                className="text-[13px] font-semibold"
              >
                Last saved from Today
              </h2>
              <span
                className="shrink-0 rounded-full px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: "var(--app-bg-sunken)",
                  color: "var(--app-ink-3)",
                }}
              >
                Not live · {formatOfflineAge(snapshot.today.updatedAt, readAt)}
              </span>
            </div>

            {snapshot.today.weather ? (
              <div className="px-4 py-4">
                <p
                  className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Weather when saved
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  {snapshot.today.weather.temperatureF !== undefined ? (
                    <span className="font-serif text-[34px] font-light leading-none tabular-nums">
                      {snapshot.today.weather.temperatureF}°
                    </span>
                  ) : null}
                  <p className="text-[15px] font-semibold leading-snug">
                    {snapshot.today.weather.headline}
                  </p>
                </div>
                {snapshot.today.weather.safetyNote ? (
                  <p
                    className="mt-2 text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {snapshot.today.weather.safetyNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            {snapshot.today.lead ? (
              <div
                className="border-t px-4 py-3.5"
                style={{ borderColor: "var(--app-border)" }}
              >
                <p
                  className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {snapshot.today.lead.kind === "event"
                    ? "Event when saved"
                    : "Place when saved"}
                </p>
                <p className="mt-1 text-[15px] font-semibold leading-snug">
                  {snapshot.today.lead.title}
                </p>
                {snapshot.today.lead.detail ? (
                  <p
                    className="mt-1 text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {snapshot.today.lead.detail}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {checked && snapshot?.saved && snapshot.saved.total > 0 ? (
          <section
            aria-labelledby="offline-saved-title"
            className="rounded-[var(--app-radius-lg)] border px-4 py-3.5"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
              boxShadow: "var(--app-hi)",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="offline-saved-title" className="text-[13px] font-semibold">
                Saved
              </h2>
              <span className="font-serif text-[24px] leading-none tabular-nums">
                {snapshot.saved.capped ? `${snapshot.saved.total}+` : snapshot.saved.total}
              </span>
            </div>
            <p
              className="mt-1.5 text-[12px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {savedSummary(snapshot.saved)}
            </p>
          </section>
        ) : null}

        {checked && preferenceLabels.length > 0 ? (
          <section aria-labelledby="offline-lens-title" className="px-0.5 pt-1">
            <h2
              id="offline-lens-title"
              className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Your saved lens
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preferenceLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink-2)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {checked && !hasUsefulSnapshot ? (
          <div
            className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-4 text-[13px] leading-relaxed"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-ink-2)",
            }}
          >
            There is no recent device snapshot yet. Reconnect once and Radius
            will keep a small, private handoff for the next outage.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="tactile tactile-interactive tactile-lift mt-6 min-h-12 rounded-[var(--app-radius-md)] px-5 py-3 text-[14px] font-semibold text-white"
        style={{ background: "var(--app-brand)" }}
      >
        Try again
      </button>

      {snapshot ? (
        <p
          className="mt-3 text-center font-mono text-[10px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          Last online update {formatOfflineAge(snapshot.updatedAt, readAt)}.
          Today details expire after 12 hours.
        </p>
      ) : null}
    </main>
  );
}
