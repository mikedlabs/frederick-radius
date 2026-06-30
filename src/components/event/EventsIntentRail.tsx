"use client";

import {
  Music,
  Palette,
  Utensils,
  Users,
  Activity,
  Trees,
  Sparkles,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import {
  PRIMARY_INTENTS,
  INTENT_BY_ID,
  type EventIntent,
  type IntentId,
} from "@/lib/events/intents";

/**
 * EventsIntentRail — the new /events front door.
 *
 * Replaces the old flat, alphabetical, single-select category dump with the
 * seven human INTENTS (Music, Arts & culture, Food & drink, …) as a scannable
 * icon-led rail, plus a second row of sub-categories when the active intent has
 * them, and the tucked "Government & notices" (civic) lane at the end. Counts
 * ride on each chip so a glance reads where the events are; empty intents dim
 * but stay (the taxonomy is the map, not a reflection of one day's feed).
 *
 * Controlled + presentational: the explorer owns the URL state (?intent / ?sub)
 * and passes it in. Tokens-only, 44px hit areas, reduced-motion safe.
 */
const ICONS: Record<string, LucideIcon> = {
  Music, Palette, Utensils, Users, Activity, Trees, Sparkles, Landmark,
};

export default function EventsIntentRail({
  activeIntent,
  activeSub,
  counts,
  onIntent,
  onSub,
}: {
  activeIntent: IntentId | null;
  activeSub: string | null;
  /** Events per intent, for the chip badges. */
  counts: Record<IntentId, number>;
  onIntent: (id: IntentId | null) => void;
  onSub: (slug: string | null) => void;
}) {
  const civic = INTENT_BY_ID.civic;
  const active = activeIntent ? INTENT_BY_ID[activeIntent] : null;
  const subs = active?.subs ?? [];

  return (
    <div className="flex flex-col gap-2">
      {/* Primary intent rail */}
      <div
        role="tablist"
        aria-label="Browse events by what you want to do"
        className="shelf-rail flex items-stretch gap-2 overflow-x-auto pb-1"
      >
        <IntentChip
          label="All"
          active={activeIntent === null}
          onClick={() => { haptic("light"); onIntent(null); onSub(null); }}
        />
        {PRIMARY_INTENTS.map((intent) => (
          <IntentChip
            key={intent.id}
            intent={intent}
            count={counts[intent.id] ?? 0}
            active={activeIntent === intent.id}
            onClick={() => {
              haptic("light");
              onIntent(activeIntent === intent.id ? null : intent.id);
              onSub(null);
            }}
          />
        ))}
        {/* Tucked civic lane — present but quiet, never competes with draws. */}
        <IntentChip
          intent={civic}
          count={counts.civic ?? 0}
          active={activeIntent === "civic"}
          quiet
          onClick={() => {
            haptic("light");
            onIntent(activeIntent === "civic" ? null : "civic");
            onSub(null);
          }}
        />
      </div>

      {/* Second-row sub-categories for the active intent (e.g. Food → Breweries) */}
      {subs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={`${active?.label} types`}>
          <SubChip label="All" active={activeSub === null} onClick={() => { haptic("light"); onSub(null); }} />
          {subs.map((s) => (
            <SubChip
              key={s.slug}
              label={s.label}
              active={activeSub === s.slug}
              onClick={() => { haptic("light"); onSub(activeSub === s.slug ? null : s.slug); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IntentChip({
  intent,
  label,
  count,
  active,
  quiet,
  onClick,
}: {
  intent?: EventIntent;
  label?: string;
  count?: number;
  active: boolean;
  quiet?: boolean;
  onClick: () => void;
}) {
  const Icon = intent ? ICONS[intent.icon] : undefined;
  const text = label ?? intent?.label ?? "";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px] font-semibold transition"
      style={{
        background: active
          ? "var(--app-brand)"
          : "color-mix(in srgb, var(--app-ink) 6%, var(--app-bg-elevated))",
        color: active ? "var(--app-on-brand)" : quiet ? "var(--app-ink-3)" : "var(--app-ink)",
        boxShadow: active ? "var(--app-elev-1)" : "var(--app-edge)",
        opacity: !active && (count ?? 1) === 0 ? 0.5 : 1,
      }}
    >
      {Icon && <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />}
      <span>{text}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: active ? "var(--app-on-brand)" : "var(--app-ink-3)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SubChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="tap-44-y inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[12px] font-medium transition"
      style={{
        background: active ? "color-mix(in srgb, var(--app-brand) 14%, transparent)" : "transparent",
        color: active ? "var(--app-brand-press)" : "var(--app-ink-2)",
        boxShadow: active ? "inset 0 0 0 1px var(--app-brand)" : "inset 0 0 0 1px var(--app-border)",
      }}
    >
      {label}
    </button>
  );
}
