"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Siren,
  Construction,
  Zap,
  School,
  AlertTriangle,
  CloudAlert,
  Waves,
  Plane,
  CloudSun,
  Newspaper,
  Radio,
  Shield,
  ShieldCheck,
  TrafficCone,
  TrainFront,
  Wind,
  Fish,
  Clock,
  type LucideIcon,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import PulseFreshness from "@/components/pulse/PulseFreshness";
import {
  emptyMessage,
  filterTiles,
  formatGaugeNumber,
  type PulseFilter,
} from "@/components/pulse/format";

/**
 * PulseBoard — the /pulse dashboard as a state-aware bento board.
 *
 * The server page fetches every county feed, races each against a 6s
 * timeout, and hands the results down as serializable tile descriptors +
 * a server-rendered `body` node per feed. This client shell owns only the
 * things a static page cannot do: the count-ups, the conic gauge fills, the
 * incident ticker, the segmented filter, and the tap-to-open bottom sheet.
 *
 * A calm day is a calm board: no ticker, cool/positive gauges resting low,
 * the hero reading "All clear across the county". An active day flips the
 * hero, raises the ticker, tints the live feeds, and the "Needs attention"
 * filter resolves to exactly the feeds the hero is counting.
 */

const ICONS: Record<string, LucideIcon> = {
  Siren,
  Construction,
  Zap,
  School,
  AlertTriangle,
  CloudAlert,
  Waves,
  Plane,
  CloudSun,
  Newspaper,
  Radio,
  Shield,
  TrafficCone,
  TrainFront,
  Wind,
  Fish,
};

export type PulseTicketItem = { tone: "danger" | "warning" | "cool"; text: string };

export type PulseHero = {
  allClear: boolean;
  line: string;
  sub: string;
  /** When the server rendered (feeds fetched) — powers the live "updated Ns". */
  renderedAt: number;
  /** Human refresh clock, formatted server-side ("3:42 PM EDT"). */
  refreshedClock: string;
  /** Current temperature for the compact "now" reading. */
  temp: number | null;
  /** Count of active situations, for the board subtitle. */
  situationCount: number;
};

export type PulseTile = {
  key: string;
  label: string;
  /** Icon name resolved against the local map (keeps the RSC boundary clean). */
  iconName: string;
  /** Named source, shown as the drawer subtitle. */
  sourceLabel: string;
  /** At-a-glance datum, for the tile's accessible label. */
  countLabel: string;
  /** Tone token used for the gauge ring, status dot, and active tint. */
  accent: string;
  /** Feed has live data now — drives the tile tint. */
  active: boolean;
  /** In the hero's situation roll-up — drives the "Needs attention" filter. */
  attention: boolean;
  /** Presentation family. */
  kind: "feature" | "gauge" | "status";
  /** Status tiles: the one-line read under the big value. */
  peek?: string;
  gauge?: { value: number; pct: number; unit: string; decimals?: number; comma?: boolean };
  feature?: { temp: number; condition: string; hl?: string };
  /** The feed's full detail, rendered inside the tapped window. Server-rendered. */
  body: ReactNode;
};

/* ─────────────────────────────────────────────────────────────
 * Animation primitives (respect prefers-reduced-motion)
 * ───────────────────────────────────────────────────────────── */

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A number that counts up from 0 to its value on mount, formatted identically
 *  at every frame. Renders the final value in SSR (suppressHydrationWarning),
 *  so no-JS / reduced-motion rest at the true reading. */
function AnimatedNumber({
  value,
  decimals,
  comma,
  suffix = "",
  className,
  style,
}: {
  value: number;
  decimals?: number;
  comma?: boolean;
  suffix?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const final = formatGaugeNumber(value, { decimals, comma }) + suffix;
    if (prefersReduced()) {
      el.textContent = final;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = formatGaugeNumber(value * e, { decimals, comma }) + suffix;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, decimals, comma, suffix]);
  return (
    <span ref={ref} className={className} style={style} suppressHydrationWarning>
      {formatGaugeNumber(value, { decimals, comma }) + suffix}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Tiles
 * ───────────────────────────────────────────────────────────── */

function tileButtonProps(t: PulseTile, onOpen: () => void) {
  return {
    type: "button" as const,
    onClick: onOpen,
    "aria-haspopup": "dialog" as const,
    "aria-label": `${t.label}: ${t.countLabel}. Tap for detail.`,
  };
}

function FeatureTile({ t, index, onOpen }: { t: PulseTile; index: number; onOpen: () => void }) {
  const f = t.feature!;
  return (
    <button
      {...tileButtonProps(t, onOpen)}
      className="pulse-tile pulse-tile--wx col-span-2 text-left"
      style={{ "--pulse-i": index } as CSSProperties}
    >
      <span className="pulse-tlab">Right now · Frederick</span>
      <div className="mt-1 flex items-baseline gap-3">
        <AnimatedNumber
          value={f.temp}
          suffix="°"
          className="pulse-wx-deg font-serif tabular-nums"
        />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {f.condition}
          </div>
          {f.hl && (
            <div className="font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
              {f.hl}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/** The shared tile class list — the boot-in stagger index, the state accent,
 *  the active tint (`is-hot`), and the alert glow (`is-alert`) for a tile the
 *  hero is counting as a live situation. */
function tileClass(t: PulseTile): string {
  return `pulse-tile pulse-tile--status text-left${t.active ? " is-hot" : ""}${t.attention ? " is-alert" : ""}`;
}
function tileStyle(t: PulseTile, index: number): CSSProperties {
  return { "--accent": t.accent, "--pulse-i": index } as CSSProperties;
}

/** The corner status dot: a quiet breathing "live" beacon on a feed that has
 *  live data now, resting dim on a calm feed. */
function StatusDot({ t }: { t: PulseTile }) {
  return (
    <span
      aria-hidden
      className={`pulse-sdot${t.active ? " is-live" : ""}`}
      style={{ background: t.accent, opacity: t.active ? 1 : 0.5 }}
    />
  );
}

/** A numeric feed as a compact stat tile: icon + mono readout + a one-line
 *  state, capped by a thin micro-meter gauge showing where the reading sits in
 *  its range (AQI toward 300, outages toward the county, river toward flood). */
function GaugeTile({ t, index, onOpen }: { t: PulseTile; index: number; onOpen: () => void }) {
  const g = t.gauge!;
  const Icon = ICONS[t.iconName] ?? AlertTriangle;
  return (
    <button {...tileButtonProps(t, onOpen)} className={tileClass(t)} style={tileStyle(t, index)}>
      <StatusDot t={t} />
      <span className="mb-1 flex items-center gap-1.5">
        <Icon
          aria-hidden
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          style={{ color: t.active ? t.accent : "var(--app-ink-3)" }}
        />
        <span className="pulse-tlab">{t.label}</span>
      </span>
      <AnimatedNumber
        value={g.value}
        decimals={g.decimals}
        comma={g.comma}
        className="pulse-sval font-mono tabular-nums"
        style={{ color: "var(--app-ink)" }}
      />
      <span className="pulse-ssub">{g.unit}</span>
      <span className="pulse-meter" aria-hidden>
        <span className="pulse-meter-fill" style={{ width: `${g.pct}%` }} />
      </span>
    </button>
  );
}

function StatusTile({ t, index, onOpen }: { t: PulseTile; index: number; onOpen: () => void }) {
  const Icon = ICONS[t.iconName] ?? AlertTriangle;
  return (
    <button {...tileButtonProps(t, onOpen)} className={tileClass(t)} style={tileStyle(t, index)}>
      <StatusDot t={t} />
      <span className="mb-1 flex items-center gap-1.5">
        <Icon
          aria-hidden
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          style={{ color: t.active ? t.accent : "var(--app-ink-3)" }}
        />
        <span className="pulse-tlab">{t.label}</span>
      </span>
      <span className="pulse-sval font-mono tabular-nums" style={{ color: "var(--app-ink)" }}>
        {t.countLabel}
      </span>
      {t.peek && <span className="pulse-ssub">{t.peek}</span>}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Board
 * ───────────────────────────────────────────────────────────── */

const FILTERS: { id: PulseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "calm", label: "Calm" },
];

export default function PulseBoard({
  hero,
  ticker,
  tiles,
  breaking,
  initialOpen,
}: {
  hero: PulseHero;
  ticker: PulseTicketItem[];
  tiles: PulseTile[];
  breaking?: ReactNode;
  initialOpen?: string;
}) {
  const [open, setOpen] = useState<string | null>(() =>
    initialOpen && tiles.some((t) => t.key === initialOpen) ? initialOpen : null,
  );
  const [filter, setFilter] = useState<PulseFilter>("all");
  const panelId = useId();

  const current = tiles.find((t) => t.key === open) ?? null;
  const attentionCount = tiles.filter((t) => t.attention).length;

  // Group by presentation family so the bento reads as bands of size: the
  // weather feature, then the gauge rings, then the status tiles.
  const visible = filterTiles(tiles, filter);
  const ordered = [
    ...visible.filter((t) => t.kind === "feature"),
    ...visible.filter((t) => t.kind === "gauge"),
    ...visible.filter((t) => t.kind === "status"),
  ];

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (i + 1) % FILTERS.length : (i - 1 + FILTERS.length) % FILTERS.length;
    setFilter(FILTERS[next].id);
    tabRefs.current[next]?.focus();
  };

  const heroColor = hero.allClear ? "var(--app-positive)" : "var(--app-danger)";

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header
        className={`pulse-hero tactile relative overflow-hidden rounded-[var(--app-radius-lg)]${hero.allClear ? "" : " alert-pulse"}`}
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: hero.allClear
            ? "var(--app-paper-light)"
            : "var(--app-paper-light), linear-gradient(155deg, color-mix(in srgb, var(--app-danger) 9%, transparent) 0%, transparent 68%)",
          boxShadow: "var(--app-elev-2), var(--app-hi), var(--app-edge)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: heroColor, opacity: hero.allClear ? 0.6 : 1 }}
        />
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--app-ink-2)" }}
            >
              <span
                aria-hidden
                className="pulse-dot inline-block h-2 w-2 rounded-full"
                style={{ background: heroColor }}
              />
              Live Pulse
            </span>
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
              <PulseFreshness renderedAt={hero.renderedAt} />
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${heroColor} 14%, transparent)`,
                color: heroColor,
              }}
            >
              {hero.allClear ? <ShieldCheck className="h-5 w-5" strokeWidth={2} /> : <Siren className="h-5 w-5" strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-[24px] font-semibold leading-[1.1] tracking-tight" style={{ color: "var(--app-ink)" }}>
                {hero.line}
              </h1>
              <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                {hero.sub}
              </p>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5 text-[11px] tabular-nums" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            {hero.temp != null && (
              <>
                <span className="font-mono font-bold" style={{ color: "var(--app-ink-2)" }}>
                  Now {hero.temp}°
                </span>
                <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              Refreshed {hero.refreshedClock} · auto-updates every couple of minutes
            </span>
          </p>
        </div>
      </header>

      {/* ── Incident ticker — only when something is active ──── */}
      {ticker.length > 0 && (
        <div
          className="pulse-ticker"
          role="status"
          aria-label="Active situations right now"
        >
          <div className="pulse-ticker-track font-mono">
            {[...ticker, ...ticker].map((it, i) => (
              <span key={i} className="pulse-ticker-item">
                <span
                  aria-hidden
                  className="pulse-ticker-dot"
                  style={{
                    background:
                      it.tone === "danger"
                        ? "var(--app-danger)"
                        : it.tone === "warning"
                          ? "var(--app-warning)"
                          : "var(--app-cool)",
                  }}
                />
                {it.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Breaking police strip (server-rendered) ──────────── */}
      {breaking}

      {/* ── Filter + board ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="pulse-dot inline-block h-2 w-2 rounded-full"
            style={{ background: heroColor }}
          />
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-2)" }}>
            County status
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em]" style={{ color: "var(--app-ink-3)" }}>
            {hero.allClear
              ? "all calm"
              : `${hero.situationCount} ${hero.situationCount === 1 ? "situation" : "situations"}`}
          </span>
        </div>

        {/* A hairline that reads live: a slow scan highlight sweeps it. */}

        <div className="pulse-seg" role="tablist" aria-label="Filter tiles by status">
          {FILTERS.map((f, i) => {
            const on = filter === f.id;
            const count = f.id === "attention" ? attentionCount : undefined;
            return (
              <button
                key={f.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                onClick={() => setFilter(f.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`pulse-seg-btn tap-44-y${on ? " is-on" : ""}`}
              >
                {f.label}
                {count !== undefined && count > 0 && (
                  <span className="pulse-seg-count font-mono">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {ordered.length > 0 ? (
          <div id={panelId} role="tabpanel" aria-label="County status tiles" className="pulse-bento">
            {ordered.map((t, i) => {
              const onOpen = () => setOpen(t.key);
              if (t.kind === "feature") return <FeatureTile key={t.key} t={t} index={i} onOpen={onOpen} />;
              if (t.kind === "gauge") return <GaugeTile key={t.key} t={t} index={i} onOpen={onOpen} />;
              return <StatusTile key={t.key} t={t} index={i} onOpen={onOpen} />;
            })}
          </div>
        ) : (
          <p id={panelId} role="tabpanel" className="pulse-filter-empty">
            {emptyMessage(filter)}
          </p>
        )}
      </section>

      <BottomDrawer
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title={current?.label ?? ""}
        subtitle={current ? `Source: ${current.sourceLabel}` : undefined}
      >
        <div className="space-y-2 px-4 pb-2">{current?.body}</div>
      </BottomDrawer>
    </>
  );
}
