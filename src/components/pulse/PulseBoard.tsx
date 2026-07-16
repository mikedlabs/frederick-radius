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
import { formatGaugeNumber } from "@/components/pulse/format";

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
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--app-ink-3)" }}>
        {eyebrow}
      </p>
      <div className="mt-0.5 flex items-end justify-between gap-3">
        <h2 id={id} className="font-serif text-[23px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        {note && <span className="pb-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{note}</span>}
      </div>
    </div>
  );
}

function HeroFacts({ chips, onOpen }: { chips: PulseHeroChip[]; onOpen: (key: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
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
                className="flex min-h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-[11.5px] font-medium"
                style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "inherit" }}
              >
                {content}
              </button>
            ) : (
              <span className="flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-[11.5px] font-medium" style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)" }}>
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
    <div className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-3" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
      <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-2)" }}>Since your last look</p>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{message}</p>
      </div>
    </div>
  );
}

function AttentionCard({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group w-full overflow-hidden rounded-[var(--app-radius-lg)] border text-left transition active:scale-[0.995]"
      style={{
        borderColor: `color-mix(in srgb, ${tile.accent} 42%, var(--app-border))`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${tile.accent} 10%, var(--app-bg-elevated)), var(--app-bg-elevated))`,
        boxShadow: "var(--app-elev-1), var(--app-edge)",
      }}
    >
      <span aria-hidden className="block h-[3px] w-full" style={{ background: tile.accent }} />
      <span className="flex items-start gap-3 p-4">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 13%, transparent)` }}>
          {createElement(iconFor(tile), { className: "h-[18px] w-[18px]", strokeWidth: 2.1 })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{tile.label}</span>
          <span className="mt-0.5 block font-serif text-[19px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{tile.countLabel}</span>
          {tile.peek && <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{tile.peek}</span>}
          <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: tile.accent }}>
            What this means <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </span>
    </button>
  );
}

function WeatherCard({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  const feature = tile.feature!;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group flex min-h-[126px] w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--app-radius-lg)] border p-4 text-left transition active:scale-[0.995]"
      style={{
        borderColor: "color-mix(in srgb, var(--app-cool) 32%, var(--app-border))",
        background: "radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--app-cool) 20%, transparent), transparent 48%), var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Right now · Frederick</span>
        <span className="mt-1 block text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>{feature.condition}</span>
        {feature.hl && <span className="mt-1 block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>{feature.hl}</span>}
        <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--app-cool)" }}>
          Hourly & 7-day <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
      <span className="shrink-0 font-serif text-[56px] font-light leading-none tabular-nums tracking-[-0.06em]" style={{ color: "var(--app-ink)" }}>{feature.temp}°</span>
    </button>
  );
}

function SignalCard({ tile, onOpen }: { tile: PulseTile; onOpen: () => void }) {
  const reading = tile.gauge
    ? `${formatGaugeNumber(tile.gauge.value, tile.gauge)} ${tile.gauge.unit}`
    : tile.countLabel;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${tile.label}: ${tile.countLabel}. Open details.`}
      className="group flex min-h-[92px] w-full flex-col rounded-[var(--app-radius-md)] border p-3.5 text-left transition active:scale-[0.99]"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <span className="flex items-center gap-2">
        {createElement(iconFor(tile), { "aria-hidden": true, className: "h-4 w-4 shrink-0", strokeWidth: 2, style: { color: tile.accent } })}
        <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--app-ink-3)" }}>{tile.label}</span>
        <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-35 transition group-hover:translate-x-0.5" />
      </span>
      <span className="mt-2 block text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{reading}</span>
      {tile.peek && <span className="mt-auto line-clamp-2 pt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{tile.peek}</span>}
    </button>
  );
}

function SystemsLedger({ tiles, onOpen }: { tiles: PulseTile[]; onOpen: (key: string) => void }) {
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="pulse-systems-heading" className="rounded-[var(--app-radius-lg)] border px-4 py-3.5" style={{ borderColor: "color-mix(in srgb, var(--app-positive) 30%, var(--app-border))", background: "color-mix(in srgb, var(--app-positive) 5%, var(--app-bg-elevated))" }}>
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-positive)" }} />
        <h2 id="pulse-systems-heading" className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Steady systems</h2>
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>checked live</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <button type="button" onClick={() => onOpen(tile.key)} className="flex min-h-8 w-full items-center gap-1.5 text-left text-[11.5px] font-medium" style={{ color: "var(--app-ink-2)" }}>
              <Check aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: "var(--app-positive)" }} />
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
    <li>
      <button type="button" onClick={onOpen} className="group flex min-h-[58px] w-full items-center gap-3 border-b py-2.5 text-left last:border-b-0" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 10%, transparent)` }}>
          {createElement(iconFor(tile), { className: "h-4 w-4", strokeWidth: 2 })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{tile.label}</span>
          <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{tile.peek ?? tile.countLabel}</span>
        </span>
        <span className="shrink-0 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{tile.peek ? tile.countLabel : ""}</span>
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
  const active = !hero.allClear && !degraded;
  const heroColor = hero.allClear ? "var(--app-positive)" : degraded ? "var(--app-warning)" : "var(--app-danger)";
  const HeroIcon = hero.allClear ? ShieldCheck : degraded ? AlertTriangle : Siren;

  return (
    <>
      <header
        className="relative overflow-hidden rounded-[24px] border px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6"
        style={{
          borderColor: active ? "color-mix(in srgb, var(--app-danger) 62%, black)" : "color-mix(in srgb, var(--app-brand-2) 68%, black)",
          background: active
            ? "radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--app-danger) 42%, transparent), transparent 42%), linear-gradient(145deg, var(--app-brand-2), color-mix(in srgb, var(--app-brand-2) 78%, var(--app-bedrock)))"
            : "radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--app-positive) 35%, transparent), transparent 42%), linear-gradient(145deg, var(--app-brand-2), color-mix(in srgb, var(--app-brand-2) 78%, var(--app-bedrock)))",
          boxShadow: "var(--app-elev-2), var(--app-edge)",
          color: "var(--app-ink-inverse)",
        }}
      >
        <div aria-hidden className="absolute -right-8 -top-8 grid h-36 w-36 place-items-center rounded-full border opacity-[0.12]" style={{ borderColor: "currentColor" }}>
          <div className="grid h-20 w-20 place-items-center rounded-full border" style={{ borderColor: "currentColor" }}>
            <HeroIcon className="h-9 w-9" strokeWidth={1.25} />
          </div>
        </div>
        <div className="relative max-w-[36rem]">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] opacity-75">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: heroColor }} />
            County pulse
            <PulseFreshness renderedAt={hero.renderedAt} />
          </div>
          <h1 className="mt-3 max-w-[30rem] font-serif text-[32px] font-semibold leading-[0.98] tracking-[-0.035em] text-balance sm:text-[42px]">
            {hero.line}
          </h1>
          <p className="mt-3 max-w-[32rem] text-[13.5px] leading-relaxed opacity-80 sm:text-[14px]">{hero.sub}</p>
          {hero.leadMeta && <p className="mt-2 flex w-fit items-center gap-1.5 text-[11.5px] font-medium opacity-70"><Clock aria-hidden className="h-3.5 w-3.5" />{hero.leadMeta}</p>}
          {lead && (
            <div className="mt-4">
              <button type="button" onClick={() => openTile(lead.key)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition active:scale-[0.99]" style={{ background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "0 10px 24px -16px rgba(0,0,0,0.75)" }}>
                {hero.actionLabel ?? "See what this means"}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="mt-4"><HeroFacts chips={chips} onOpen={openTile} /></div>
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-[10.5px] opacity-60" style={{ borderColor: "rgba(255,255,255,0.16)" }}>
            <Clock aria-hidden className="h-3 w-3" /> Refreshed {hero.refreshedClock} · automatic every couple of minutes
          </p>
        </div>
      </header>

      {breaking}

      <SinceLastLook tiles={tiles} />

      {attention.length > 0 && (
        <section aria-labelledby="pulse-attention-heading" className="space-y-3">
          <GroupHeading id="pulse-attention-heading" eyebrow="Needs attention" title="Also happening now" note={`${attention.length} live`} />
          <div className="space-y-2.5">
            {attention.map((tile) => <AttentionCard key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}
          </div>
        </section>
      )}

      <SystemsLedger tiles={steady} onOpen={openTile} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-8">
        <section aria-labelledby="pulse-move-heading" className="space-y-3">
          <GroupHeading id="pulse-move-heading" eyebrow="Plan your day" title="Getting around" />
          {gettingAround.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {/* An odd count leaves a lone tile beside an empty cell; the
                  last one takes the full row (same rule as /today's grid). */}
              {gettingAround.map((tile, i) => (
                <div
                  key={tile.key}
                  className={`flex${gettingAround.length % 2 === 1 && i === gettingAround.length - 1 ? " col-span-2" : ""}`}
                >
                  <SignalCard tile={tile} onOpen={() => openTile(tile.key)} />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>Transportation feeds are briefly quiet.</p>
          )}
        </section>

        <section aria-labelledby="pulse-conditions-heading" className="space-y-3">
          <GroupHeading id="pulse-conditions-heading" eyebrow="Outside right now" title="County conditions" />
          <div className="space-y-2.5">
            {conditions.map((tile) => tile.kind === "feature"
              ? <WeatherCard key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />
              : <SignalCard key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}
          </div>
        </section>
      </div>

      {localUpdates.length > 0 && (
        <section aria-labelledby="pulse-updates-heading" className="space-y-3">
          <GroupHeading id="pulse-updates-heading" eyebrow="Around Frederick" title="Local updates" />
          <div className="rounded-[var(--app-radius-lg)] border px-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-edge)" }}>
            <ul>{visibleUpdates.map((tile) => <UpdateRow key={tile.key} tile={tile} onOpen={() => openTile(tile.key)} />)}</ul>
            {localUpdates.length > 4 && (
              <button type="button" onClick={() => setShowAllUpdates((value) => !value)} className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                {showAllUpdates ? "Show fewer updates" : `${localUpdates.length - 4} more local signals`}
                <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform${showAllUpdates ? " rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </section>
      )}

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
