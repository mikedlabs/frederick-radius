"use client";

import Link from "next/link";
import styles from "./EventsBoardDock.module.css";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { acquireScrollLock } from "@/lib/scroll-lock";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
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

export type EventBoardFilters = {
  intent: IntentId | null;
  sub: string | null;
  cat: string | null;
  lens: TimeKey;
  tod: Daypart | null;
  day: string | null;
  town: string | null;
  q: string;
  freeOnly: boolean;
  happyOnly: boolean;
  kidsOnly: boolean;
  lgbtqOnly: boolean;
  communicationAccessOnly: boolean;
  recurringOnly: boolean;
};

export type EventsBoardDockProps = {
  photoOverview?: boolean;
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

  filters: EventBoardFilters;
  applyFilters: (filters: EventBoardFilters, changeTown: boolean) => void;
  /** Return null while any source or continuation is incomplete. */
  previewCount: (filters: EventBoardFilters) => number | null;
  onOpenFilters: () => void;

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
  preset,
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
  preset?: string;
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
      data-events-preset={preset}
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
  align = "right",
}: {
  view: ViewKey;
  setView: (value: ViewKey) => void;
  sort: EventSortKey;
  setSort: (value: EventSortKey) => void;
  onSelect?: () => void;
  /** Which edge of the Order button its menu hangs from. The phone panel
   *  starts at the button's left edge so the wider menu stays on screen. */
  align?: "left" | "right";
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
        align={align}
        label="Order"
      />
      <div className={`eb-lensseg ${styles.views}`} role="group" aria-label="View">
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
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Close the native Display disclosure. Its controls stop rendering, so when
 *  one of them held focus (a choice, or Escape) focus goes to the summary. An
 *  outside press passes `false` and leaves focus with what was pressed. */
function closeDisplay(display: HTMLDetailsElement | null, keepFocus = true) {
  if (!display?.open) return;
  const heldFocus = display.contains(document.activeElement);
  display.open = false;
  if (keepFocus && heldFocus) display.querySelector("summary")?.focus({ preventScroll: true });
}

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
    filters, applyFilters, previewCount, onOpenFilters,
    anyFilter,
    clear,
    view,
    setView,
    sort,
    setSort,
  } = props;

  const { intent, sub, cat, lens, tod, day, town, q, freeOnly, happyOnly, kidsOnly, lgbtqOnly, communicationAccessOnly, recurringOnly } = filters;
  const [edits, setEdits] = useState<Partial<EventBoardFilters>>({});
  const draft = useMemo(() => ({ ...filters, ...edits }), [filters, edits]);
  const edit = (patch: Partial<EventBoardFilters>) => setEdits((previous) => ({ ...previous, ...patch }));
  const [pane, setPane] = useState<Pane | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const paneOpen = pane !== null;
  const whenRibbonRef = useRef<HTMLDivElement>(null);
  const mobileDisplayRef = useRef<HTMLDetailsElement>(null);
  const [displayOpen, setDisplayOpen] = useState(false);
  const restoreRef = useRef<HTMLElement | null>(null);
  const historyLayer = useReversibleHistoryLayer({
    active: paneOpen,
    id: "events-filters",
    onDismiss: () => setPane(null),
    preserveUrlOnDismiss: true,
  });

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

  // This existing top sheet owns input while open. Isolate sibling branches
  // all the way to the document, retaining any previous inert ownership.
  useLayoutEffect(() => {
    if (!paneOpen) {
      restoreRef.current?.focus({ preventScroll: true });
      restoreRef.current = null;
      return;
    }
    if (!paneRef.current) return;
    const panel = paneRef.current;
    const previousOffset = panel.style.getPropertyValue("--events-toolbar-offset");
    panel.style.setProperty("--events-toolbar-offset", `${toolbarRef.current?.getBoundingClientRect().height ?? 0}px`);
    const previousInert = new Map<HTMLElement, string | null>();
    const isolateBackground = () => {
      let branch: HTMLElement | null = paneRef.current;
      if (!branch) return;
      while (branch.parentElement) {
        observer.observe(branch.parentElement, { childList: true });
        for (const sibling of branch.parentElement.children) {
          if (!(sibling instanceof HTMLElement) || sibling === branch || sibling === scrimRef.current) continue;
          if (!previousInert.has(sibling)) previousInert.set(sibling, sibling.getAttribute("inert"));
          sibling.setAttribute("inert", "");
        }
        branch = branch.parentElement;
        if (branch === document.body) break;
      }
    };
    // Filtering can replace a result/empty-state branch while the pane is
    // open. Observe only ancestor child lists, not every change in the page.
    const observer = new MutationObserver(isolateBackground);
    isolateBackground();
    // The shared lock holds the document scroll root (html). Setting body
    // overflow would make body a new scroll container and break this pane's
    // viewport-sticky dock.
    const releaseScroll = acquireScrollLock();
    paneRef.current.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      if (previousOffset) panel.style.setProperty("--events-toolbar-offset", previousOffset);
      else panel.style.removeProperty("--events-toolbar-offset");
      for (const [element, value] of previousInert) {
        if (value === null) element.removeAttribute("inert");
        else element.setAttribute("inert", value);
      }
      releaseScroll();
    };
  }, [paneOpen]);

  // The Display disclosure floats over the list on phones. A native details
  // element has no light dismissal, so while it is open a press anywhere else
  // and Escape both close it.
  useEffect(() => {
    if (!displayOpen) return;
    const onPress = (event: PointerEvent) => {
      const display = mobileDisplayRef.current;
      if (display && !display.contains(event.target as Node)) closeDisplay(display, false);
    };
    const onEscape = (event: KeyboardEvent) => {
      // The open Order menu marks the Escape it consumed. That press closes
      // the menu only; the next one closes Display.
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      closeDisplay(mobileDisplayRef.current);
    };
    // Capture, so a control that stops the press from bubbling still counts.
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", onEscape);
    };
  }, [displayOpen]);

  const closePane = () => historyLayer.dismiss();
  const applyDraft = () => {
    // Commit after returning to the underlying browse entry, so its popstate
    // reader cannot replace the user's new filters with the previous URL.
    if (!Object.keys(edits).length) return closePane();
    historyLayer.leave(() => applyFilters(draft, Object.hasOwn(edits, "town")));
  };
  const draftCount = useMemo(() => paneOpen ? previewCount(draft) : null, [draft, paneOpen, previewCount]);
  const draftIntent = draft.intent ? INTENT_BY_ID[draft.intent] : null;
  const draftPreset = activeWhenPreset(draft);
  useEffect(() => {
    if (!paneOpen) return;
    // WebKit touch activation can leave focus on the document body. The
    // owned modal still handles Escape even when no descendant has focus.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      historyLayer.dismiss();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [paneOpen, historyLayer]);
  const toggle = (p: Pane) => {
    haptic("light");
    if (pane === p) {
      closePane();
    } else {
      if (historyLayer.isDismissing()) return;
      if (mobileDisplayRef.current) mobileDisplayRef.current.open = false;
      restoreRef.current = filterTriggerRef.current ?? document.activeElement as HTMLElement | null;
      setEdits({});
      onOpenFilters();
      setPane(p);
    }
  };

  // Tab is trapped within the open pane; its Escape owner is above.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !paneRef.current) return;
    const nodes = Array.from(
      paneRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((n) => n.offsetParent !== null && n.tabIndex >= 0);
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
    edit({ intent: null, sub: null, cat: null });
  };
  const pickIntent = (id: IntentId) => {
    haptic("light");
    edit({ intent: draft.intent === id ? null : id, sub: null, cat: null });
  };
  const pickSub = (id: string) => {
    haptic("light");
    edit({ sub: draft.sub === id ? null : id, cat: null });
  };
  const pickCategory = (id: string | null) => {
    haptic("light");
    edit({ cat: draft.cat === id ? null : id, intent: null, sub: null });
  };
  const pickPreset = (preset: (typeof WHEN_PRESETS)[number]) => {
    haptic("light");
    const selected = activePreset === preset.key;
    applyFilters({ ...filters, lens: selected ? "all" : preset.lens, tod: selected ? null : preset.tod, day: null }, false);
  };
  const pickDay = (key: string | null) => edit(key ? { day: key, lens: "all", tod: null } : { day: null });
  const jumpNextWeekend = () => {
    haptic("light");
    edit({ lens: "weekend", tod: null, day: null });
  };
  const closeMobileDisplay = () => closeDisplay(mobileDisplayRef.current);
  const viewLabel = VIEW_ITEMS.find((item) => item.key === view)?.label ?? "List";
  const sortLabel = SORT_OPTIONS.find((item) => item.key === sort)?.label ?? "Recommended";

  return (
    <div data-events-scoped={Boolean(town || whereLabel) || undefined} className={`eb-dock ${props.photoOverview ? styles.overview : ""}${collapsed ? " eb-collapsed" : ""}${pane ? " eb-open" : ""}`}>
      <h1 className="sr-only">Events in Frederick County</h1>
      <div className="eb-head backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--app-bg-elevated)]/85" style={{ background: "var(--app-bg-elevated-solid)" }}>
        {/* The almanac nameplate — collapses to zero on scroll. */}
        <div className="eb-masthead" aria-hidden={collapsed}>
          <div className="eb-dateline">
            {dlWeekday} &middot; {dlDate}
          </div>
          <h2 className="eb-title font-serif">
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
              preset={p.key}
              on={activePreset === p.key}
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
            ref={filterTriggerRef}
            aria-expanded={pane !== null}
            aria-controls="eb-pane"
            aria-haspopup="dialog"
            className="eb-filter-trigger"
            onClick={() => toggle(pane ?? firstActivePane)}
          >
            <SlidersHorizontal className="h-[16px] w-[16px] shrink-0" strokeWidth={2.2} aria-hidden />
            <span className={`eb-filter-copy ${styles.copy}`} aria-hidden>
              <span className="eb-filter-label">Filters</span>
              <span className={styles.context} data-scope-selected={Boolean(town || whereLabel) || undefined}>
                <span data-event-filter-time>{when.text}</span>
                <span aria-hidden>·</span>
                <span data-event-filter-scope>{whereText}</span>
              </span>
              {whatActive && (
                <span className={styles.query}>{q.trim() ? `“${q.trim()}”` : what.text}</span>
              )}
            </span>
            <span className="sr-only">Filters {filterSummary}</span>
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

        {/* The sub bar holds view and order: one native disclosure on mobile,
            the same controls inline on desktop. Neither surface puts a control
            wall in front of the first event. The result count is not printed
            above the first event (counts are support, not the headline); it
            stays a polite live region so filter changes are still announced,
            and a partial collection keeps a short visible notice. */}
        <div ref={toolbarRef} className={`eb-subbar ${styles.toolbar}`} data-filter-paused={paneOpen ? "true" : undefined} aria-hidden={paneOpen ? true : undefined}>
          <span className="eb-countline sr-only" aria-live="polite">
            {line}
          </span>
          {countComplete === false && (
            <span className="eb-partial" data-events-partial aria-hidden="true">Partial results</span>
          )}
          <details
            ref={mobileDisplayRef}
            className="eb-display-options"
            onToggle={(event) => setDisplayOpen(event.currentTarget.open)}
            // Focus moving on to another control closes the panel, as it does
            // for the Order menu. Safari does not focus a button on press; it
            // reports no target, or parks focus on the focusable <main> around
            // this dock. Neither is a reason to close.
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (next instanceof Node && !event.currentTarget.contains(next) && !next.contains(event.currentTarget)) closeDisplay(event.currentTarget, false);
            }}
          >
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
                align="left"
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
      <div ref={scrimRef} className={`eb-scrim${pane ? " on" : ""}`} onClick={closePane} aria-hidden />

      {/* The top-sheet pane — drops DOWN over the scrim-dimmed list. */}
      <div
        className={`eb-pane ${styles.pane}`}
        id="eb-pane"
        role="dialog"
        aria-modal={paneOpen ? true : undefined}
        aria-label="Event filters"
        aria-hidden={pane === null}
        // Collapsed via max-height:0 (not display:none), so without `inert` a
        // keyboard user still Tabs onto the hidden Cancel button (2026-07
        // shell-hardening P3). inert removes the whole pane from tab order +
        // the a11y tree while closed.
        inert={pane === null}
        ref={paneRef}
        onKeyDown={onPaneKeyDown}
      >
        <div className={`eb-pane-scroll ${styles.scroll}`}>
          <div className="dock-pane-head">
            <span className="dock-pane-title font-serif">Filters</span>
            <button type="button" className="dock-done" onClick={closePane}>
              Cancel
            </button>
          </div>
          <div className="eb-pane-tabs" role="tablist" aria-label="Event filter sections" onKeyDown={(event) => {
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            tabs[next].focus();
            tabs[next].click();
          }}>
            {(["what", "when", "where"] as const).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                id={`eb-tab-${section}`}
                aria-controls={pane === section ? `eb-panel-${section}` : undefined}
                tabIndex={pane === section ? 0 : -1}
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
            <div role="tabpanel" id="eb-panel-what" aria-labelledby="eb-tab-what">
              <label className="eb-filterfield">
                <Search className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} aria-hidden />
                <input
                  value={draft.q}
                  onChange={(e) => edit({ q: e.target.value })}
                  placeholder="Filter these events…"
                  aria-label="Filter the events shown"
                />
              </label>

              <Sect>Cost</Sect>
              <div className="eb-chips" role="group" aria-label="Event cost">
                <EbChip on={!draft.freeOnly} onClick={() => { haptic("light"); edit({ freeOnly: false }); }}>
                  Any price
                </EbChip>
                <EbChip on={draft.freeOnly} onClick={() => { haptic("light"); edit({ freeOnly: !draft.freeOnly }); }}>
                  Free
                </EbChip>
              </div>

              <Sect>Interest</Sect>
              {/* Interests are compact filter chips like every other group in
                  this pane, not tall boxed tiles. */}
              <div className="eb-chips" role="group" aria-label="Event interests">
                <EbChip
                  on={!draft.intent && !draft.cat && !draft.sub}
                  onClick={pickEverything}
                >
                  Any interest
                </EbChip>
                {EVENT_INTENTS.map((item) => {
                  const Icon = INTENT_ICONS[item.icon];
                  return (
                    <EbChip
                      key={item.id}
                      on={draft.intent === item.id}
                      color={item.tucked ? "var(--app-civic)" : "var(--app-brand)"}
                      onClick={() => pickIntent(item.id)}
                      icon={Icon}
                    >
                      {item.label}
                    </EbChip>
                  );
                })}
              </div>

              {draftIntent?.subs?.length ? (
                <>
                  <Sect>Narrow {draftIntent.label}</Sect>
                  <div className="eb-chips" role="group" aria-label={`${draftIntent.label} categories`}>
                    {draftIntent.subs.map((item) => (
                      <EbChip
                        key={item.slug}
                        on={draft.sub === item.slug}
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
                <EbChip on={draft.kidsOnly} color="var(--app-accent)" onClick={() => { haptic("light"); edit({ kidsOnly: !draft.kidsOnly }); }}>
                  Kid-friendly
                </EbChip>
                <EbChip
                  on={draft.lgbtqOnly}
                  color="var(--app-accent)"
                  ariaLabel="LGBTQ+ community events"
                  onClick={() => { haptic("light"); edit({ lgbtqOnly: !draft.lgbtqOnly }); }}
                >
                  LGBTQ+
                </EbChip>
                <EbChip
                  on={draft.communicationAccessOnly}
                  color="var(--app-accent)"
                  ariaLabel="Events for the Deaf community or with confirmed communication access"
                  onClick={() => {
                    haptic("light");
                    edit({ communicationAccessOnly: !draft.communicationAccessOnly });
                  }}
                >
                  Deaf community &amp; access
                </EbChip>
                <EbChip on={draft.recurringOnly} color="var(--app-accent)" onClick={() => { haptic("light"); edit({ recurringOnly: !draft.recurringOnly }); }}>
                  Recurring
                </EbChip>
                <EbChip on={draft.happyOnly} color="var(--app-accent)" onClick={() => { haptic("light"); edit({ happyOnly: !draft.happyOnly }); }}>
                  Happy hour
                </EbChip>
              </div>

              {categories.length > 0 && (
                <details className="group mt-4 border-y" style={{ borderColor: "var(--app-border)" }}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-[var(--app-ink-2)]">
                    <span>
                      {draft.cat
                        ? `Category · ${categories.find((item) => item.slug === draft.cat)?.name ?? draft.cat}`
                        : "More specific categories"}
                    </span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 opacity-50 transition-transform group-open:rotate-180"
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </summary>
                  <div className="eb-chips border-t py-3" role="group" aria-label="Event categories" style={{ borderColor: "var(--app-border)" }}>
                    <EbChip on={!draft.cat && !draft.intent && !draft.sub} onClick={() => pickCategory(null)}>
                      Any category
                    </EbChip>
                    {categories.map((c) => (
                      <EbChip
                        key={c.slug}
                        on={draft.cat === c.slug}
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
            <div role="tabpanel" id="eb-panel-when" aria-labelledby="eb-tab-when">
              <Sect>Time</Sect>
              <div className="eb-chips">
                {WHEN_PRESETS.map((p) => (
                  <EbChip
                    key={p.key}
                    on={draftPreset === p.key}
                    color="var(--app-brand)"
                    onClick={() => { haptic("light"); edit({ day: null, lens: draftPreset === p.key ? "all" : p.lens, tod: draftPreset === p.key ? null : p.tod }); }}
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
                    on={draft.tod === d.key}
                    color="var(--app-cool)"
                    onClick={() => { haptic("light"); edit({ tod: draft.tod === d.key ? null : d.key }); }}
                  >
                    {d.label}
                  </EbChip>
                ))}
              </div>

              <Sect>Pick a day</Sect>
              <EventWeekRibbon
                nowISO={nowISO}
                countByDate={dayCounts}
                activeDay={draft.day}
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
                  value={draft.day ?? ""}
                  min={new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowISO))}
                  onChange={(e) => pickDay(e.target.value || null)}
                  className="ml-auto h-8 rounded-[var(--app-radius-sm)] border px-2 font-mono text-[12px]"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-ink)" }}
                />
              </label>

              <p className="dock-hint">
                Planning an event of your own?{" "}
                <Link href="/check-a-date" prefetch={false} style={{ color: "var(--app-link)", fontWeight: 600 }} onClick={(event) => {
                  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  historyLayer.leaveTo("/check-a-date");
                }}>
                  Check a date
                </Link>{" "}
                to see what&rsquo;s already scheduled.
              </p>
            </div>
          )}

          {/* ── WHERE ── */}
          {pane === "where" && (
            <div role="tabpanel" id="eb-panel-where" aria-labelledby="eb-tab-where">
              <Sect>Town</Sect>
              <div className="eb-chips">
                <EbChip on={!draft.town && (!whereLabel || Object.hasOwn(edits, "town"))} onClick={() => { haptic("light"); edit({ town: null }); }}>
                  Whole county
                </EbChip>
                {MUNICIPALITIES.map((m) => (
                  <EbChip
                    key={m.slug}
                    on={draft.town === m.slug}
                    color="var(--app-cool)"
                    onClick={() => { haptic("light"); edit({ town: draft.town === m.slug ? null : m.slug }); }}
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
        <div className={styles.actions}>
          <button type="button" onClick={applyDraft}>
            <span aria-live="polite" aria-atomic="true">{draftCount === null ? "Show results" : `Show ${draftCount} ${draftCount === 1 ? "event" : "events"}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
