"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { easternDayKey } from "@/lib/tz";
import { LENS_WORDS } from "@/lib/timeLens";
import {
  List as ListIcon,
  Rows3,
  CalendarDays,
  Map as MapIcon,
  CalendarRange,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import EventWeekRibbon from "@/components/event/EventWeekRibbon";
import { haptic } from "@/lib/haptics";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { PRIMARY_INTENTS, INTENT_BY_ID, type IntentId } from "@/lib/events/intents";
import type { Daypart } from "@/lib/daypart";
import {
  EVENT_INTENT_COLOR,
  WHEN_PRESETS,
  activeWhenPreset,
  countLine,
  formatDayLabel,
  whatCaption,
  whenCaption,
  nextMastheadCollapsed,
  type TimeKey,
} from "./boardCaption";

export type ViewKey = "list" | "compact" | "calendar" | "map";
export type EventSortKey = "recommended" | "time" | "az" | "venue";

const VIEW_ITEMS: ReadonlyArray<{ key: ViewKey; label: string; Icon: typeof ListIcon }> = [
  { key: "list", label: "List", Icon: ListIcon },
  { key: "compact", label: "Compact", Icon: Rows3 },
  { key: "calendar", label: "Agenda", Icon: CalendarDays },
  { key: "map", label: "Map", Icon: MapIcon },
];

const SORT_OPTIONS: ReadonlyArray<SortOption<EventSortKey>> = [
  { key: "recommended", label: "Recommended", hint: "Distinctive events before routine programs" },
  { key: "time", label: "Soonest", hint: "Next event first (grouped by horizon)" },
  { key: "az", label: "A→Z", hint: "Alphabetical by event title" },
  { key: "venue", label: "Venue", hint: "Cluster by venue name" },
];

// The four Eastern dayparts, in day order, for the When pane. Labels come
// from the shared caption vocabulary so the chip and the caption agree.
const DAYPARTS: ReadonlyArray<{ key: Daypart; label: string }> = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "late", label: "Late" },
];

type Pane = "what" | "when" | "where";

export type EventsBoardDockProps = {
  /** Server `now` (ISO) — the dateline + the ribbon's "today". */
  nowISO: string;
  /** Complete server-computed counts for the When pane's 7-day ribbon. */
  dayCounts: Record<string, number>;
  /** True count of the filtered set (the mono count line). */
  filteredCount: number;
  /** Per-intent counts over the base set (the What chip badges). */
  intentCounts: Record<IntentId, number>;
  /** Categories present in the set (the granular Type pills). */
  categories: { slug: string; name: string }[];
  /** Towns present in the set — drives the true town count on the line. */
  towns: { slug: string; name: string }[];

  // ── Filter state (owned by EventsExplorer; the dock is presentational) ──
  intent: IntentId | null;
  setIntent: (id: IntentId | null) => void;
  sub: string | null;
  setSub: (slug: string | null) => void;
  cat: string | null;
  setCat: (slug: string | null) => void;
  lens: TimeKey;
  setLens: (t: TimeKey) => void;
  tod: Daypart | null;
  setTod: (d: Daypart | null) => void;
  day: string | null;
  setDay: (d: string | null) => void;
  town: string | null;
  setTown: (slug: string | null) => void;
  q: string;
  setQ: (v: string) => void;
  freeOnly: boolean;
  setFreeOnly: (v: boolean) => void;
  happyOnly: boolean;
  setHappyOnly: (v: boolean) => void;
  kidsOnly: boolean;
  setKidsOnly: (v: boolean) => void;
  lgbtqOnly: boolean;
  setLgbtqOnly: (v: boolean) => void;
  recurringOnly: boolean;
  setRecurringOnly: (v: boolean) => void;

  /** Any filter active — drives the single clear-all ×. */
  anyFilter: boolean;
  clear: () => void;

  // ── How you look (orthogonal to the filter caption) ──
  view: ViewKey;
  setView: (v: ViewKey) => void;
  sort: EventSortKey;
  setSort: (s: EventSortKey) => void;
};

/** One dock chip: a color-dotted pill with an optional mono count. The
 *  active fill DARKENS the accent toward ink (the *-press analog) so white
 *  text clears AA on light golds/ambers — same rule the shipped cards use
 *  for category text on light accents. ≥44px effective via .tap-44-y. */
function EbChip({
  on,
  color,
  count,
  quiet,
  children,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  color?: string | null;
  count?: number;
  quiet?: boolean;
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`eb-chip tap-44-y${quiet ? " eb-chip-quiet" : ""}`}
      data-on={on || undefined}
      style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
    >
      {color && <span aria-hidden className="eb-chip-dot" />}
      {children}
      {typeof count === "number" && count > 0 && <span className="eb-chip-n">{count}</span>}
    </button>
  );
}

function Sect({ children }: { children: ReactNode }) {
  return <div className="dock-sect">{children}</div>;
}

function EventDisplayControls({
  view,
  setView,
  sort,
  setSort,
}: {
  view: ViewKey;
  setView: (value: ViewKey) => void;
  sort: EventSortKey;
  setSort: (value: EventSortKey) => void;
}) {
  return (
    <>
      <SortDropdown
        options={SORT_OPTIONS}
        value={sort}
        onChange={setSort}
        align="right"
        label="Order"
      />
      <div className="eb-lensseg" role="group" aria-label="View">
        {VIEW_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            aria-label={`${label} view`}
            className={view === key ? "on" : undefined}
            onClick={() => {
              haptic("light");
              setView(key);
            }}
          >
            <Icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
          </button>
        ))}
      </div>
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function EventsBoardDock(props: EventsBoardDockProps) {
  const {
    nowISO,
    dayCounts,
    filteredCount,
    intentCounts,
    categories,
    towns,
    intent,
    setIntent,
    sub,
    setSub,
    cat,
    setCat,
    lens,
    setLens,
    tod,
    setTod,
    day,
    setDay,
    town,
    setTown,
    q,
    setQ,
    freeOnly,
    setFreeOnly,
    happyOnly,
    setHappyOnly,
    kidsOnly,
    setKidsOnly,
    lgbtqOnly,
    setLgbtqOnly,
    recurringOnly,
    setRecurringOnly,
    anyFilter,
    clear,
    view,
    setView,
    sort,
    setSort,
  } = props;

  const [pane, setPane] = useState<Pane | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const whenRibbonRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // ── Collapse the nameplate on scroll (window scroll). Under
  //    prefers-reduced-motion the masthead stays static — no fold, no
  //    animation, never a janky jump. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setCollapsed((c) => nextMastheadCollapsed(window.scrollY, c));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // ── Focus into the pane when it opens; restore on close. ──
  useEffect(() => {
    if (!pane) return;
    const el = paneRef.current;
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [pane]);

  const closePane = () => {
    setPane(null);
    restoreRef.current?.focus?.();
  };
  const toggle = (p: Pane) => {
    haptic("light");
    if (pane === p) {
      closePane();
    } else {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setPane(p);
    }
  };

  // Esc closes; Tab is trapped within the open pane.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePane();
      return;
    }
    if (e.key !== "Tab" || !paneRef.current) return;
    const nodes = Array.from(
      paneRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // ── Dateline: "Wednesday · July 8", Eastern, from the server now. ──
  const nowDate = new Date(nowISO);
  const dlWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(nowDate);
  const dlDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  }).format(nowDate);

  // ── Caption composition ──
  const intentDef = intent ? INTENT_BY_ID[intent] : null;
  const civicOn = intent === "civic";
  // The legacy exact-category filter (Type drawer / ?cats deep links) rides
  // the same caption slot as the intent sub: picking "Live music" under
  // CATEGORY filtered the list but left the bar reading "WHAT Everything"
  // (fresh-eyes audit, Jul 2026).
  const subLabel = sub
    ? categories.find((c) => c.slug === sub)?.name ??
      intentDef?.subs?.find((s) => s.slug === sub)?.label ??
      sub
    : cat
      ? categories.find((c) => c.slug === cat)?.name ?? cat
      : null;
  const goods: string[] = [];
  if (freeOnly) goods.push("Free");
  if (kidsOnly) goods.push("Kid-friendly");
  if (lgbtqOnly) goods.push("LGBTQ+");
  if (recurringOnly) goods.push("Recurring");
  if (happyOnly) goods.push("Happy hour");

  const what = whatCaption({
    goods,
    intentLabel: civicOn ? null : intentDef?.label,
    subLabel: civicOn ? null : subLabel,
    civic: civicOn,
  });
  const whatColor = intentDef
    ? `color-mix(in srgb, ${EVENT_INTENT_COLOR[intent!]} 82%, var(--app-ink))`
    : what.active
      ? "var(--app-brand-press)"
      : "var(--app-ink)";

  const dayLabel = day ? formatDayLabel(day) : null;
  const when = whenCaption({ dayLabel, lens, tod });
  const whenColor = when.mono
    ? "var(--app-cool)"
    : when.text === "Anytime"
      ? "var(--app-ink)"
      : "var(--app-brand)";

  const townName = town
    ? MUNICIPALITY_BY_SLUG[town]?.name ?? towns.find((t) => t.slug === town)?.name ?? town
    : null;
  const whereText = townName ?? "Whole county";
  const whereColor = town ? "var(--app-cool)" : "var(--app-ink)";

  const line = countLine({ events: filteredCount, townName, townCount: towns.length });

  const everythingCount = Object.values(intentCounts).reduce((a, b) => a + b, 0);
  const activePreset = activeWhenPreset({ lens, tod });
  // "Tomorrow" is a day pick, not a lens — the ?d= plumbing already
  // exists, so the ribbon chip just targets tomorrow's Eastern day key.
  const tomorrowKey = easternDayKey(new Date(Date.parse(nowISO) + 86_400_000));

  // A deep link such as /weekend can select a chip beyond the narrow phone
  // viewport. Keep the active choice in view without moving the page itself.
  useEffect(() => {
    const ribbon = whenRibbonRef.current;
    const active = ribbon?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!ribbon || !active) return;

    const visibleStart = ribbon.scrollLeft;
    const visibleEnd = visibleStart + ribbon.clientWidth;
    const activeStart = active.offsetLeft;
    const activeEnd = activeStart + active.offsetWidth;
    if (activeStart >= visibleStart && activeEnd <= visibleEnd) return;

    ribbon.scrollLeft = Math.max(
      0,
      activeStart - (ribbon.clientWidth - active.offsetWidth) / 2,
    );
  }, [activePreset, day, tomorrowKey]);

  // ── Pane control handlers ──
  const pickIntent = (id: IntentId) => {
    haptic("light");
    setIntent(intent === id ? null : id);
    setSub(null);
  };
  const pickEverything = () => {
    haptic("light");
    setIntent(null);
    setSub(null);
    setCat(null);
  };
  const pickPreset = (p: (typeof WHEN_PRESETS)[number]) => {
    haptic("light");
    if (activePreset === p.key) {
      setLens("all");
      setTod(null);
    } else {
      setLens(p.lens);
      setTod(p.tod);
    }
    setDay(null);
  };
  const pickDaypart = (d: Daypart) => {
    haptic("light");
    setTod(tod === d ? null : d);
  };
  const pickDay = (key: string | null) => {
    setDay(key);
    if (key) {
      setLens("all");
      setTod(null);
    }
  };
  const jumpNextWeekend = () => {
    haptic("light");
    setLens("weekend");
    setTod(null);
    setDay(null);
  };

  const paneTitle =
    pane === "what" ? "What’s on" : pane === "when" ? "When" : pane === "where" ? "Where" : "";

  return (
    <div className={`eb-dock${collapsed ? " eb-collapsed" : ""}${pane ? " eb-open" : ""}`}>
      <h1 className="sr-only">Events in Frederick County</h1>
      <div className="eb-head">
        {/* The almanac nameplate — collapses to zero on scroll. */}
        <div className="eb-masthead" aria-hidden={collapsed}>
          <div className="eb-dateline">
            {dlWeekday} &middot; {dlDate}
          </div>
          <h2 className="eb-title font-serif">
            What&rsquo;s <span className="eb-title-on">on</span>
          </h2>
        </div>

        {/* The when-ribbon — the date questions one tap from the default
            view (July 2026 review: the presets lived a tap deep in the
            When pane). Same lens/tod/day state the pane edits; Tomorrow
            is a day pick riding the existing ?d= plumbing. Rides with
            the masthead so the collapsed dock keeps its footprint. */}
        <div
          className="eb-whenribbon"
          role="group"
          aria-label="When"
          aria-hidden={collapsed}
          inert={collapsed}
          ref={whenRibbonRef}
        >
          {WHEN_PRESETS.map((p, i) => (
            <Fragment key={p.key}>
              <EbChip
                on={activePreset === p.key}
                color="var(--app-brand)"
                onClick={() => pickPreset(p)}
              >
                {p.label}
              </EbChip>
              {i === 1 && (
                <EbChip
                  on={day === tomorrowKey}
                  color="var(--app-brand)"
                  onClick={() => {
                    haptic("light");
                    pickDay(day === tomorrowKey ? null : tomorrowKey);
                  }}
                >
                  {LENS_WORDS.tomorrow}
                </EbChip>
              )}
            </Fragment>
          ))}
        </div>

        {/* The caption bar — pinned. Each word opens its filter pane. */}
        <div className="eb-capbar" role="group" aria-label="Filter events">
          <button
            type="button"
            aria-expanded={pane === "what"}
            aria-controls="eb-pane"
            aria-haspopup="dialog"
            className={`eb-seg eb-seg-what${pane === "what" ? " active-tab" : ""}`}
            onClick={() => toggle("what")}
          >
            <span className="eb-seg-k">What</span>
            <span className="eb-seg-v" style={{ color: whatColor }}>
              {what.text}
            </span>
          </button>
          <button
            type="button"
            aria-expanded={pane === "when"}
            aria-controls="eb-pane"
            aria-haspopup="dialog"
            className={`eb-seg${pane === "when" ? " active-tab" : ""}`}
            onClick={() => toggle("when")}
          >
            <span className="eb-seg-k">When</span>
            <span className={`eb-seg-v${when.mono ? " mono" : ""}`} style={{ color: whenColor }}>
              {when.text}
            </span>
          </button>
          <button
            type="button"
            aria-expanded={pane === "where"}
            aria-controls="eb-pane"
            aria-haspopup="dialog"
            className={`eb-seg eb-seg-where${pane === "where" ? " active-tab" : ""}`}
            onClick={() => toggle("where")}
          >
            <span className="eb-seg-k">Where</span>
            <span className="eb-seg-v" style={{ color: whereColor }}>
              {whereText}
            </span>
          </button>
          {anyFilter && (
            <button
              type="button"
              className="eb-clear tap-44"
              onClick={() => {
                haptic("light");
                clear();
              }}
              aria-label="Clear all filters"
            >
              <X className="h-[15px] w-[15px]" strokeWidth={2.6} aria-hidden />
            </button>
          )}
        </div>

        {/* The sub bar keeps the result count visible. Sorting and alternate
            layouts are secondary decisions, so mobile gets one "Display"
            disclosure instead of five more controls before the first event.
            Desktop keeps the same controls inline inside the disclosure. */}
        <div className="eb-subbar">
          <span className="eb-countline" aria-live="polite">
            {line}
          </span>
          <details className="eb-display-options">
            <summary className="tap-44">
              <span>Display</span>
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </summary>
            <div className="eb-display-panel">
              <EventDisplayControls
                view={view}
                setView={setView}
                sort={sort}
                setSort={setSort}
              />
            </div>
          </details>
          <div className="eb-display-desktop">
            <EventDisplayControls
              view={view}
              setView={setView}
              sort={sort}
              setSort={setSort}
            />
          </div>
        </div>
      </div>

      {/* Scrim — dims the list; a tap closes the open pane. */}
      <div className={`eb-scrim${pane ? " on" : ""}`} onClick={closePane} aria-hidden />

      {/* The top-sheet pane — drops DOWN over the scrim-dimmed list. */}
      <div
        className="eb-pane"
        id="eb-pane"
        role="dialog"
        aria-label={paneTitle}
        aria-hidden={pane === null}
        // Collapsed via max-height:0 (not display:none), so without `inert` a
        // keyboard user still Tabs onto the hidden "Done" button (2026-07
        // shell-hardening P3). inert removes the whole pane from tab order +
        // the a11y tree while closed.
        inert={pane === null}
        ref={paneRef}
        onKeyDown={onPaneKeyDown}
      >
        <div className="eb-pane-scroll">
          <div className="dock-pane-head">
            <span className="dock-pane-title font-serif">{paneTitle}</span>
            <button type="button" className="dock-done" onClick={closePane}>
              Done
            </button>
          </div>

          {/* ── WHAT ── */}
          {pane === "what" && (
            <div>
              <label className="eb-filterfield">
                <Search className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter these events…"
                  aria-label="Filter the events shown"
                />
              </label>

              <Sect>Type</Sect>
              <div className="eb-chips">
                <EbChip on={!intent && !cat} onClick={pickEverything} count={everythingCount}>
                  Everything
                </EbChip>
                {PRIMARY_INTENTS.map((it) => (
                  <EbChip
                    key={it.id}
                    on={intent === it.id}
                    color={EVENT_INTENT_COLOR[it.id]}
                    count={intentCounts[it.id]}
                    onClick={() => pickIntent(it.id)}
                  >
                    {it.label}
                  </EbChip>
                ))}
                <EbChip
                  on={civicOn}
                  color={EVENT_INTENT_COLOR.civic}
                  count={intentCounts.civic}
                  quiet
                  onClick={() => pickIntent("civic")}
                >
                  Government &amp; notices
                </EbChip>
              </div>

              {/* Sub running-head — only where the taxonomy has subs. */}
              {intentDef?.subs && intentDef.subs.length > 0 && (
                <div
                  className="dock-subrow"
                  role="group"
                  aria-label={`Narrow ${intentDef.label}`}
                  style={{ "--c": EVENT_INTENT_COLOR[intent!] } as React.CSSProperties}
                >
                  <button
                    type="button"
                    aria-pressed={!sub}
                    data-on={!sub || undefined}
                    onClick={() => {
                      haptic("light");
                      setSub(null);
                    }}
                  >
                    All
                    <span className="dock-chip-n">{intentCounts[intent!]}</span>
                  </button>
                  {intentDef.subs.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      aria-pressed={sub === s.slug}
                      data-on={sub === s.slug || undefined}
                      onClick={() => {
                        haptic("light");
                        setSub(sub === s.slug ? null : s.slug);
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              <Sect>Good for</Sect>
              <div className="eb-chips">
                <EbChip on={kidsOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setKidsOnly(!kidsOnly); }}>
                  Kid-friendly
                </EbChip>
                <EbChip on={freeOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setFreeOnly(!freeOnly); }}>
                  Free
                </EbChip>
                <EbChip
                  on={lgbtqOnly}
                  color="var(--app-accent)"
                  ariaLabel="LGBTQ+ community events"
                  onClick={() => { haptic("light"); setLgbtqOnly(!lgbtqOnly); }}
                >
                  LGBTQ+
                </EbChip>
                <EbChip on={recurringOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setRecurringOnly(!recurringOnly); }}>
                  Recurring
                </EbChip>
                <EbChip on={happyOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setHappyOnly(!happyOnly); }}>
                  Happy hour
                </EbChip>
              </div>

              {categories.length > 0 && (
                <>
                  <Sect>Category</Sect>
                  <div className="eb-chips">
                    <EbChip on={!cat} onClick={() => { haptic("light"); setCat(null); }}>
                      Any category
                    </EbChip>
                    {categories.map((c) => (
                      <EbChip
                        key={c.slug}
                        on={cat === c.slug}
                        color={CATEGORY_BY_SLUG[c.slug]?.color}
                        onClick={() => { haptic("light"); setCat(cat === c.slug ? null : c.slug); }}
                      >
                        {c.name}
                      </EbChip>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── WHEN ── */}
          {pane === "when" && (
            <div>
              <Sect>Time</Sect>
              <div className="eb-chips">
                {WHEN_PRESETS.map((p) => (
                  <EbChip
                    key={p.key}
                    on={activePreset === p.key}
                    color="var(--app-brand)"
                    onClick={() => pickPreset(p)}
                  >
                    {p.label}
                  </EbChip>
                ))}
              </div>

              <Sect>Time of day</Sect>
              <div className="eb-chips">
                {DAYPARTS.map((d) => (
                  <EbChip
                    key={d.key}
                    on={tod === d.key}
                    color="var(--app-cool)"
                    onClick={() => pickDaypart(d.key)}
                  >
                    {d.label}
                  </EbChip>
                ))}
              </div>

              <Sect>Pick a day</Sect>
              <EventWeekRibbon
                nowISO={nowISO}
                countByDate={dayCounts}
                activeDay={day}
                onPickDay={pickDay}
              />

              <button type="button" className="eb-jumpwk tap-44" onClick={jumpNextWeekend}>
                <CalendarRange className="h-[15px] w-[15px]" strokeWidth={2.1} aria-hidden />
                Jump to next weekend
              </button>

              {/* Any date, any distance — the week ribbon only reaches seven
                  days, and "get me to December" took a scroll marathon (beta
                  feedback, Jul 2026). A native date input rides the existing
                  ?d= day filter; the OS supplies the picker. */}
              <label className="eb-jumpwk tap-44" style={{ cursor: "pointer" }}>
                <CalendarDays className="h-[15px] w-[15px]" strokeWidth={2.1} aria-hidden />
                Jump to a date
                <input
                  type="date"
                  aria-label="Jump to a date"
                  value={day ?? ""}
                  min={new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowISO))}
                  onChange={(e) => pickDay(e.target.value || null)}
                  className="ml-auto h-8 rounded-[var(--app-radius-sm)] border px-2 font-mono text-[12px]"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-ink)" }}
                />
              </label>

              <p className="dock-hint">
                Planning an event of your own?{" "}
                <a href="/check-a-date" style={{ color: "var(--app-brand-press)", fontWeight: 600 }}>
                  Check a date
                </a>{" "}
                to see what&rsquo;s already scheduled.
              </p>
            </div>
          )}

          {/* ── WHERE ── */}
          {pane === "where" && (
            <div>
              <Sect>Town</Sect>
              <div className="eb-chips">
                <EbChip on={!town} onClick={() => { haptic("light"); setTown(null); }}>
                  Whole county
                </EbChip>
                {MUNICIPALITIES.map((m) => (
                  <EbChip
                    key={m.slug}
                    on={town === m.slug}
                    color="var(--app-cool)"
                    onClick={() => { haptic("light"); setTown(town === m.slug ? null : m.slug); }}
                  >
                    {m.name}
                  </EbChip>
                ))}
              </div>
              <p className="dock-hint">
                Pick a town to narrow the list, or leave it on the whole county.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
