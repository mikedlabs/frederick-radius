"use client";

import { useSyncExternalStore } from "react";
import { getScope, scopeTownSlug, subscribeScopeChange, type Scope } from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/** Plain-language contract for Today's mixed scope. Place decisions honor the
 * shared lens; weather, alerts, and the event program remain countywide. */
export function todayScopeStatusText(scope: Scope | null): string {
  const townSlug = scopeTownSlug(scope);
  const town = townSlug ? MUNICIPALITY_BY_SLUG[townSlug] : null;
  if (town) return `${town.name} place picks · Countywide weather and events`;
  if (scope === "nearme") return "Nearby place picks · Countywide weather and events";
  return "Countywide briefing";
}

const subscribe = (onStoreChange: () => void) =>
  subscribeScopeChange(() => onStoreChange());

/**
 * The LocationChip intentionally hides its text below 390px. Keep the active
 * lens visible in the page itself and announce changes without pretending the
 * fixed-center weather or county event program is filtered to one town.
 *
 * `dateline` carries the calendar date as this line's first segment. It used
 * to be its own decorated eyebrow ABOVE the h1 (brick dash + uppercase),
 * which meant two supporting rows bracketed the title and the largest thing
 * in the masthead was still smaller than the section headings below it. One
 * quiet line under the title now holds both supporting facts.
 */
export default function TodayScopeStatus({ dateline }: { dateline?: string }) {
  const scope = useSyncExternalStore(subscribe, getScope, () => null);
  const townScoped = Boolean(scopeTownSlug(scope));

  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="today-scope-status"
      className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] leading-snug tracking-[0.02em]"
      style={{ color: "var(--app-ink-3)" }}
    >
      {dateline && (
        <>
          <span style={{ color: "var(--app-ink-2)" }}>{dateline}</span>
          <span aria-hidden>·</span>
        </>
      )}
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: townScoped ? "var(--app-brand)" : "var(--app-cool)",
        }}
      />
      {todayScopeStatusText(scope)}
    </p>
  );
}
