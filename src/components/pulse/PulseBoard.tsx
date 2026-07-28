"use client";

import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  CloudAlert,
  CloudSun,
  Construction,
  Fish,
  Newspaper,
  Plane,
  Radio,
  School,
  Shield,
  Siren,
  TrafficCone,
  TrainFront,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import PulseFreshness from "@/components/pulse/PulseFreshness";
import { track } from "@/lib/track";

const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  CloudAlert,
  CloudSun,
  Construction,
  Fish,
  Newspaper,
  Plane,
  Radio,
  School,
  Shield,
  Siren,
  TrafficCone,
  TrainFront,
  Waves,
  Wind,
  Zap,
};

const CONDITIONS = new Set(["weather", "air", "rivers"]);
const GETTING_AROUND = new Set(["traffic", "roadwork", "train", "airports"]);
const PRIMARY_CONDITIONS = new Set(["weather", "air", "traffic", "roadwork"]);
const STEADY_SYSTEMS = new Set(["power", "safety", "schools", "alerts"]);
const LOCAL_UPDATES = new Set(["fixit", "trout", "airspace", "news", "police", "scanner"]);
const SNAPSHOT_KEY = "fr.pulse.snapshot.v2";

export type PulseHeroChip = {
  tone: "danger" | "warning" | "cool" | "positive";
  label: string;
  key?: string;
  /** Mono meta line for the active-alerts ledger: the clock/scope a reader
   *  wants ("clears ~5 PM", "until 8:00 PM"). The severity word is prepended
   *  automatically, so this is just the fact after it. */
  meta?: string;
};

export type PulseHeroFact = {
  label: string;
  value: string;
  detail?: string;
};

const CHIP_TONE: Record<PulseHeroChip["tone"], string> = {
  danger: "var(--app-danger)",
  warning: "var(--app-warning)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

// A severity WORD always sits beside the color, so state never relies on tint
// alone (axe/contrast safe) and reads at arm's length.
const TONE_WORD: Record<PulseHeroChip["tone"], string> = {
  danger: "High",
  warning: "Elevated",
  cool: "Watch",
  positive: "Clear",
};

export type PulseHero = {
  allClear: boolean;
  degraded?: boolean;
  tone?: PulseHeroChip["tone"];
  line: string;
  sub: string;
  renderedAt: number;
  /** Structured, source-backed facts for the lead situation. Active-alert
   *  heroes use these instead of leaving the explanation as a wall of type. */
  facts?: PulseHeroFact[];
  /** The lead situation is fully explained in the hero, so it is not repeated below. */
  leadKey?: string;
  leadMeta?: string;
  actionLabel?: string;
};

export function pulseStatusWord({
  allClear,
  degraded,
  hasLead,
  tone,
}: {
  allClear: boolean;
  degraded: boolean;
  hasLead: boolean;
  tone: PulseHeroChip["tone"];
}): string {
  if (allClear) return "Checked";
  if (degraded) return "Partial data";
  if (!hasLead) return "Local issue";
  if (tone === "danger") return "Urgent";
  if (tone === "warning") return "Advisory";
  return "Watch";
}

export type PulseTile = {
  key: string;
  label: string;
  iconName: string;
  sourceLabel: string;
  countLabel: string;
  accent: string;
  active: boolean;
  attention: boolean;
  /** The source did not answer, so a zero value is unknown rather than clear. */
  degraded?: boolean;
  kind: "feature" | "gauge" | "status";
  peek?: string;
  gauge?: { value: number; pct: number; unit: string; decimals?: number; comma?: boolean };
  feature?: { temp: number; condition: string; hl?: string };
  body: ReactNode;
};

type Snapshot = {
  at: number;
  active: Record<string, string>;
};

function iconFor(tile: PulseTile) {
  return ICONS[tile.iconName] ?? AlertTriangle;
}

function updateOpenParam(key: string | null, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("open", key);
  else url.searchParams.delete("open");
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

function timeSince(at: number): string {
  const mins = Math.max(1, Math.floor((Date.now() - at) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function GroupHeading({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4">
      <h2
        id={id}
        className="min-w-0 break-words font-sans text-[17px] font-semibold leading-tight tracking-[-0.02em]"
        style={{ color: "var(--app-ink)" }}
      >
        {title}
      </h2>
      {note && (
        <span
          className="max-w-[48%] shrink text-right text-[10.5px] leading-tight [overflow-wrap:anywhere]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {note}
        </span>
      )}
    </div>
  );
}

/** Live situations stay in a short ledger with a written severity, so color is
 * supportive rather than the only signal. Quiet facts belong in Right now. */
function AlertLedgerRow({ chip, onOpen, last }: { chip: PulseHeroChip; onOpen: (key: string) => void; last: boolean }) {
  const color = CHIP_TONE[chip.tone];
  const meta = [TONE_WORD[chip.tone], chip.meta].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 py-2.5">
        <span className="block line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{chip.label}</span>
        <span className="mt-0.5 block break-words font-mono text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{meta}</span>
      </span>
      {chip.key && <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 self-center opacity-45" />}
    </>
  );
  const cls = `flex min-h-11 w-full items-stretch gap-2.5 pl-1 pr-1 text-left${last ? "" : " border-b"}`;
  const border = { borderColor: "var(--app-border)" };
  return (
    <li>
      {chip.key ? (
        <button type="button" onClick={() => onOpen(chip.key!)} className={cls} style={border}>{inner}</button>
      ) : (
        <span className={`${cls} items-center`} style={border}>{inner}</span>
      )}
    </li>
  );
}

function HeroFacts({ chips, onOpen }: { chips: PulseHeroChip[]; onOpen: (key: string) => void }) {
  const rows = chips.filter((chip) => chip.tone !== "positive").slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <ul
      className="overflow-hidden rounded-[var(--app-radius-md)] border px-2"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      {rows.map((chip, index) => (
        <AlertLedgerRow
          key={`${chip.key ?? "row"}-${index}`}
          chip={chip}
          onOpen={onOpen}
          last={index === rows.length - 1}
        />
      ))}
    </ul>
  );
}

function AlertDataPanel({
  facts,
  lead,
  meta,
  actionLabel,
  color,
  onOpen,
}: {
  facts: PulseHeroFact[];
  lead: PulseTile;
  meta?: string;
  actionLabel: string;
  color: string;
  onOpen: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{
        borderColor: `color-mix(in srgb, ${color} 32%, var(--app-border))`,
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <div
        className="flex min-h-11 items-center gap-2.5 border-b px-3"
        style={{ borderColor: `color-mix(in srgb, ${color} 24%, var(--app-border))` }}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 11%, transparent)`,
          }}
        >
          {createElement(iconFor(lead), { className: "h-4 w-4", strokeWidth: 2.2 })}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
          {lead.label}
        </span>
        <span className="max-w-[44%] text-right text-[9.5px] font-medium leading-tight" style={{ color: "var(--app-ink-3)" }}>
          {lead.sourceLabel}
        </span>
      </div>

      <dl className="grid grid-cols-2">
        {facts.slice(0, 4).map((fact, index) => (
          <div
            key={`${fact.label}-${index}`}
            className="min-w-0 border-b px-3 py-2 odd:border-r"
            style={{ borderColor: `color-mix(in srgb, ${color} 20%, var(--app-border))` }}
          >
            <dt className="text-[8.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              {fact.label}
            </dt>
            <dd
              className={`${index === 0 ? "text-[17px] " : "text-[12px] "}mt-1 break-words font-semibold leading-tight tabular-nums`}
              style={{ color: index === 0 ? color : "var(--app-ink)" }}
            >
              {fact.value}
            </dd>
            {fact.detail ? (
              <dd className="mt-0.5 break-words text-[9.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
                {fact.detail}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
        {meta ? (
          <p className="flex min-w-0 items-center gap-1.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {meta}
          </p>
        ) : <span />}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[11.5px] font-semibold transition active:opacity-70"
          style={{
            color: "var(--app-ink)",
          }}
        >
          {actionLabel}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SinceLastLook({ tiles }: { tiles: PulseTile[] }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Storage is external state. Read it after paint so hydration remains
    // deterministic and the first briefing render is never delayed by it.
    const timer = window.setTimeout(() => {
      const current = Object.fromEntries(
        tiles.filter((tile) => tile.attention).map((tile) => [tile.key, tile.countLabel]),
      );
      let previous: Snapshot | null = null;
      try {
        previous = JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) ?? "null") as Snapshot | null;
      } catch {
        previous = null;
      }

      if (previous?.at) {
        const added = Object.keys(current).filter((key) => previous?.active[key] !== current[key]);
        const cleared = Object.keys(previous.active).filter((key) => !(key in current));
        if (added.length > 0) {
          const labels = added
            .map((key) => tiles.find((tile) => tile.key === key)?.label)
            .filter(Boolean)
            .slice(0, 2)
            .join(" and ");
          setMessage(`${labels} ${added.length === 1 ? "has" : "have"} changed since ${timeSince(previous.at)}.`);
        } else if (cleared.length > 0) {
          const labels = cleared
            .map((key) => tiles.find((tile) => tile.key === key)?.label ?? key)
            .slice(0, 2)
            .join(" and ");
          setMessage(`${labels} ${cleared.length === 1 ? "has" : "have"} cleared since ${timeSince(previous.at)}.`);
        }
      }

      try {
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), active: current } satisfies Snapshot));
      } catch {
        // Pulse remains fully useful when storage is blocked.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tiles]);

  if (!message) return null;

  return (
    <div role="status" className="flex min-w-0 items-start gap-2.5 border-y px-1 py-3" style={{ borderColor: "var(--app-border-strong)" }}>
      <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-2)" }}>Since your last look</p>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{message}</p>
      </div>
    </div>
  );
}

function UpdateRow({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  return (
    <li className="min-w-0">
      <button type="button" onClick={onOpen} className="group flex min-h-[58px] min-w-0 w-full max-w-full items-center gap-3 overflow-hidden border-b py-2.5 text-left last:border-b-0" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 10%, transparent)` }}>
          {createElement(iconFor(tile), { className: "h-4 w-4", strokeWidth: 2 })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{tile.label}</span>
          <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{tile.peek ?? tile.countLabel}</span>
        </span>
        <span className="min-w-0 max-w-[7rem] shrink text-right text-[10.5px] leading-tight [overflow-wrap:anywhere]" style={{ color: "var(--app-ink-3)" }}>{tile.peek ? tile.countLabel : ""}</span>
        <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" />
      </button>
    </li>
  );
}

function SecondarySignals({
  checks,
  updates,
  visibleUpdates,
  showAllUpdates,
  onToggleUpdates,
  onOpen,
}: {
  checks: PulseTile[];
  updates: PulseTile[];
  visibleUpdates: PulseTile[];
  showAllUpdates: boolean;
  onToggleUpdates: () => void;
  onOpen: (key: string) => void;
}) {
  if (checks.length === 0 && updates.length === 0) return null;
  const degradedCount = checks.filter((tile) => tile.degraded).length;
  const total = checks.length + updates.length;

  return (
    <section aria-labelledby="pulse-secondary-heading" className="min-w-0">
      <details
        className="group overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-bg-elevated-solid) 54%, transparent)",
        }}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]">
          {degradedCount > 0 ? (
            <AlertTriangle
              aria-hidden
              className="h-4 w-4 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--app-warning)" }}
            />
          ) : (
            <Shield
              aria-hidden
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
            />
          )}
          <span id="pulse-secondary-heading" className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              More local signals
            </span>
            <span className="mt-0.5 block text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
              {degradedCount > 0
                ? `${degradedCount} ${degradedCount === 1 ? "feed needs" : "feeds need"} a refresh`
                : `${total} additional ${total === 1 ? "source" : "sources"}`}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 opacity-50 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="border-t px-3 pb-3" style={{ borderColor: "var(--app-border)" }}>
          {checks.length > 0 && (
            <div className="pt-3">
              <h3
                className="text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Additional checks
              </h3>
              <ul className="mt-1 grid min-w-0 grid-cols-2 gap-x-4 sm:grid-cols-3">
                {checks.map((tile) => {
                  const degraded = tile.degraded === true;
                  return (
                    <li key={tile.key} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(tile.key)}
                        className="flex min-h-11 min-w-0 w-full items-center gap-2 text-left"
                        aria-label={`${tile.label}: ${tile.countLabel}`}
                      >
                        {degraded ? (
                          <AlertTriangle
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0"
                            strokeWidth={2.25}
                            style={{ color: "var(--app-warning)" }}
                          />
                        ) : (
                          <Check
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0"
                            strokeWidth={2.5}
                            style={{ color: "var(--app-positive)" }}
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-medium" style={{ color: "var(--app-ink-2)" }}>
                            {tile.label}
                          </span>
                          <span className="block truncate text-[9.5px]" style={{ color: degraded ? "var(--app-warning)" : "var(--app-ink-3)" }}>
                            {tile.countLabel}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {updates.length > 0 && (
            <div className={checks.length > 0 ? "border-t pt-3" : "pt-3"} style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-center gap-2">
                <Newspaper aria-hidden className="h-3.5 w-3.5" style={{ color: "var(--app-ink-3)" }} />
                <h3
                  className="text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Local updates
                </h3>
              </div>
              <ul id="pulse-local-updates" className="mt-1 min-w-0">
                {visibleUpdates.map((tile) => (
                  <UpdateRow key={tile.key} tile={tile} onOpen={() => onOpen(tile.key)} />
                ))}
              </ul>
              {updates.length > 4 && (
                <button
                  type="button"
                  onClick={onToggleUpdates}
                  aria-expanded={showAllUpdates}
                  aria-controls="pulse-local-updates"
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t text-[11.5px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  {showAllUpdates ? "Show fewer updates" : `${updates.length - 4} more updates`}
                  <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform${showAllUpdates ? " rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

/** One compact reading. Pulse shows the four facts most likely to change a trip
 * first; the remaining feeds stay one tap away in More local signals. */
function ConditionReading({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  const f = tile.feature;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[82px] min-w-0 items-start gap-2.5 p-3 text-left transition active:bg-black/[0.025]"
      style={{
        borderColor: "var(--app-border)",
        background: tile.degraded
          ? "color-mix(in srgb, var(--app-warning) 4%, transparent)"
          : "transparent",
      }}
      aria-label={`${tile.label}: ${f?.condition ?? tile.countLabel}`}
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{
          color: tile.degraded ? "var(--app-warning)" : tile.accent,
          background: `color-mix(in srgb, ${tile.degraded ? "var(--app-warning)" : tile.accent} 9%, transparent)`,
        }}
      >
        {createElement(iconFor(tile), { className: "h-3.5 w-3.5", strokeWidth: 2 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {tile.label}
          </span>
          <ArrowRight aria-hidden className="h-3 w-3 shrink-0 opacity-25 transition-transform group-hover:translate-x-0.5" />
        </span>
        {f ? (
          <>
            <span className="mt-1 flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-[19px] font-semibold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                {f.temp}°
              </span>
              {f.hl && (
                <span className="min-w-0 truncate text-[9.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                  {f.hl}
                </span>
              )}
            </span>
            <span className="mt-1 block line-clamp-2 text-[10.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              {f.condition}
            </span>
          </>
        ) : (
          <span className="mt-1.5 block min-w-0 line-clamp-2 text-[12px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            {tile.countLabel}
          </span>
        )}
      </span>
    </button>
  );
}

/** A live situation row with the context the compact readings intentionally omit. */
function AttentionTile({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[62px] w-full items-center gap-3 border-b px-2 py-2.5 text-left transition last:border-b-0 active:bg-black/[0.025]"
      style={{
        borderColor: "var(--app-border)",
      }}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 11%, transparent)` }}
      >
        {createElement(iconFor(tile), { className: "h-4 w-4", strokeWidth: 2 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{tile.label}</span>
        <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{tile.peek ?? tile.countLabel}</span>
      </span>
      {tile.peek && <span className="shrink-0 text-right text-[11px] font-semibold" style={{ color: tile.accent }}>{tile.countLabel}</span>}
      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export default function PulseBoard({
  hero,
  chips,
  tiles,
  breaking,
}: {
  hero: PulseHero;
  chips: PulseHeroChip[];
  tiles: PulseTile[];
  breaking?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const pushedOpen = useRef(false);

  const current = tiles.find((tile) => tile.key === open) ?? null;
  const lead = hero.leadKey ? tiles.find((tile) => tile.key === hero.leadKey) : null;
  const summarizedKeys = new Set(chips.map((chip) => chip.key).filter((key): key is string => Boolean(key)));
  const attention = tiles.filter((tile) => tile.attention && tile.key !== hero.leadKey && !summarizedKeys.has(tile.key));
  const conditions = tiles.filter((tile) => CONDITIONS.has(tile.key) && !tile.attention && tile.key !== hero.leadKey);
  const gettingAround = tiles.filter((tile) => GETTING_AROUND.has(tile.key) && !tile.attention && tile.key !== hero.leadKey);
  const steady = tiles.filter((tile) => STEADY_SYSTEMS.has(tile.key) && !tile.attention && tile.key !== hero.leadKey && !summarizedKeys.has(tile.key));
  const localUpdates = tiles.filter((tile) => LOCAL_UPDATES.has(tile.key) && !tile.attention && tile.key !== hero.leadKey);
  const visibleUpdates = showAllUpdates ? localUpdates : localUpdates.slice(0, 4);
  const beforeYouGo = [...conditions, ...gettingAround];
  const atGlance = [
    ...beforeYouGo.filter((tile) => PRIMARY_CONDITIONS.has(tile.key)),
    ...beforeYouGo.filter((tile) => !PRIMARY_CONDITIONS.has(tile.key)),
  ].slice(0, 4);
  const atGlanceKeys = new Set(atGlance.map((tile) => tile.key));
  const moreChecks = [
    ...beforeYouGo.filter((tile) => !atGlanceKeys.has(tile.key)),
    ...steady,
  ];

  const validKeys = useMemo(() => new Set(tiles.map((tile) => tile.key)), [tiles]);

  useEffect(() => {
    const syncFromUrl = () => {
      const key = new URL(window.location.href).searchParams.get("open");
      setOpen(key && validKeys.has(key) ? key : null);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [validKeys]);

  const openTile = (key: string) => {
    if (!validKeys.has(key)) return;
    track("pulse_item_open");
    if (open) updateOpenParam(key, "replace");
    else {
      updateOpenParam(key, "push");
      pushedOpen.current = true;
    }
    setOpen(key);
  };

  const closeDrawer = () => {
    if (pushedOpen.current) {
      pushedOpen.current = false;
      window.history.back();
    } else {
      updateOpenParam(null, "replace");
      setOpen(null);
    }
  };

  const degraded = hero.degraded ?? false;
  const heroTone = hero.tone ?? (hero.allClear ? "positive" : degraded ? "warning" : "danger");
  const heroColor = CHIP_TONE[heroTone];
  const heroFacts = hero.facts?.filter((fact) => fact.value.trim().length > 0).slice(0, 4) ?? [];
  const showAlertData = !hero.allClear && Boolean(lead) && heroFacts.length > 0;
  const attentionChips = chips.filter(
    (chip) => chip.tone !== "positive" && (!showAlertData || chip.key !== hero.leadKey),
  );
  const attentionCount = attention.length + attentionChips.length + (showAlertData ? 1 : 0);
  const hasAttention = attentionCount > 0;
  const statusWord = pulseStatusWord({
    allClear: hero.allClear,
    degraded,
    hasLead: Boolean(lead),
    tone: heroTone,
  });

  return (
    <>
      <header
        className="-mx-4 -mt-6 border-b px-4 pb-5 pt-4 text-[var(--app-ink)] sm:-mx-5 sm:px-5 sm:pb-6 lg:mx-0 lg:mt-0 lg:px-0 lg:pt-0"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="max-w-[44rem]">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  color: heroColor,
                  background: `color-mix(in srgb, ${heroColor} 11%, transparent)`,
                }}
              >
                {hero.allClear ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className="block text-[9.5px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Frederick Pulse
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: heroColor }}>
                  {statusWord}
                </span>
              </span>
            </div>
            <PulseFreshness renderedAt={hero.renderedAt} />
          </div>
          <h1 className="mt-4 max-w-[40rem] font-sans text-[clamp(1.45rem,5.5vw,1.85rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-balance text-[var(--app-ink)]">
            {hero.line}
          </h1>
          <p className="mt-2 max-w-[38rem] text-[12.5px] leading-relaxed text-[var(--app-ink-2)]">{hero.sub}</p>
          {!showAlertData && (hero.leadMeta || lead) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              {hero.leadMeta && (
                <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[var(--app-ink-3)]">
                  <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {hero.leadMeta}
                </p>
              )}
              {lead && (
                <button
                  type="button"
                  onClick={() => openTile(lead.key)}
                  className="inline-flex min-h-11 items-center gap-1.5 text-[11.5px] font-semibold text-[var(--app-ink)] transition active:opacity-70"
                >
                  {hero.actionLabel ?? "See what this means"}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {breaking}

      <SinceLastLook tiles={tiles} />

      <div className="mx-auto min-w-0 max-w-[64rem] space-y-6">
        {hasAttention && (
          <section aria-labelledby="pulse-attention-heading" className="min-w-0 space-y-2.5">
            <GroupHeading
              id="pulse-attention-heading"
              title="Needs attention"
              note={`${attentionCount} ${attentionCount === 1 ? "update" : "updates"}`}
            />
            <div className="space-y-2.5">
              {showAlertData && lead && (
                <AlertDataPanel
                  facts={heroFacts}
                  lead={lead}
                  meta={hero.leadMeta}
                  actionLabel={hero.actionLabel ?? "See what this means"}
                  color={heroColor}
                  onOpen={() => openTile(lead.key)}
                />
              )}
              <HeroFacts chips={attentionChips} onOpen={openTile} />
              {attention.length > 0 && (
                <div
                  className="overflow-hidden rounded-[var(--app-radius-md)] border px-1"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-bg-elevated-solid)",
                  }}
                >
                  {attention.map((tile) => (
                    <AttentionTile key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {atGlance.length > 0 && (
          <section aria-labelledby="pulse-live-board-heading" className="min-w-0 space-y-2.5">
            <GroupHeading
              id="pulse-live-board-heading"
              title="Right now"
              note={`${atGlance.length} quick ${atGlance.length === 1 ? "check" : "checks"}`}
            />
            <div
              className="grid min-w-0 grid-cols-2 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] [&>button:nth-child(-n+2)]:border-b [&>button:nth-child(odd)]:border-r"
              style={{ borderColor: "var(--app-border)" }}
            >
              {atGlance.map((tile) => (
                <ConditionReading key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />
              ))}
            </div>
          </section>
        )}

        <SecondarySignals
          checks={moreChecks}
          updates={localUpdates}
          visibleUpdates={visibleUpdates}
          showAllUpdates={showAllUpdates}
          onToggleUpdates={() => setShowAllUpdates((value) => !value)}
          onOpen={openTile}
        />
      </div>

      <BottomDrawer
        open={open !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) closeDrawer(); }}
        title={current?.label ?? ""}
        subtitle={current ? `Source: ${current.sourceLabel}` : undefined}
      >
        <div className="space-y-2 px-4 pb-2">{current?.body}</div>
      </BottomDrawer>
    </>
  );
}
