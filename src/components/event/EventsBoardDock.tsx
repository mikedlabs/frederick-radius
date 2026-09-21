"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  List as ListIcon,
  Rows3,
  CalendarDays,
  Map as MapIcon,
  CalendarRange,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Music,
  Palette,
  Utensils,
  Users,
  Activity,
  Trees,
  Sparkles,
  Landmark,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INTENT_ICONS: Record<string, any> = {
  Music,
  Palette,
  Utensils,
  Users,
  Activity,
  Trees,
  Sparkles,
  Landmark,
};
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import EventWeekRibbon from "@/components/event/EventWeekRibbon";
import { haptic } from "@/lib/haptics";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  EVENT_INTENTS,
  INTENT_BY_ID,
  type IntentId,
} from "@/lib/events/intents";
import type { Daypart } from "@/lib/daypart";
import {
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

/** The questions most people arrive with stay visible. Longer-range and
 * exact-date planning remain available in the single Filters sheet. */
export const EVENTS_PRIMARY_WHEN_PRESETS = WHEN_PRESETS.filter(
  (preset) =>
    preset.key === "today" ||
    preset.key === "tonight" ||
    preset.key === "weekend",
);

type Pane = "what" | "when" | "where";

export type EventsBoardDockProps = {
  /** Server `now` (ISO) — the dateline + the ribbon's "today". */
  nowISO: string;
  /** Complete server-computed counts for the When pane's 7-day ribbon. */
  dayCounts: Record<string, number>;
  /** True count of the filtered set (the mono count line). */
  filteredCount: number;
  /** Towns represented by the same result set as filteredCount. */
  resultTownCount: number;
  /** False while the count describes only rows loaded so far. */
  countComplete: boolean;
  /** Categories present in the set (the granular Type pills). */
  categories: { slug: string; name: string }[];
  /** Towns currently available in the Where filter. */
  towns: { slug: string; name: string }[];
  /** A non-town shared scope such as a consented device location. */
  whereLabel?: string | null;

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
  communicationAccessOnly: boolean;
  setCommunicationAccessOnly: (v: boolean) => void;
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
  icon: Icon,
  className,
}: {
  on: boolean;
  color?: string | null;
  count?: number;
  quiet?: boolean;
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`eb-chip tap-44-y${quiet ? " eb-chip-quiet" : ""} ${className || ""}`}
      data-on={on || undefined}
      style={{
        ...(color ? { "--c": color } : {}),
        minHeight: 44,
      } as React.CSSProperties}
    >
      {Icon ? (
        <Icon className="shrink-0" size={18} strokeWidth={2.25} aria-hidden />
      ) : color ? (
        <span aria-hidden className="eb-chip-dot" />
      ) : null}
      <span className="truncate">{children}</span>
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
  onSelect,
}: {
  view: ViewKey;
  setView: (value: ViewKey) => void;
  sort: EventSortKey;
  setSort: (value: EventSortKey) => void;
  onSelect?: () => void;
}) {
  return (
    <>
      <SortDropdown
        options={SORT_OPTIONS}
        value={sort}
        onChange={(value) => {
          setSort(value);
          onSelect?.();
        }}
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
              onSelect?.();
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
    resultTownCount,
    countComplete,
    categories,
    towns,
    whereLabel = null,
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
    communicationAccessOnly,
    setCommunicationAccessOnly,
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
  const mobileDisplayRef = useRef<HTMLDetailsElement>(null);
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
  if (communicationAccessOnly) goods.push("Deaf community & access");
  if (recurringOnly) goods.push("Recurring");
  if (happyOnly) goods.push("Happy hour");

  const what = whatCaption({
    goods,
    intentLabel: civicOn ? null : intentDef?.label,
    subLabel: civicOn ? null : subLabel,
    civic: civicOn,
  });
  const dayLabel = day ? formatDayLabel(day) : null;
  const when = whenCaption({ dayLabel, lens, tod });

  const townName = town
    ? MUNICIPALITY_BY_SLUG[town]?.name ?? towns.find((t) => t.slug === town)?.name ?? town
    : null;
  const whereText = whereLabel ?? townName ?? "Whole county";

  const line = countLine({
    events: filteredCount,
    townName: whereLabel ?? townName,
    townCount: resultTownCount,
    complete: countComplete,
  });

  const whatActive = Boolean(
    intent ||
    sub ||
    cat ||
    q.trim() ||
    goods.length > 0,
  );
  const whenActive = Boolean(day || tod || lens !== "all");
  const whereActive = Boolean(town || whereLabel);
  const activeFilterGroups = [whatActive, whenActive, whereActive].filter(Boolean).length;
  const filterSummary =
    [
      whatActive ? (q.trim() ? `“${q.trim()}”` : what.text) : null,
      whenActive ? when.text : null,
      whereActive ? whereText : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ") || "Everything · Anytime · Whole county";
  const firstActivePane: Pane = whatActive
    ? "what"
    : whenActive
      ? "when"
      : whereActive
        ? "where"
        : "what";

  const activePreset = activeWhenPreset({ lens, tod });
  const [pendingWhenPreset, setPendingWhenPreset] = useState<
    (typeof WHEN_PRESETS)[number]["key"] | null | undefined
  >(undefined);
  const visibleWhenPreset = pendingWhenPreset === undefined
    ? activePreset
    : pendingWhenPreset;
  const [, startWhenTransition] = useTransition();
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
  }, [activePreset, day]);

  // ── Pane control handlers ──
  const pickEverything = () => {
    haptic("light");
    setIntent(null);
    setSub(null);
    setCat(null);
  };
  const pickIntent = (nextIntent: IntentId) => {
    haptic("light");
    setCat(null);
    setSub(null);
    setIntent(intent === nextIntent ? null : nextIntent);
  };
  const pickSub = (nextSub: string) => {
    haptic("light");
    setCat(null);
    setSub(sub === nextSub ? null : nextSub);
  };
  const pickCategory = (nextCategory: string | null) => {
    haptic("light");
    setIntent(null);
    setSub(null);
    setCat(cat === nextCategory ? null : nextCategory);
  };
  const pickPreset = (p: (typeof WHEN_PRESETS)[number]) => {
    haptic("light");
    const turningOff = visibleWhenPreset === p.key;
    const nextPreset = turningOff ? null : p.key;
    // A discrete local state update acknowledges the tap in the current
    // frame. The larger event-board re-slice remains a transition, so a busy
    // live feed cannot make the chip look ignored.
    setPendingWhenPreset(nextPreset);
    window.requestAnimationFrame(() => {
      startWhenTransition(() => {
        if (turningOff) {
          setLens("all");
          setTod(null);
        } else {
          setLens(p.lens);
          setTod(p.tod);
        }
        setDay(null);
        setPendingWhenPreset(undefined);
      });
    });
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
  const closeMobileDisplay = () => {
    if (mobileDisplayRef.current) mobileDisplayRef.current.open = false;
  };
  const viewLabel = VIEW_ITEMS.find((item) => item.key === view)?.label ?? "List";
  const sortLabel = SORT_OPTIONS.find((item) => item.key === sort)?.label ?? "Recommended";

  return (
    <div className={`eb-dock${collapsed ? " eb-collapsed" : ""}${pane ? " eb-open" : ""}`}>
      <h1 className="sr-only">Events in Frederick County</h1>
      <div className="eb-head backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--app-bg-elevated)]/85" style={{ background: "var(--app-bg-elevated-solid)" }}>
        {/* The almanac nameplate — collapses to zero on scroll. */}
        <div className="eb-masthead" aria-hidden={collapsed}>
          <div className="eb-dateline">
            {dlWeekday} &middot; {dlDate}
          </div>
          <h2 className="eb-title font-sans">
            What&rsquo;s <span className="eb-title-on">on</span>
          </h2>
        </div>

        {/* The three date questions people use most stay one tap away.
            Tomorrow, later this week, dayparts, and exact dates remain in
            the one canonical Filters sheet. */}
        <div
          className="eb-whenribbon"
          role="group"
          aria-label="When"
          aria-hidden={collapsed}
          inert={collapsed}
          ref={whenRibbonRef}
        >
          {EVENTS_PRIMARY_WHEN_PRESETS.map((p) => (
            <EbChip
              key={p.key}
              on={visibleWhenPreset === p.key}
              color="var(--app-brand)"
              onClick={() => pickPreset(p)}
            >
              {p.label}
            </EbChip>
          ))}
        </div>

        {/* One quiet filter control keeps the cold state focused on events.
            What, When, and Where remain one tap away inside the sheet. */}
        <div className="eb-filterbar">
          <button
            type="button"
            aria-expanded={pane !== null}
            aria-controls="eb-pane"
            aria-haspopup="dialog"
            className="eb-filter-trigger"
            onClick={() => toggle(pane ?? firstActivePane)}
          >
            <SlidersHorizontal className="h-[16px] w-[16px] shrink-0" strokeWidth={2.2} aria-hidden />
            <span className="eb-filter-copy">
              <span className="eb-filter-label">Filters</span>
              <span className="eb-filter-summary">{filterSummary}</span>
            </span>
            {activeFilterGroups > 0 && (
              <span className="eb-filter-count" aria-hidden>
                {activeFilterGroups}
              </span>
            )}
            <ChevronDown
              className="h-[15px] w-[15px] shrink-0"
              strokeWidth={2.2}
              aria-hidden
              style={{ transform: pane ? "rotate(180deg)" : undefined }}
            />
          </button>
          {anyFilter && (
            <button
              type="button"
              className="eb-filter-reset tap-44"
              onClick={() => {
                haptic("light");
                clear();
              }}
              aria-label="Reset all event filters"
            >
              Reset
            </button>
          )}
        </div>

        {/* The sub bar keeps the result count visible. Mobile gets one native
            disclosure for view and order; desktop retains the same controls
            inline. Neither surface puts a control wall in front of the first
            event. */}
        <div className="eb-subbar">
          <span className="eb-countline" aria-live="polite">
            {line}
          </span>
          <details ref={mobileDisplayRef} className="eb-display-options">
            <summary
              className="tap-44"
              style={{ minHeight: 44 }}
              aria-label={`Change event display. ${viewLabel} view, ${sortLabel} order.`}
            >
              <span>Display</span>
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </summary>
            <div className="eb-display-panel">
              <EventDisplayControls
                view={view}
                setView={setView}
                sort={sort}
                setSort={setSort}
                onSelect={closeMobileDisplay}
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
        aria-label="Event filters"
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
            <span className="dock-pane-title font-sans">Filters</span>
            <button type="button" className="dock-done" onClick={closePane}>
              Done
            </button>
          </div>
          <div className="eb-pane-tabs" role="tablist" aria-label="Event filter sections">
            {(["what", "when", "where"] as const).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={pane === section}
                style={{ minHeight: 44 }}
                onClick={() => {
                  haptic("light");
                  setPane(section);
                }}
              >
                {section === "what" ? "What" : section === "when" ? "When" : "Where"}
              </button>
            ))}
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

              <Sect>Interest</Sect>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Event interests">
                <EbChip
                  on={!intent && !cat && !sub}
                  onClick={pickEverything}
                  className="col-span-full justify-center !rounded-[var(--app-radius-md)]"
                >
                  Any interest
                </EbChip>
                {EVENT_INTENTS.map((item) => {
                  const Icon = INTENT_ICONS[item.icon];
                  return (
                    <EbChip
                      key={item.id}
                      on={intent === item.id}
                      color={item.tucked ? "var(--app-civic)" : "var(--app-brand)"}
                      onClick={() => pickIntent(item.id)}
                      icon={Icon}
                      className="!flex-col !items-start !justify-between !h-20 !p-3 !rounded-[var(--app-radius-lg)] !w-full"
                    >
                      {item.label}
                    </EbChip>
                  );
                })}
              </div>

              {intentDef?.subs?.length ? (
                <>
                  <Sect>Narrow {intentDef.label}</Sect>
                  <div className="eb-chips" role="group" aria-label={`${intentDef.label} categories`}>
                    {intentDef.subs.map((item) => (
                      <EbChip
                        key={item.slug}
                        on={sub === item.slug}
                        color="var(--app-cool)"
                        onClick={() => pickSub(item.slug)}
                      >
                        {item.label}
                      </EbChip>
                    ))}
                  </div>
                </>
              ) : null}

              <Sect>Good for</Sect>
              <div className="eb-chips" role="group" aria-label="Event qualities">
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
                <EbChip
                  on={communicationAccessOnly}
                  color="var(--app-accent)"
                  ariaLabel="Events for the Deaf community or with confirmed communication access"
                  onClick={() => {
                    haptic("light");
                    setCommunicationAccessOnly(!communicationAccessOnly);
                  }}
                >
                  Deaf community &amp; access
                </EbChip>
                <EbChip on={recurringOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setRecurringOnly(!recurringOnly); }}>
                  Recurring
                </EbChip>
                <EbChip on={happyOnly} color="var(--app-accent)" onClick={() => { haptic("light"); setHappyOnly(!happyOnly); }}>
                  Happy hour
                </EbChip>
              </div>

              {categories.length > 0 && (
                <details className="group mt-4 rounded-[var(--app-radius-md)] border px-3" style={{ borderColor: "var(--app-border)" }}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-[var(--app-ink-2)]">
                    <span>
                      {cat
                        ? `Category · ${categories.find((item) => item.slug === cat)?.name ?? cat}`
                        : "More specific categories"}
                    </span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 opacity-50 transition-transform group-open:rotate-180"
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </summary>
                  <div className="eb-chips border-t py-3" role="group" aria-label="Event categories" style={{ borderColor: "var(--app-border)" }}>
                    <EbChip on={!cat && !intent && !sub} onClick={() => pickCategory(null)}>
                      Any category
                    </EbChip>
                    {categories.map((c) => (
                      <EbChip
                        key={c.slug}
                        on={cat === c.slug}
                        color={CATEGORY_BY_SLUG[c.slug]?.color}
                        onClick={() => pickCategory(c.slug)}
                      >
                        {c.name}
                      </EbChip>
                    ))}
                  </div>
                </details>
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
