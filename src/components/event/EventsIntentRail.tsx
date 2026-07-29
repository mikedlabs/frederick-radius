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
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import {
  PRIMARY_INTENTS,
  INTENT_BY_ID,
  type EventIntent,
  type IntentId,
} from "@/lib/events/intents";
import { EVENT_INTENT_COLOR } from "@/components/event/boardCaption";

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
        className="shelf-rail flex items-stretch gap-2 overflow-x-auto pb-1.5"
      >
        <IntentChip
          label="All events"
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
  const Icon = intent ? ICONS[intent.icon] : LayoutGrid;
  const text = label ?? intent?.label ?? "";
  const accent = intent ? EVENT_INTENT_COLOR[intent.id] : "var(--app-brand)";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="event-intent-tile tactile tactile-interactive tap-44 flex min-h-[76px] w-[104px] shrink-0 flex-col items-start justify-between overflow-hidden rounded-[var(--app-radius-md)] border p-2.5 text-left transition"
      style={{
        background: active
          ? `color-mix(in srgb, ${accent} 76%, var(--app-ink))`
          : `color-mix(in srgb, ${accent} 9%, var(--app-bg-elevated))`,
        borderColor: active
          ? `color-mix(in srgb, ${accent} 76%, var(--app-ink))`
          : `color-mix(in srgb, ${accent} 25%, var(--app-border))`,
        color: active ? "var(--app-on-brand)" : quiet ? "var(--app-ink-3)" : "var(--app-ink)",
        boxShadow: active
          ? "var(--app-elev-2), var(--app-hi)"
          : "var(--app-edge), var(--app-hi), var(--app-elev-1)",
        opacity: !active && (count ?? 1) === 0 ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-[10px]"
        style={{
          background: active
            ? "rgba(255,255,255,0.16)"
            : `color-mix(in srgb, ${accent} 16%, var(--app-bg-elevated))`,
          color: active ? "var(--app-on-brand)" : accent,
          boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.16)" : "var(--app-edge)",
        }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="flex w-full items-end justify-between gap-2">
        <span className="line-clamp-2 text-[12.5px] font-semibold leading-[1.08]">
          {text}
        </span>
        {typeof count === "number" && count > 0 && (
          <span
            className="shrink-0 font-mono text-[10.5px] tabular-nums"
            style={{ color: active ? "rgba(255,255,255,0.78)" : "var(--app-ink-3)" }}
          >
            {count}
          </span>
        )}
      </span>
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
