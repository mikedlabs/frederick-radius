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
  ShieldCheck,
  Siren,
  Sparkles,
  TrafficCone,
  TrainFront,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import PulseFreshness from "@/components/pulse/PulseFreshness";

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
};

const CHIP_TONE: Record<PulseHeroChip["tone"], string> = {
  danger: "var(--app-danger)",
  warning: "var(--app-warning)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

export type PulseHero = {
  allClear: boolean;
  degraded?: boolean;
  line: string;
  sub: string;
  renderedAt: number;
  refreshedClock: string;
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
  eyebrow: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--app-ink-3)" }}>
        {eyebrow}
      </p>
      <div className="mt-0.5 flex min-w-0 items-end justify-between gap-3">
        <h2 id={id} className="min-w-0 break-words font-serif text-[23px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        {note && <span className="max-w-[45%] shrink pb-0.5 text-right text-[11px] leading-tight [overflow-wrap:anywhere]" style={{ color: "var(--app-ink-3)" }}>{note}</span>}
      </div>
    </div>
  );
}

function HeroFacts({ chips, onOpen, dark = false }: { chips: PulseHeroChip[]; onOpen: (key: string) => void; dark?: boolean }) {
  if (chips.length === 0) return null;
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
  const [message, setMessage] = useState("Checking what changed…");

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

      if (!previous?.at) {
        setMessage("First check on this device. We’ll remember today’s snapshot for next time.");
      } else {
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
        } else {
          setMessage(`No new urgent changes since ${timeSince(previous.at)}.`);
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

  return (
    <div className="flex min-w-0 items-start gap-2.5 border-y px-1 py-3" style={{ borderColor: "var(--app-border-strong)" }}>
      <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-2)" }}>Since your last look</p>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{message}</p>
      </div>
    </div>
  );
}

function SystemsLedger({ tiles, onOpen }: { tiles: PulseTile[]; onOpen: (key: string) => void }) {
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="pulse-systems-heading" className="min-w-0 border-y py-3" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex min-w-0 items-center gap-2">
        <ShieldCheck aria-hidden className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} />
        <h2 id="pulse-systems-heading" className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Steady systems</h2>
        <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>checked live</span>
      </div>
      <ul className="mt-2.5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0">
            <button type="button" onClick={() => onOpen(tile.key)} className="flex min-h-11 min-w-0 w-full items-center gap-1.5 text-left text-[11.5px] font-medium" style={{ color: "var(--app-ink-2)" }}>
              <Check aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: "var(--app-brand-2)" }} />
              <span className="truncate">{tile.label}</span>
            </button>
          </li>
        ))}
      </ul>
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
  const HeroIcon = hero.allClear ? ShieldCheck : degraded ? AlertTriangle : Siren;

  return (
    <>
      <header className="relative -mx-4 -mt-6 overflow-hidden border-y border-white/10 bg-[#15130f] px-5 pb-7 pt-8 text-[#f7f0e4] sm:-mx-5 sm:px-8 sm:pb-9 sm:pt-10 lg:mx-0 lg:mt-0 lg:rounded-[8px] lg:border lg:px-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/6" aria-hidden>
          <span className="absolute inset-10 rounded-full border border-white/6" />
          <span className="absolute inset-[5rem] rounded-full" style={{ border: `1px solid color-mix(in srgb, ${heroColor} 38%, transparent)` }} />
          <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: heroColor, boxShadow: `0 0 0 9px color-mix(in srgb, ${heroColor} 13%, transparent)` }} />
        </div>
        <div className="max-w-[42rem]">
          <div className="relative flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-white/45">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: heroColor }} />
            Frederick County · live
            <PulseFreshness renderedAt={hero.renderedAt} />
          </div>
          <div className="mt-3 flex items-start gap-3">
            <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: heroColor, background: `color-mix(in srgb, ${heroColor} 18%, transparent)` }}>
              <HeroIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
          <h1 className="max-w-[34rem] font-serif text-[clamp(2.25rem,10vw,4.4rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-balance text-[#f7f0e4]">
            {hero.line}
          </h1>
          <p className="mt-3 max-w-[36rem] text-[13px] leading-relaxed text-white/62">{hero.sub}</p>
          {hero.leadMeta && <p className="mt-2 flex w-fit items-center gap-1.5 text-[11px] font-medium text-white/62"><Clock aria-hidden className="h-3.5 w-3.5" />{hero.leadMeta}</p>}
          {lead && (
            <div className="mt-3">
              <button type="button" onClick={() => openTile(lead.key)} className="inline-flex min-h-11 items-center gap-1.5 border-b text-[12px] font-semibold text-white transition active:opacity-70" style={{ borderColor: heroColor }}>
                {hero.actionLabel ?? "See what this means"}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
            </div>
          </div>
          <div className="mt-5"><HeroFacts chips={chips} onOpen={openTile} dark /></div>
          <p className="mt-2 flex items-center gap-1.5 text-[9px] text-white/62"><Clock aria-hidden className="h-3 w-3" /> Updated {hero.refreshedClock} · refreshes automatically</p>
        </div>
      </header>

      {breaking}

      <SinceLastLook tiles={tiles} />

      <div className="grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-10">
        <div className="min-w-0 space-y-7">
          {attention.length > 0 && (
            <section aria-labelledby="pulse-attention-heading" className="min-w-0 space-y-2.5">
              <GroupHeading id="pulse-attention-heading" eyebrow="Needs attention" title="Happening now" note={`${attention.length} live`} />
              <div className="min-w-0 border-l-[3px] px-4" style={{ borderColor: "var(--app-danger)", background: "var(--app-bg-elevated)" }}>
                <ul className="min-w-0">{attention.map((tile) => <UpdateRow key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}</ul>
              </div>
            </section>
          )}

          <section aria-labelledby="pulse-live-board-heading" className="min-w-0 space-y-2.5">
            <GroupHeading id="pulse-live-board-heading" eyebrow="At a glance" title="Live board" note="tap any row" />
            <div className="min-w-0 border-y px-1" style={{ borderColor: "var(--app-border)" }}>
              <ul className="min-w-0">{[...conditions, ...gettingAround].map((tile) => <UpdateRow key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}</ul>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-7">
          <SystemsLedger tiles={steady} onOpen={openTile} />

          {localUpdates.length > 0 && (
            <section aria-labelledby="pulse-updates-heading" className="min-w-0 space-y-2.5">
              <GroupHeading id="pulse-updates-heading" eyebrow="Around Frederick" title="Local updates" />
              <div className="min-w-0 border-y px-1" style={{ borderColor: "var(--app-border)" }}>
                <ul className="min-w-0">{visibleUpdates.map((tile) => <UpdateRow key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}</ul>
                {localUpdates.length > 4 && (
                  <button type="button" onClick={() => setShowAllUpdates((value) => !value)} className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                    {showAllUpdates ? "Show fewer updates" : `${localUpdates.length - 4} more local signals`}
                    <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform${showAllUpdates ? " rotate-180" : ""}`} />
                  </button>
                )}
              </div>
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
