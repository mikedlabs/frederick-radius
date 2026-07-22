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
  line: string;
  sub: string;
  renderedAt: number;
  /** The lead situation is fully explained in the hero, so it is not repeated below. */
  leadKey?: string;
  leadMeta?: string;
  actionLabel?: string;
};

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
  eyebrow,
  title,
  note,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      {eyebrow ? (
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--app-brand-press)" }}>
          <span aria-hidden className="inline-block h-2.5 w-[3px] rounded-full" style={{ background: "var(--app-brand)" }} />
          {eyebrow}
        </p>
      ) : null}
      <div className={`${eyebrow ? "mt-1 " : ""}flex min-w-0 items-end justify-between gap-3`}>
        <h2 id={id} className="min-w-0 break-words font-serif text-[25px] font-semibold leading-[1.05] tracking-[-0.025em]" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        {note && <span className="max-w-[45%] shrink pb-0.5 text-right text-[11px] leading-tight [overflow-wrap:anywhere]" style={{ color: "var(--app-ink-3)" }}>{note}</span>}
      </div>
    </div>
  );
}

/**
 * The under-hero readout. Two modes, so the eye never has to sort good news
 * from bad inside one grid (owner: "can alerts be more clear"):
 *   - Anything live (a danger/warning chip present) → an Active alerts LEDGER:
 *     one bordered row per live situation, a 3px severity bar in its tone, an
 *     Public Sans title, and a tabular "<severity word> · <clock>" meta. Positive
 *     "No X reported" chips are dropped here — a live board shows only what's
 *     live. Tapping a row opens that tile's drawer.
 *   - All clear → the calm fact grid (the positive/informational chips).
 */
function AlertLedgerRow({ chip, onOpen, last }: { chip: PulseHeroChip; onOpen: (key: string) => void; last: boolean }) {
  const color = CHIP_TONE[chip.tone];
  const meta = [TONE_WORD[chip.tone], chip.meta].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 py-2">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{chip.label}</span>
        <span className="mt-0.5 block truncate font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>{meta}</span>
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

function HeroFacts({ chips, onOpen, dark = false }: { chips: PulseHeroChip[]; onOpen: (key: string) => void; dark?: boolean }) {
  if (chips.length === 0) return null;
  const hasLive = chips.some((chip) => chip.tone === "danger" || chip.tone === "warning");

  if (hasLive) {
    // Only live situations; positives never sit next to a real alert.
    const rows = chips.filter((chip) => chip.tone !== "positive").slice(0, 4);
    return (
      <ul className="overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
        {rows.map((chip, index) => (
          <AlertLedgerRow key={`${chip.key ?? "row"}-${index}`} chip={chip} onOpen={onOpen} last={index === rows.length - 1} />
        ))}
      </ul>
    );
  }

  // All clear: the calm fact grid (positive + informational).
  return (
    <ul className="grid border-y sm:grid-cols-2" style={{ borderColor: dark ? "rgba(255,255,255,.12)" : "var(--app-border)" }}>
      {chips.slice(0, 4).map((chip, index) => {
        const color = CHIP_TONE[chip.tone];
        const content = (
          <>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="min-w-0 flex-1 truncate">{chip.label}</span>
            {chip.key && <ArrowRight aria-hidden className="h-3 w-3 shrink-0 opacity-50" />}
          </>
        );
        return (
          <li key={`${chip.key ?? "fact"}-${index}`}>
            {chip.key ? (
              <button
                type="button"
                onClick={() => onOpen(chip.key!)}
                className="flex min-h-11 w-full items-center gap-2 border-b px-1 text-left text-[11.5px] font-medium sm:odd:border-r"
                style={{ borderColor: dark ? "rgba(255,255,255,.12)" : "var(--app-border)", color: dark ? "rgba(255,255,255,.68)" : "var(--app-ink-2)" }}
              >
                {content}
              </button>
            ) : (
              <span className="flex min-h-11 items-center gap-2 border-b px-1 text-[11.5px] font-medium sm:odd:border-r" style={{ borderColor: dark ? "rgba(255,255,255,.12)" : "var(--app-border)", color: dark ? "rgba(255,255,255,.68)" : "var(--app-ink-2)" }}>
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
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

function SystemsLedger({ tiles, onOpen }: { tiles: PulseTile[]; onOpen: (key: string) => void }) {
  if (tiles.length === 0) return null;
  const degradedCount = tiles.filter((tile) => tile.degraded).length;
  const hasDegraded = degradedCount > 0;
  return (
    <section aria-labelledby="pulse-systems-heading" className="min-w-0">
      <details className="group border-y" style={{ borderColor: "var(--app-border)" }}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]">
          {hasDegraded ? (
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-warning)" }} />
          ) : (
            <Shield aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
          )}
          <span id="pulse-systems-heading" className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Other system checks
          </span>
          <span className="shrink-0 text-[10.5px]" style={{ color: hasDegraded ? "var(--app-warning)" : "var(--app-ink-3)" }}>
            {hasDegraded
              ? `${degradedCount} ${degradedCount === 1 ? "feed needs" : "feeds need"} a refresh`
              : `${tiles.length} checked`}
          </span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-55 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="grid min-w-0 grid-cols-2 gap-x-4 border-t px-1 py-2 sm:grid-cols-4" style={{ borderColor: "var(--app-border)" }}>
          {tiles.map((tile) => {
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
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-warning)" }} />
                  ) : (
                    <Check aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: "var(--app-positive)" }} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-medium" style={{ color: "var(--app-ink-2)" }}>{tile.label}</span>
                    <span className="block truncate text-[10px]" style={{ color: degraded ? "var(--app-warning)" : "var(--app-ink-3)" }}>{tile.countLabel}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
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

/** One instrument reading. The weather reading gets more room, but it stays on
 * the same ruled sheet as the rest of the county signals instead of becoming
 * a separate dashboard card. */
function ConditionReading({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  const f = tile.feature;
  const isFeature = tile.kind === "feature";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-b px-1 text-left transition last:border-b-0 active:bg-black/[0.025]${isFeature ? " min-h-[78px] py-3" : " min-h-[62px] py-2.5"}`}
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center border-l-2"
        style={{
          borderColor: tile.accent,
          color: tile.accent,
          background: `color-mix(in srgb, ${tile.accent} 8%, transparent)`,
        }}
      >
        {createElement(iconFor(tile), { className: "h-4 w-4", strokeWidth: 2 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          {tile.label}
        </span>
        <span className={`block truncate font-semibold${isFeature ? " text-[15px]" : " text-[13.5px]"}`} style={{ color: "var(--app-ink)" }}>
          {f?.condition ?? tile.countLabel}
        </span>
        {f?.hl && <span className="block font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{f.hl}</span>}
      </span>
      <span className="flex items-center gap-2">
        {f && (
          <span className="font-serif text-[34px] font-semibold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
            {f.temp}°
          </span>
        )}
        <ArrowRight aria-hidden className="h-3.5 w-3.5 opacity-30 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

/** An attention tile: a live situation, so it spans the row with its accent on
 *  a left rule and carries the one-line peek the compact stat cards omit. */
function AttentionTile({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group col-span-2 flex items-center gap-3 rounded-[var(--app-radius-md)] border border-l-[3px] px-3.5 py-3 text-left transition active:scale-[0.99]"
      style={{
        borderColor: `color-mix(in srgb, ${tile.accent} 42%, var(--app-border))`,
        borderLeftColor: tile.accent,
        background: `color-mix(in srgb, ${tile.accent} 7%, var(--app-bg-elevated))`,
      }}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 13%, transparent)` }}
      >
        {createElement(iconFor(tile), { className: "h-4 w-4", strokeWidth: 2 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{tile.label}</span>
        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>{tile.peek ?? tile.countLabel}</span>
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
  const heroColor = hero.allClear ? "var(--app-positive)" : degraded ? "var(--app-warning)" : "var(--app-danger)";
  // The status word the masthead prints beside the dateline — typography
  // carries the state, not an icon bubble (owner report, 2026-07-18: the
  // rings + badge read like a status widget, not the front page it fronts).
  const statusWord = hero.allClear ? "Checked" : degraded ? "Watching" : "Active alert";

  return (
    <>
      <header className="-mx-4 -mt-6 border-y border-black/10 bg-[var(--app-bg-elevated-solid)] px-5 pb-7 pt-7 text-[var(--app-ink)] sm:-mx-5 sm:px-8 sm:pb-9 sm:pt-9 lg:mx-0 lg:mt-0 lg:rounded-[8px] lg:border lg:px-10">
        <div className="max-w-[42rem]">
          <div aria-hidden className="mb-3 h-[3px] w-14 rounded-full" style={{ background: heroColor }} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/65">
            <span>Before you leave</span>
            <span aria-hidden className="text-black/30">·</span>
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: heroColor }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: heroColor }} />
              {statusWord}
            </span>
            <PulseFreshness renderedAt={hero.renderedAt} />
          </div>
          <h1 className="mt-3 max-w-[38rem] font-sans text-[clamp(1.8rem,7vw,2.8rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance text-[var(--app-ink)]">
            {hero.line}
          </h1>
          <p className="mt-3 max-w-[36rem] text-[13px] leading-relaxed text-[var(--app-ink-2)]">{hero.sub}</p>
          {hero.leadMeta && <p className="mt-2 flex w-fit items-center gap-1.5 text-[11px] font-medium text-[var(--app-ink-3)]"><Clock aria-hidden className="h-3.5 w-3.5" />{hero.leadMeta}</p>}
          {lead && (
            <div className="mt-3">
              <button type="button" onClick={() => openTile(lead.key)} className="inline-flex min-h-11 items-center gap-1.5 border-b text-[12px] font-semibold text-[var(--app-ink)] transition active:opacity-70" style={{ borderColor: heroColor }}>
                {hero.actionLabel ?? "See what this means"}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {!hero.allClear && chips.length > 0 ? (
            <div className="mt-5"><HeroFacts chips={chips} onOpen={openTile} /></div>
          ) : null}
        </div>
      </header>

      {breaking}

      <SinceLastLook tiles={tiles} />

      <div className="grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-10">
        <div className="min-w-0 space-y-7">
          {attention.length > 0 && (
            <section aria-labelledby="pulse-attention-heading" className="min-w-0 space-y-2.5">
              <GroupHeading id="pulse-attention-heading" eyebrow="Needs attention" title="Happening now" note={`${attention.length} live`} />
              <div className="grid min-w-0 grid-cols-2 gap-2.5">
                {attention.map((tile) => <AttentionTile key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}
              </div>
            </section>
          )}

          {beforeYouGo.length > 0 && (
            <section aria-labelledby="pulse-live-board-heading" className="min-w-0 space-y-2.5">
              <GroupHeading
                id="pulse-live-board-heading"
                eyebrow="Live conditions"
                title="Before you go"
                note="Weather, air, roads and transit"
              />
              <div className="min-w-0 border-y px-1" style={{ borderColor: "var(--app-border-strong)" }}>
                {beforeYouGo.map((tile) => (
                  <ConditionReading key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-7">
          <SystemsLedger tiles={steady} onOpen={openTile} />

          {localUpdates.length > 0 && (
            <section aria-labelledby="pulse-updates-heading" className="min-w-0">
              <details className="group border-y" style={{ borderColor: "var(--app-border)" }}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]">
                  <Newspaper aria-hidden className="h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} />
                  <span id="pulse-updates-heading" className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Local updates
                  </span>
                  <span className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{localUpdates.length} sources</span>
                  <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-55 transition-transform group-open:rotate-180" />
                </summary>
                <div className="min-w-0 border-t px-1" style={{ borderColor: "var(--app-border)" }}>
                  <ul id="pulse-local-updates" className="min-w-0">{visibleUpdates.map((tile) => <UpdateRow key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}</ul>
                  {localUpdates.length > 4 && (
                    <button type="button" onClick={() => setShowAllUpdates((value) => !value)} aria-expanded={showAllUpdates} aria-controls="pulse-local-updates" className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                      {showAllUpdates ? "Show fewer updates" : `${localUpdates.length - 4} more updates`}
                      <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform${showAllUpdates ? " rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              </details>
            </section>
          )}
        </aside>
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
