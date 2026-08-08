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

const SNAPSHOT_KEY = "fr.pulse.snapshot.v2";

const PULSE_BANK_DEFINITIONS = [
  {
    key: "conditions",
    label: "Conditions",
    tileKeys: ["weather", "air", "alerts", "rivers"],
  },
  {
    key: "getting-around",
    label: "Getting around",
    tileKeys: ["traffic", "scanner", "roadwork", "train", "airports"],
  },
  {
    key: "county-systems",
    label: "County systems",
    tileKeys: ["power", "safety", "schools"],
  },
  {
    key: "local-pulse",
    label: "Local pulse",
    tileKeys: ["fixit", "police", "news", "trout", "airspace"],
  },
] as const;

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

/** Calm measurements belong in Current conditions, never under a heading that
 *  tells the reader something needs attention. */
export function pulseAttentionChips(
  chips: PulseHeroChip[],
  {
    allClear,
    showAlertData,
    leadKey,
  }: {
    allClear: boolean;
    showAlertData: boolean;
    leadKey?: string;
  },
): PulseHeroChip[] {
  if (allClear) return [];
  return chips.filter(
    (chip) => chip.tone !== "positive" && (!showAlertData || chip.key !== leadKey),
  );
}

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
  if (degraded) return "Partial data";
  // Not "Checked": PulseFreshness prints "Checked Nm ago" in the same masthead
  // row, and the same word twice in one line read as a stutter. This word's
  // job is the county's state; the freshness stamp owns the checking.
  if (allClear) return "All quiet";
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
  /** More precise source state for tiles that remain useful with partial data
   * or whose integration is intentionally not connected. */
  availability?: "current" | "partial" | "unavailable" | "not-connected";
  /**
   * True when the tile carries an ambient MEASUREMENT — a number that exists
   * whether or not anything is wrong (temperature, AQI, river feet, a drive
   * time). These stay on the open board even when quiet, because "78° and
   * partly sunny" is the answer a person came for, not an absence to file.
   * Counter tiles (outages, reports, alerts) stay unmarked: their quiet state
   * IS an absence ("No major outage") and belongs behind the disclosure.
   * The page sets this only on branches that hold a real current value, so a
   * degraded fallback never claims to be a reading.
   */
  reading?: boolean;
  kind: "feature" | "gauge" | "status";
  peek?: string;
  gauge?: { value: number; pct: number; unit: string; decimals?: number; comma?: boolean };
  feature?: { temp: number; condition: string; hl?: string };
  body: ReactNode;
};

export type PulseTileState =
  | "Attention"
  | "Active"
  | "Current"
  | "Partial data"
  | "Not connected"
  | "Feed unavailable";

export type PulseTileBank = {
  key: string;
  label: string;
  tiles: PulseTile[];
};

/** Written state always accompanies color on a key. Missing data outranks
 * activity because a feed that did not answer cannot make a live claim. */
export function pulseTileState(tile: PulseTile): PulseTileState {
  const availability =
    tile.availability ?? (tile.degraded ? "unavailable" : "current");
  if (availability === "unavailable") return "Feed unavailable";
  if (availability === "not-connected") return "Not connected";
  if (availability === "partial") return "Partial data";
  if (tile.attention) return "Attention";
  if (tile.active) return "Active";
  return "Current";
}

/** Stable banks keep the board predictable while allowing conditional feeds
 * to disappear honestly. Every supplied tile is claimed once; a new key that
 * has not been classified yet remains visible in the fallback bank. */
export function pulseTileBanks(tiles: PulseTile[]): PulseTileBank[] {
  const byKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const claimed = new Set<string>();
  const banks: PulseTileBank[] = PULSE_BANK_DEFINITIONS.map((bank) => {
    const bankTiles = bank.tileKeys.flatMap((key) => {
      const tile = byKey.get(key);
      if (!tile) return [];
      claimed.add(key);
      return [tile];
    });
    return { key: bank.key, label: bank.label, tiles: bankTiles };
  });
  const fallback = tiles.filter((tile) => !claimed.has(tile.key));
  if (fallback.length > 0) {
    banks.push({ key: "more-signals", label: "More signals", tiles: fallback });
  }
  return banks;
}

export type PulseDisplayGroups = {
  attention: PulseTile[];
  actionable: PulseTile[];
  /** Ambient measurements that stay on the open board on a calm day. */
  readings: PulseTile[];
  quiet: PulseTile[];
};

/**
 * The mobile board is a decision surface, not a feed inventory. Keep genuine
 * situations in front; move absences and integration health into one
 * disclosure. A degraded source can never promote itself by also carrying an
 * old `active` flag.
 *
 * The split between `readings` and `quiet` is measurement versus absence,
 * not fine versus wrong. The county's ambient numbers (weather, air, rivers,
 * drive times) render open on every visit, because hiding them behind a
 * "sources are quiet" strip meant the best-composed facts on the page were
 * two taps deep precisely when nothing was wrong — which is most days. Tiles
 * whose quiet state is an absence ("No major outage", "No open reports") and
 * feeds that did not answer are what the disclosure is FOR.
 */
export function pulseDisplayGroups(
  tiles: PulseTile[],
  {
    leadKey,
    summarizedKeys = new Set<string>(),
  }: {
    leadKey?: string;
    summarizedKeys?: ReadonlySet<string>;
  } = {},
): PulseDisplayGroups {
  const attention: PulseTile[] = [];
  const actionable: PulseTile[] = [];
  const readings: PulseTile[] = [];
  const quiet: PulseTile[] = [];

  for (const tile of tiles) {
    if (tile.key === leadKey || summarizedKeys.has(tile.key)) continue;
    const state = pulseTileState(tile);
    if (state === "Attention") attention.push(tile);
    else if (state === "Active") actionable.push(tile);
    // Only a CURRENT reading earns the open board. A reading-flagged tile in
    // any degraded state has no number to show, and a live one is already in
    // the groups above.
    else if (tile.reading && state === "Current") readings.push(tile);
    else quiet.push(tile);
  }

  return { attention, actionable, readings, quiet };
}

/**
 * Do not describe a previously active item as cleared when its source simply
 * stopped answering. A clear message is only earned by a current, quiet
 * reading.
 */
export function pulseClearedKeys(
  previousActive: Record<string, string>,
  tiles: PulseTile[],
): string[] {
  const currentActiveKeys = new Set(
    tiles
      .filter(
        (tile) =>
          tile.attention &&
          pulseTileState(tile) !== "Feed unavailable" &&
          pulseTileState(tile) !== "Not connected",
      )
      .map((tile) => tile.key),
  );
  const unknownKeys = new Set(
    tiles
      .filter((tile) => {
        const state = pulseTileState(tile);
        return state === "Feed unavailable" || state === "Not connected";
      })
      .map((tile) => tile.key),
  );
  return Object.keys(previousActive).filter(
    (key) => !currentActiveKeys.has(key) && !unknownKeys.has(key),
  );
}

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

export function AlertDataPanel({
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
        <span className="text-caption max-w-[44%] text-right font-medium" style={{ color: "var(--app-ink-3)" }}>
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
            <dt className="text-caption font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              {fact.label}
            </dt>
            <dd
              className={`${index === 0 ? "text-[17px] " : "text-[12px] "}mt-1 break-words font-semibold leading-tight tabular-nums`}
              style={{ color: index === 0 ? color : "var(--app-ink)" }}
            >
              {fact.value}
            </dd>
            {fact.detail ? (
              <dd className="text-caption mt-0.5 break-words" style={{ color: "var(--app-ink-3)" }}>
                {fact.detail}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
        {meta ? (
          <p className="text-caption flex min-w-0 items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
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
        tiles
          .filter((tile) => tile.attention && !tile.degraded)
          .map((tile) => [tile.key, tile.countLabel]),
      );
      let previous: Snapshot | null = null;
      try {
        previous = JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) ?? "null") as Snapshot | null;
      } catch {
        previous = null;
      }

      if (previous?.at) {
        const added = Object.keys(current).filter((key) => previous?.active[key] !== current[key]);
        const cleared = pulseClearedKeys(previous.active, tiles);
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

function formatGaugeValue(tile: PulseTile): string {
  const gauge = tile.gauge;
  if (!gauge || !Number.isFinite(gauge.value)) return "N/A";
  const decimals = gauge.decimals ?? 0;
  if (gauge.comma) {
    return gauge.value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return gauge.value.toFixed(decimals);
}

function pulseTileReading(tile: PulseTile): string {
  if (tile.feature) {
    return [
      `${tile.feature.temp} degrees`,
      tile.feature.condition,
      tile.feature.hl,
    ].filter(Boolean).join(", ");
  }
  if (tile.gauge) {
    return `${formatGaugeValue(tile)} ${tile.gauge.unit}. ${tile.countLabel}`;
  }
  return [tile.countLabel, tile.peek].filter(Boolean).join(". ");
}

/** A seated instrument key: the information changes shape by data kind, but
 * the entire surface remains one predictable button into the existing drawer. */
function PulseSmartBlock({
  tile,
  onOpen,
  index,
  bankKey,
}: {
  tile: PulseTile;
  onOpen: () => void;
  index: number;
  bankKey: string;
}) {
  const state = pulseTileState(tile);
  const unavailable = state === "Feed unavailable";
  const keyColor = unavailable ? "var(--app-warning)" : tile.accent;
  const stateColor =
    state === "Current" ? "var(--app-ink-3)" : keyColor;
  const accessibleReading = unavailable
    ? "Latest reading unavailable"
    : pulseTileReading(tile);
  const gaugeValue = formatGaugeValue(tile);
  const gaugePct = Math.max(0, Math.min(100, tile.gauge?.pct ?? 0));

  return (
    <li
      data-pulse-bank-item={bankKey}
      className={`min-w-0${tile.kind === "feature" ? " col-span-2 sm:col-span-1" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        data-pulse-key={tile.key}
        aria-haspopup="dialog"
        aria-label={`${tile.label}: ${accessibleReading}. ${state}. Source: ${tile.sourceLabel}`}
        className="fr-pulse-key fr-pulse-seat group relative flex min-h-[140px] w-full min-w-0 flex-col overflow-hidden rounded-[var(--app-radius-md)] border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2"
        style={{
          borderColor: unavailable
            ? "color-mix(in srgb, var(--app-warning) 38%, var(--app-border))"
            : "var(--app-border)",
          background: `linear-gradient(160deg, color-mix(in srgb, ${keyColor} 7%, var(--app-bg-elevated-solid)) 0%, var(--app-bg-elevated-solid) 48%, color-mix(in srgb, var(--app-bg-sunken) 52%, var(--app-bg-elevated-solid)) 100%)`,
          animationDelay: `${Math.min(index, 8) * 38}ms`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(105% 82% at 0% 0%, ${keyColor} 0%, transparent 72%)`,
            opacity: state === "Current" ? 0.1 : 0.18,
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: keyColor, opacity: unavailable ? 1 : 0.82 }}
        />

        <span className="relative flex w-full min-w-0 items-center justify-between gap-2">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border"
            style={{
              borderColor: `color-mix(in srgb, ${keyColor} 20%, var(--app-border))`,
              color: keyColor,
              background: `color-mix(in srgb, ${keyColor} 10%, var(--app-bg-elevated-solid))`,
            }}
          >
            {createElement(iconFor(tile), {
              className: "h-4 w-4",
              strokeWidth: 2.15,
            })}
          </span>
          {/* "Current" is the neutral state and stays unwritten on the face:
              stamping it on every calm tile turned the quiet grid into a wall
              of CURRENT. Every OTHER state still prints beside its color (the
              written-state rule exists so a non-neutral state never relies on
              tint alone), and the aria-label above always carries the state
              for assistive tech. */}
          {state !== "Current" && (
            <span
              className="min-w-0 truncate text-[8.5px] font-bold uppercase tracking-[0.105em]"
              style={{ color: stateColor }}
            >
              {state}
            </span>
          )}
        </span>

        {unavailable ? (
          <span className="relative mt-3 block min-w-0 flex-1">
            <span
              className="block text-[15px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Latest reading unavailable
            </span>
            <span
              className="mt-1.5 block text-[10px] leading-snug"
              style={{ color: "var(--app-warning)" }}
            >
              Open the source details for context.
            </span>
          </span>
        ) : tile.feature ? (
          <span className="relative mt-3 flex min-w-0 flex-1 items-end gap-3">
            <span
              className="shrink-0 font-sans text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {tile.feature.temp}°
            </span>
            <span className="min-w-0 pb-0.5">
              <span
                className="block line-clamp-2 text-[12px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {tile.feature.condition}
              </span>
              {tile.feature.hl ? (
                <span
                  className="mt-1 block truncate font-mono text-[9.5px] tabular-nums"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {tile.feature.hl}
                </span>
              ) : null}
            </span>
          </span>
        ) : tile.gauge ? (
          <span className="relative mt-3 flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden
              className="relative grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(${keyColor} ${gaugePct}%, color-mix(in srgb, var(--app-border) 72%, transparent) 0)`,
              }}
            >
              <span
                className="absolute inset-[4px] rounded-full"
                style={{ background: "var(--app-bg-elevated-solid)" }}
              />
              <span
                className={`relative z-10 font-mono font-semibold leading-none tabular-nums${tile.gauge.comma ? " text-[17px]" : " text-[21px]"}`}
                style={{ color: "var(--app-ink)" }}
              >
                {gaugeValue}
              </span>
            </span>
            <span className="min-w-0">
              <span
                className="block line-clamp-2 text-[10px] font-medium leading-tight"
                style={{ color: "var(--app-ink-2)" }}
              >
                {tile.gauge.unit}
              </span>
              <span
                className="mt-1 block line-clamp-2 text-[10px] leading-tight"
                style={{ color: unavailable ? "var(--app-warning)" : "var(--app-ink-3)" }}
              >
                {tile.countLabel}
              </span>
            </span>
          </span>
        ) : (
          <span className="relative mt-3 block min-w-0 flex-1">
            <span
              className="block line-clamp-2 text-[15px] font-semibold leading-[1.18] tracking-[-0.01em]"
              style={{ color: "var(--app-ink)" }}
            >
              {tile.countLabel}
            </span>
            {tile.peek && tile.peek !== tile.countLabel ? (
              <span
                className="mt-1.5 block line-clamp-2 text-[10px] leading-snug"
                style={{ color: unavailable ? "var(--app-warning)" : "var(--app-ink-3)" }}
              >
                {tile.peek}
              </span>
            ) : null}
          </span>
        )}

        <span
          className="relative mt-2.5 block w-full min-w-0 border-t pt-2"
          style={{ borderColor: "color-mix(in srgb, var(--app-border) 74%, transparent)" }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="min-w-0 flex-1 truncate text-[11px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              {tile.label}
            </span>
            <ArrowRight
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5"
            />
          </span>
          <span
            className="mt-0.5 block truncate text-[8.5px]"
            style={{ color: "var(--app-ink-3)" }}
            title={tile.sourceLabel}
          >
            Source · {tile.sourceLabel}
          </span>
        </span>
      </button>
    </li>
  );
}

/** "Power out, 311 reports, and Schools" — names, so the closed strip says
 *  what it holds instead of how many things it holds. */
export function nameListSentence(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** A missing source is not an all-clear. The disclosure headline carries that
 *  distinction even before a visitor expands the individual checks. */
export function secondarySignalsHeadline(
  partialCount: number,
  unavailableCount: number,
): string {
  if (unavailableCount > 0) return "Some checks are unavailable";
  if (partialCount > 0) return "Some checks are incomplete";
  return "Nothing reported";
}

function SecondarySignals({
  updates,
  onOpen,
}: {
  updates: PulseTile[];
  onOpen: (key: string) => void;
}) {
  if (updates.length === 0) return null;
  const partial = updates.filter(
    (tile) => pulseTileState(tile) === "Partial data",
  );
  const unavailable = updates.filter((tile) => {
    const state = pulseTileState(tile);
    return state === "Feed unavailable" || state === "Not connected";
  });
  const degraded = [...partial, ...unavailable];
  const quiet = updates.filter((tile) => !degraded.includes(tile));

  // Names, not a count. "12 sources are quiet" made a reader open the strip
  // just to learn whether the thing they cared about was in it; naming the
  // sources answers that from the closed state. The set is short by
  // construction now that the ambient readings live on the open board.
  const quietSentence =
    quiet.length > 0
      ? `${nameListSentence(quiet.map((tile) => tile.label))} ${quiet.length === 1 ? "is" : "are"} quiet.`
      : null;
  const partialSentence =
    partial.length > 0
      ? `${nameListSentence(partial.map((tile) => tile.label))} returned partial data.`
      : null;
  const unavailableSentence =
    unavailable.length > 0
      ? `${nameListSentence(unavailable.map((tile) => tile.label))} could not be checked right now.`
      : null;

  return (
    <section aria-labelledby="pulse-secondary-heading" className="min-w-0">
      <details
        className="group overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-bg-elevated-solid) 54%, transparent)",
        }}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]">
          {degraded.length > 0 ? (
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
              {secondarySignalsHeadline(partial.length, unavailable.length)}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {[quietSentence, partialSentence, unavailableSentence]
                .filter(Boolean)
                .join(" ")}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 opacity-50 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="border-t p-3" style={{ borderColor: "var(--app-border)" }}>
          <ul
            id="pulse-local-updates"
            data-pulse-bank="local-pulse"
            className="grid min-w-0 grid-flow-dense grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          >
            {updates.map((tile, index) => (
              <PulseSmartBlock
                key={tile.key}
                tile={tile}
                bankKey="local-pulse"
                index={index}
                onOpen={() => onOpen(tile.key)}
              />
            ))}
          </ul>
        </div>
      </details>
    </section>
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
        <span className="mt-1 block truncate text-[9px]" style={{ color: "var(--app-ink-3)" }}>
          Source · {tile.sourceLabel}
        </span>
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
  const pushedOpen = useRef(false);

  const current = tiles.find((tile) => tile.key === open) ?? null;
  const lead = hero.leadKey ? tiles.find((tile) => tile.key === hero.leadKey) : null;

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
  // Structured metric panels help for weather, air, traffic, and similar
  // readings. Official-alert and police leads already carry their essential
  // facts in the alert ledger, so repeating them here creates two competing
  // explanations for the same situation.
  const leadUsesMetricPanel = Boolean(
    lead &&
    lead.key !== "alerts" &&
    lead.key !== "police",
  );
  const showAlertData =
    !hero.allClear &&
    leadUsesMetricPanel &&
    heroFacts.length > 0;
  const attentionChips = pulseAttentionChips(chips, {
    allClear: hero.allClear,
    showAlertData,
    leadKey: hero.leadKey,
  });
  const summarizedKeys = new Set(
    attentionChips
      .map((chip) => chip.key)
      .filter((key): key is string => Boolean(key)),
  );
  const displayGroups = pulseDisplayGroups(tiles, {
    leadKey: hero.leadKey,
    summarizedKeys,
  });
  const attention = displayGroups.attention;
  const quietSignals = displayGroups.quiet;
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

        {displayGroups.actionable.length > 0 && (
          <section aria-labelledby="pulse-live-board-heading" className="min-w-0 space-y-2.5">
            <GroupHeading
              id="pulse-live-board-heading"
              title="Active right now"
              note={`${displayGroups.actionable.length} ${displayGroups.actionable.length === 1 ? "live signal" : "live signals"}`}
            />
            <div
              className="overflow-hidden rounded-[var(--app-radius-md)] border px-1"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated-solid)",
              }}
            >
              {displayGroups.actionable.map((tile) => (
                <AttentionTile key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />
              ))}
            </div>
          </section>
        )}

        {displayGroups.readings.length > 0 && (
          <section aria-labelledby="pulse-readings-heading" className="min-w-0 space-y-2.5">
            <GroupHeading id="pulse-readings-heading" title="Current conditions" />
            <ul
              data-pulse-bank="readings"
              className="grid min-w-0 grid-flow-dense grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
            >
              {displayGroups.readings.map((tile, index) => (
                <PulseSmartBlock
                  key={tile.key}
                  tile={tile}
                  bankKey="readings"
                  index={index}
                  onOpen={() => openTile(tile.key)}
                />
              ))}
            </ul>
          </section>
        )}

        <SecondarySignals updates={quietSignals} onOpen={openTile} />
      </div>

      <style>{`
        .fr-pulse-key {
          isolation: isolate;
          transition: box-shadow 160ms ease, transform 160ms ease, border-color 160ms ease;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.78),
            inset 0 -1px 0 rgba(34,28,21,0.055),
            0 1px 2px rgba(34,28,21,0.055),
            0 8px 18px -15px rgba(34,28,21,0.42);
        }
        .fr-pulse-key:active {
          transform: translateY(1px) scale(0.985);
          box-shadow:
            inset 0 1px 2px rgba(34,28,21,0.08),
            0 1px 2px rgba(34,28,21,0.05);
        }
        @media (hover: hover) {
          .fr-pulse-key:hover {
            transform: translateY(-1.5px);
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.88),
              inset 0 -1px 0 rgba(34,28,21,0.05),
              0 2px 4px rgba(34,28,21,0.07),
              0 16px 28px -18px rgba(34,28,21,0.48);
          }
        }
        .fr-pulse-seat {
          animation: fr-pulse-seat 420ms cubic-bezier(.2,.8,.3,1) both;
        }
        @keyframes fr-pulse-seat {
          from { opacity: 0; transform: translateY(7px) scale(0.975); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fr-pulse-key,
          .fr-pulse-key * {
            animation: none !important;
            transition: none !important;
          }
          .fr-pulse-key:active,
          .fr-pulse-key:hover {
            transform: none;
          }
        }
      `}</style>

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
