"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  History,
  Landmark,
  List,
  MapPinned,
  MessageCircleQuestion,
  Pin,
  RadioTower,
  Route,
  Search,
  Sparkles,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import ToolDeckDialog from "@/components/nav/ToolDeckDialog";
import { TOOL_ICONS } from "@/components/tools/toolIcons";
import {
  RADIUS_TOOLS,
  type RadiusTool,
  type RadiusToolTone,
} from "@/data/radius-tools";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";
import { haptic } from "@/lib/haptics";
import { getHomeMuni } from "@/lib/personalize";
import { toolMatchesQuery } from "@/lib/search/toolQuery";
import { track } from "@/lib/track";
import { SIGNIFICANT_POWER_OUTAGE_CUSTOMERS } from "@/lib/pulse/signal-priority";
import {
  DEFAULT_TOOL_DECK_PIN_IDS,
  TOOL_DECK_GROUP_DEFINITIONS,
  TOOL_DECK_PIN_LIMIT,
  TOOL_DECK_PINS_KEY,
  normalizeToolDeckPins,
  type ToolDeckGroupId,
} from "./toolDeckModel";

const RECENT_TOOLS_KEY = "fr.compass.recent.v1";
export const ALL_COMPASS_TOOLS_ID = "all-tools";

export function compassShortcutGridClass(itemCount: number): string {
  if (itemCount <= 1) return "grid max-w-[6.25rem] grid-cols-1 gap-1";
  if (itemCount === 2) return "grid max-w-[12.75rem] grid-cols-2 gap-1";
  if (itemCount === 3) return "grid max-w-[19.25rem] grid-cols-3 gap-1";
  return "grid grid-cols-4 gap-1";
}

const TONE_COLOR: Record<RadiusToolTone, string> = {
  accent: "var(--app-accent-press)",
  brand: "var(--app-brand-press)",
  civic: "var(--app-civic)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

const GROUP_META: Record<
  ToolDeckGroupId,
  { icon: LucideIcon; color: string }
> = {
  decide: { icon: Sparkles, color: "var(--app-brand-press)" },
  food: { icon: UtensilsCrossed, color: "var(--app-accent-press)" },
  events: { icon: CalendarDays, color: "var(--app-brand-press)" },
  "getting-around": { icon: Route, color: "var(--app-cool)" },
  amenities: { icon: MapPinned, color: "var(--app-civic)" },
  live: { icon: RadioTower, color: "var(--app-brand-press)" },
  community: { icon: Landmark, color: "var(--app-civic)" },
  stories: { icon: History, color: "var(--app-accent-press)" },
  yours: { icon: Bookmark, color: "var(--app-positive)" },
};

const COMPASS_INTENT_DEFINITIONS = [
  {
    id: "go-out",
    label: "Find something to do",
    description: "Ask Radius or find food, drinks, events, and plans.",
    icon: UtensilsCrossed,
    groupIds: ["decide", "food", "events"],
  },
  {
    id: "get-around",
    label: "Get around",
    description: "Use the map, parking, transit, and current road information.",
    icon: Route,
    groupIds: ["getting-around"],
  },
  {
    id: "local-help",
    label: "Find local help",
    description: "Find public essentials, current alerts, contacts, and emergency help.",
    icon: MapPinned,
    groupIds: ["amenities", "live", "community"],
  },
  {
    id: "explore-yours",
    label: "Explore Frederick",
    description: "Browse towns, history, local data, and the places you saved.",
    icon: Landmark,
    groupIds: ["stories", "yours"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  groupIds: readonly ToolDeckGroupId[];
}>;

type CompassIntentId = (typeof COMPASS_INTENT_DEFINITIONS)[number]["id"];
type CompassDeckView = ToolDeckGroupId | CompassIntentId | "all";

function isCompassIntentId(value: string): value is CompassIntentId {
  return COMPASS_INTENT_DEFINITIONS.some((intent) => intent.id === value);
}

export type DirectoryItem = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  keywords?: string[];
  /** Off-app destination: opens in a new tab with the standard rel guard. */
  external?: boolean;
};

export type ToolDeckGroup = {
  id: ToolDeckGroupId;
  label: string;
  description: string;
  items: DirectoryItem[];
};

export type ToolDeckDirectory = {
  id: typeof ALL_COMPASS_TOOLS_ID;
  label: "All tools";
  total: number;
  groups: ToolDeckGroup[];
};

/**
 * A destination appears once in the directory even if two registry records
 * temporarily point at it. Keep the first, deliberately placed item so a
 * registry alias cannot produce repeated rows across different chapters.
 */
export function dedupeToolDeckGroupsByHref(
  groups: ToolDeckGroup[],
): ToolDeckGroup[] {
  const seen = new Set<string>();
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    }),
  }));
}

type LinkIntentProps = Pick<
  ComponentProps<typeof Link>,
  "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick"
>;

function toDirectoryItem(tool: RadiusTool): DirectoryItem {
  return {
    id: tool.id,
    href: tool.href,
    label: tool.label,
    description: tool.description,
    icon: TOOL_ICONS[tool.icon],
    color: TONE_COLOR[tool.tone],
    keywords: tool.keywords,
    external: tool.external,
  };
}

/** Anchor attributes for an off-app tool; {} for in-app destinations so the
 *  Link renders exactly as before. */
function externalLinkProps(item: Pick<DirectoryItem, "external">) {
  return item.external
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : ({} as const);
}

const ASK_RADIUS: DirectoryItem = {
  id: "ask-radius",
  href: "/ask",
  label: "Ask Radius",
  description: "Get help choosing, planning, or finding the right local answer.",
  icon: MessageCircleQuestion,
  color: "var(--app-brand-press)",
  keywords: ["ask", "help me choose", "plan", "recommendation"],
};

const TIME_MACHINE: DirectoryItem = {
  id: "time-machine",
  href: "/from-above/time-machine",
  label: "Time Machine",
  description: "Scrub a block through decades of aerial imagery.",
  icon: History,
  color: "var(--app-cool)",
  keywords: ["time machine", "aerial", "historic imagery"],
};

/**
 * The tools directory has one resident-facing organization. It resolves every row
 * from the shared registry, then places Ask Radius at the decision front door.
 */
export function buildToolDeckGroups(homeSlug: string | null): ToolDeckGroup[] {
  const itemById = new globalThis.Map(
    RADIUS_TOOLS.map((tool) => [tool.id, toDirectoryItem(tool)]),
  );
  itemById.set(ASK_RADIUS.id, ASK_RADIUS);

  if (!homeSlug) {
    const settings = itemById.get("settings");
    if (settings) {
      itemById.set("settings", {
        ...settings,
        label: "Choose your home town",
        description: "Choose a home area for nearby results and local shortcuts.",
      });
    }
  }

  const groups = TOOL_DECK_GROUP_DEFINITIONS.map((definition) => {
    const items = definition.toolIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [item] : [];
    });
    if (
      definition.id === "stories" &&
      CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED
    ) {
      items.push(TIME_MACHINE);
    }
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      items,
    };
  });

  // The group model is intentionally curated, but a newly registered tool
  // must never disappear while that model catches up. Keep unassigned tools
  // reachable in Community services; this currently preserves the
  // communication-access guide and also makes future registry additions
  // fail safe instead of becoming search dead ends.
  const assignedIds = new Set(
    groups.flatMap((group) => group.items.map((item) => item.id)),
  );
  const unassigned = RADIUS_TOOLS.flatMap((tool) => {
    if (assignedIds.has(tool.id)) return [];
    const item = itemById.get(tool.id);
    return item ? [item] : [];
  });
  const completeGroups = unassigned.length === 0
    ? groups
    : groups.map((group) =>
        group.id === "community"
          ? { ...group, items: [...group.items, ...unassigned] }
          : group,
      );

  return dedupeToolDeckGroupsByHref(completeGroups);
}

export function buildToolDeckDirectory(
  groups: ToolDeckGroup[],
): ToolDeckDirectory {
  return {
    id: ALL_COMPASS_TOOLS_ID,
    label: "All tools",
    total: groups.reduce((total, group) => total + group.items.length, 0),
    groups,
  };
}

export function searchToolDeckGroups(
  groups: ToolDeckGroup[],
  query: string,
): ToolDeckGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        toolMatchesQuery(item, normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function commonCompassTasks(
  groups: ToolDeckGroup[],
): DirectoryItem[] {
  const byId = new globalThis.Map(
    groups.flatMap((group) => group.items).map((item) => [item.id, item]),
  );
  return DEFAULT_TOOL_DECK_PIN_IDS.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export type CompassLiveSuggestion = {
  itemId: "county-pulse" | "transit" | "events";
  label: string;
  href: string;
  reason: string;
  eyebrow: "Needs attention" | "Moving now" | "On today";
};

type DeckLiveFace = { value: string; label: string };
type DeckLiveKey = { id: string; status: string; faces: DeckLiveFace[] };

function numericFaceValue(face: DeckLiveFace | undefined): number | null {
  if (!face) return null;
  const normalized = face.value.replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function activeCount(
  key: DeckLiveKey | undefined,
  labelPattern: RegExp,
): number {
  if (key?.status !== "ok") return 0;
  const face = key.faces.find((candidate) => labelPattern.test(candidate.label));
  return numericFaceValue(face) ?? 0;
}

/**
 * Choose one live interruption for Compass. Ordinary readings do not elbow
 * out the daypart suggestion: only a condition that changes a resident's next
 * move earns the slot. Commute-hour transit is the one lower-severity
 * exception because a moving vehicle is useful only while someone is likely
 * deciding how to travel.
 */
export function liveSuggestionForDeck(
  keys: readonly DeckLiveKey[],
  hour: number,
): CompassLiveSuggestion | null {
  const byId = new Map(keys.map((key) => [key.id, key] as const));
  const candidates: Array<CompassLiveSuggestion & { priority: number }> = [];

  const weatherAlerts = activeCount(byId.get("weather"), /active alerts?/i);
  if (weatherAlerts > 0) {
    candidates.push({
      itemId: "county-pulse",
      label: weatherAlerts === 1 ? "Weather alert" : "Weather alerts",
      href: "/pulse?open=weather",
      reason: `${weatherAlerts} ${weatherAlerts === 1 ? "weather alert is" : "weather alerts are"} active for Frederick County.`,
      eyebrow: "Needs attention",
      priority: 500,
    });
  }

  const schoolNotices = activeCount(
    byId.get("schools"),
    /closures?|delays?/i,
  );
  if (schoolNotices > 0) {
    candidates.push({
      itemId: "county-pulse",
      label: schoolNotices === 1 ? "School notice" : "School notices",
      href: "/pulse?open=schools",
      reason: `${schoolNotices} FCPS ${schoolNotices === 1 ? "closure or delay is" : "closures or delays are"} posted.`,
      eyebrow: "Needs attention",
      priority: 400,
    });
  }

  const customersOut = activeCount(byId.get("power"), /customers? out/i);
  if (customersOut >= SIGNIFICANT_POWER_OUTAGE_CUSTOMERS) {
    candidates.push({
      itemId: "county-pulse",
      label: "Power outages",
      href: "/pulse?open=power",
      reason: `${customersOut.toLocaleString()} ${customersOut === 1 ? "customer is" : "customers are"} without power in the county.`,
      eyebrow: "Needs attention",
      priority: 300,
    });
  }

  const roadIncidents = activeCount(byId.get("traffic"), /incidents?/i);
  if (roadIncidents > 0) {
    candidates.push({
      itemId: "county-pulse",
      label: roadIncidents === 1 ? "Road incident" : "Road incidents",
      href: "/pulse?open=traffic",
      reason: `MDOT is reporting ${roadIncidents} open ${roadIncidents === 1 ? "incident" : "incidents"} in Frederick County.`,
      eyebrow: "Needs attention",
      priority: 200,
    });
  }

  const commuteHour = (hour >= 6 && hour < 10) || (hour >= 15 && hour < 19);
  const busesMoving = activeCount(byId.get("buses"), /buses? moving/i);
  if (commuteHour && busesMoving > 0) {
    candidates.push({
      itemId: "transit",
      label: "Live transit",
      href: "/transit",
      reason: `${busesMoving} ${busesMoving === 1 ? "bus is" : "buses are"} reporting a live position now.`,
      eyebrow: "Moving now",
      priority: 100,
    });
  }

  return candidates.sort((a, b) => b.priority - a.priority)[0] ?? null;
}

/**
 * Compass gives its one recommendation slot only to something the live deck
 * can prove. Serious conditions still interrupt first. An ordinary Events
 * card appears only after the event key confirms inventory for today; an
 * empty or unavailable feed leaves the slot out instead of dressing a
 * daypart guess up as local intelligence.
 */
export function groundedCompassSuggestion(
  keys: readonly DeckLiveKey[],
  hour: number,
): CompassLiveSuggestion | null {
  const interruption = liveSuggestionForDeck(keys, hour);
  if (interruption) return interruption;

  const eventsToday = activeCount(
    keys.find((key) => key.id === "events"),
    /on today/i,
  );
  if (eventsToday <= 0) return null;
  return {
    itemId: "events",
    label: "Events",
    href: "/events?when=today",
    reason: `${eventsToday} ${eventsToday === 1 ? "event is" : "events are"} still on today.`,
    eyebrow: "On today",
  };
}

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

function deckParamFromLocation(): CompassDeckView | null {
  const value = new URL(window.location.href).searchParams.get("deck");
  if (value === "all") return value;
  if (value && isCompassIntentId(value)) return value;
  return TOOL_DECK_GROUP_DEFINITIONS.some((group) => group.id === value)
    ? (value as ToolDeckGroupId)
    : null;
}

function writeDeckUrl(
  value: CompassDeckView,
  mode: "push" | "replace",
) {
  const url = new URL(window.location.href);
  url.searchParams.set("deck", value);
  const currentState =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  const nextState = { ...currentState } as Record<string, unknown>;
  if (mode === "push" || nextState.frToolDeck === true) {
    nextState.frToolDeck = true;
  } else {
    delete nextState.frToolDeck;
  }
  window.history[mode === "push" ? "pushState" : "replaceState"](
    nextState,
    "",
    url,
  );
}

function clearDeckUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("deck");
  const currentState =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  const nextState = { ...currentState } as Record<string, unknown>;
  delete nextState.frToolDeck;
  window.history.replaceState(nextState, "", url);
}

export default function CompassHub() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(
    subscribeHomeTown,
    getHomeMuni,
    noHomeTown,
  );
  const groups = useMemo(() => buildToolDeckGroups(homeSlug), [homeSlug]);
  const directory = useMemo(() => buildToolDeckDirectory(groups), [groups]);
  const itemById = useMemo(
    () =>
      new globalThis.Map(
        groups.flatMap((group) =>
          group.items.map((item) => [item.id, item] as const),
        ),
      ),
    [groups],
  );
  const availableIds = useMemo(
    () => new Set(itemById.keys()),
    [itemById],
  );

  const [query, setQuery] = useState("");
  const [deckView, setDeckView] = useState<CompassDeckView | null>(null);
  const [editingPins, setEditingPins] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([
    ...DEFAULT_TOOL_DECK_PIN_IDS,
  ]);
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [pinNotice, setPinNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const deckLiveKeys = useDeckLiveKeys();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedPins = JSON.parse(
          window.localStorage.getItem(TOOL_DECK_PINS_KEY) ?? "null",
        ) as unknown;
        setPinnedIds(normalizeToolDeckPins(storedPins, availableIds));
      } catch {
        setPinnedIds(normalizeToolDeckPins(null, availableIds));
      }

      try {
        const storedRecent = JSON.parse(
          window.localStorage.getItem(RECENT_TOOLS_KEY) ?? "[]",
        ) as unknown;
        setRecentHrefs(
          Array.isArray(storedRecent)
            ? storedRecent
                .filter((item): item is string => typeof item === "string")
                .slice(0, 5)
            : [],
        );
      } catch {
        setRecentHrefs([]);
      }

      setDeckView(deckParamFromLocation());
      setHydrated(true);
    }, 0);

    const onPopState = () => {
      setDeckView(deckParamFromLocation());
      setEditingPins(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPopState);
    };
  }, [availableIds]);

  const warm = (href: string) => router.prefetch(href);

  const rememberTool = (item: DirectoryItem) => {
    track("compass_tool_open", { tool: item.id });
    setRecentHrefs((current) => {
      const next = [
        item.href,
        ...current.filter((href) => href !== item.href),
      ].slice(0, 5);
      try {
        window.localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
      } catch {
        // Recent tools remain useful for this page when storage is blocked.
      }
      return next;
    });
  };

  const intentProps = (item: DirectoryItem): LinkIntentProps => ({
    onMouseEnter: () => warm(item.href),
    onFocus: () => warm(item.href),
    onPointerDown: () => warm(item.href),
    onClick: () => rememberTool(item),
  });

  const togglePin = (item: DirectoryItem) => {
    setPinNotice("");
    const pinned = pinnedIds.includes(item.id);
    if (!pinned && pinnedIds.length >= TOOL_DECK_PIN_LIMIT) {
      haptic("warning");
      setPinNotice(
        `You can pin ${TOOL_DECK_PIN_LIMIT} tools. Unpin one before adding ${item.label}.`,
      );
      return;
    }

    const next = pinned
      ? pinnedIds.filter((id) => id !== item.id)
      : [...pinnedIds, item.id];
    setPinnedIds(next);
    try {
      window.localStorage.setItem(TOOL_DECK_PINS_KEY, JSON.stringify(next));
    } catch {
      // Pins still work for this page when device storage is blocked.
    }
    haptic(pinned ? "light" : "success");
    track("compass_pin_toggle", { tool: item.id, on: !pinned });
    setPinNotice(
      pinned ? `${item.label} unpinned.` : `${item.label} pinned.`,
    );
  };

  const openDeck = (view: CompassDeckView, managePins = false) => {
    haptic("light");
    setEditingPins(managePins);
    setDeckView(view);
    writeDeckUrl(view, "push");
  };

  const changeDeckView = (view: CompassDeckView) => {
    haptic("light");
    setDeckView(view);
    writeDeckUrl(view, "replace");
  };

  const closeDeck = () => {
    setDeckView(null);
    setEditingPins(false);
    if (
      window.history.state &&
      typeof window.history.state === "object" &&
      window.history.state.frToolDeck === true
    ) {
      window.history.back();
    } else {
      clearDeckUrl();
    }
  };

  const pinnedItems = pinnedIds.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });
  // Noon is the stable server/first-client snapshot. Once local settings are
  // hydrated, the row quietly changes to the device's current daypart.
  const localHour = hydrated ? new Date().getHours() : 12;
  const contextualSuggestion = groundedCompassSuggestion(
    deckLiveKeys,
    localHour,
  );
  const contextualBaseItem = contextualSuggestion
    ? itemById.get(contextualSuggestion.itemId) ?? null
    : null;
  const contextualItem = contextualBaseItem && contextualSuggestion
    ? {
        ...contextualBaseItem,
        label: contextualSuggestion.label ?? contextualBaseItem.label,
        href: contextualSuggestion.href ?? contextualBaseItem.href,
      }
    : null;
  // A live suggestion can point at a default shortcut. Let the evidence-rich
  // suggestion own that destination instead of drawing the same href twice.
  const displayedPinnedItems = contextualItem
    ? pinnedItems.filter((item) => item.href !== contextualItem.href)
    : pinnedItems;
  const visibleDestinationHrefs = new Set([
    ...displayedPinnedItems.map((item) => item.href),
    ...(contextualItem ? [contextualItem.href] : []),
    "/today",
    "/map",
    "/events",
    "/my-radius",
  ]);
  const allKnownItems = directory.groups.flatMap((group) => group.items);
  const itemByHref = new globalThis.Map(
    allKnownItems.map((item) => [item.href, item]),
  );
  const recentItems = recentHrefs
    .flatMap((href) => {
      const item = itemByHref.get(href);
      return item && !visibleDestinationHrefs.has(href) ? [item] : [];
    })
    .slice(0, 3);

  const visibleGroups = searchToolDeckGroups(groups, query);
  const searchItems = visibleGroups.flatMap((group) => group.items);
  const normalizedQuery = query.trim();

  const selectedIntent =
    deckView && deckView !== "all" && isCompassIntentId(deckView)
      ? COMPASS_INTENT_DEFINITIONS.find((intent) => intent.id === deckView) ?? null
      : null;
  const selectedGroup =
    deckView && deckView !== "all" && !isCompassIntentId(deckView)
      ? groups.find((group) => group.id === deckView) ?? null
      : null;
  const selectedIntentGroups = selectedIntent
    ? selectedIntent.groupIds.flatMap(
        (groupId) => {
          const group = groups.find((candidate) => candidate.id === groupId);
          return group ? [group] : [];
        },
      )
    : [];
  return (
    <div
      className="space-y-5"
      data-compass-ready={hydrated ? "true" : "false"}
    >
      {/* Title and search sit directly on Cream — the canvas, not a slab.
          The border-b is the one boundary the header keeps. */}
      <header
        className="-mx-4 -mt-4 border-b px-4 pb-4 pt-4 sm:-mx-5 sm:-mt-6 sm:px-5 sm:pt-5 lg:mx-0 lg:mt-0"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div>
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Compass
          </p>
          <h1 className="font-editorial mt-1 text-[34px] leading-[0.98] tracking-[-0.03em] sm:text-[38px]">
            What do you need?
          </h1>
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Search all Radius tools</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <input
              type="text"
              role="searchbox"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try parking, live music, a restroom…"
              className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] py-2.5 pl-10 pr-11 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-ink)",
              }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear tool search"
                className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </span>
        </label>
      </header>

      {normalizedQuery ? (
        <ToolSearchResults
          query={normalizedQuery}
          items={searchItems}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          intentProps={intentProps}
        />
      ) : (
        <>
          {contextualItem && contextualSuggestion ? (
            <ContextualToolSuggestion
              item={contextualItem}
              reason={contextualSuggestion.reason}
              eyebrow={contextualSuggestion.eyebrow}
              intentProps={intentProps}
            />
          ) : null}

          <PinnedTools
            items={displayedPinnedItems}
            intentProps={intentProps}
            onManage={() => openDeck("all", true)}
          />

          {recentItems.length > 0 ? (
            <RecentTools items={recentItems} intentProps={intentProps} />
          ) : null}

          <CompassIntentBoard
            intents={COMPASS_INTENT_DEFINITIONS}
            onOpen={openDeck}
            liveKeys={deckLiveKeys}
          />
        </>
      )}

      <ToolDeckDialog
        open={deckView !== null}
        title={
          selectedIntent?.label ??
          selectedGroup?.label ??
          (editingPins ? "Edit shortcuts" : "All tools")
        }
        description={
          editingPins
            ? `Pin up to ${TOOL_DECK_PIN_LIMIT} tools for quick access on this device.`
            : selectedIntent?.description ??
              selectedGroup?.description ??
              "Browse the complete directory by category or search for a specific tool."
        }
        onClose={closeDeck}
      >
        <div className="space-y-4 py-4">
          {selectedGroup || selectedIntent ? (
            <button
              type="button"
              onClick={() => changeDeckView("all")}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              All tools
            </button>
          ) : null}

          {editingPins ? (
            <p
              aria-live="polite"
              className={`min-h-4 text-[12px] ${pinNotice ? "" : "sr-only"}`}
              style={{ color: "var(--app-ink-3)" }}
            >
              {pinNotice || "Pin changes will be announced here."}
            </p>
          ) : null}

          {editingPins ? (
            <DeckToolBrowser
              key="edit-shortcuts"
              groups={directory.groups}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              intentProps={intentProps}
              showPinControls
            />
          ) : selectedIntent ? (
            <DeckToolBrowser
              key={selectedIntent.id}
              groups={selectedIntentGroups}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              intentProps={intentProps}
            />
          ) : selectedGroup ? (
            <DeckToolBrowser
              key={selectedGroup.id}
              groups={[selectedGroup]}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              intentProps={intentProps}
            />
          ) : (
            <DeckToolBrowser
              key="all-tools"
              groups={directory.groups}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              intentProps={intentProps}
              showCategoryNav
            />
          )}
        </div>
      </ToolDeckDialog>
    </div>
  );
}

function PinnedTools({
  items,
  intentProps,
  onManage,
}: {
  items: DirectoryItem[];
  intentProps: (item: DirectoryItem) => LinkIntentProps;
  onManage: () => void;
}) {
  return (
    <section aria-labelledby="compass-pinned-heading" className="space-y-1.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2
          id="compass-pinned-heading"
          className="text-[15px] font-semibold tracking-[-0.01em]"
        >
          Shortcuts
        </h2>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--app-radius-sm)] px-2.5 text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Edit
        </button>
      </div>

      {items.length > 0 ? (
        <ul className={compassShortcutGridClass(items.length)}>
          {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link
                  href={item.href}
                  prefetch={false}
                  {...externalLinkProps(item)}
                  {...intentProps(item)}
                  className="tactile-interactive flex min-h-[72px] min-w-0 flex-col items-center justify-start gap-1.5 rounded-[var(--app-radius-md)] px-0.5 py-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                >
                  {/* The glyph in its own color, directly on Cream. The old
                      bordered-and-filled tile was a box inside a box: the
                      grid cell already bounds the target. */}
                  <span
                    className="grid h-9 w-9 place-items-center"
                    style={{ color: item.color }}
                  >
                    <item.icon
                      className="h-[19px] w-[19px]"
                      strokeWidth={2.05}
                      aria-hidden
                    />
                  </span>
                  <span className="line-clamp-2 max-w-full text-[11.5px] font-semibold leading-[1.2]">
                    {item.label}
                    {item.external ? (
                      <>
                        <ExternalLink
                          className="ml-1 inline-block h-3 w-3 align-[-0.1em]"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="sr-only"> Opens in a new tab.</span>
                      </>
                    ) : null}
                  </span>
                </Link>
              </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={onManage}
          className="min-h-20 w-full rounded-[var(--app-radius-md)] border px-4 text-left"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated-solid)",
          }}
        >
          <span className="block text-[13px] font-semibold">Choose your shortcuts</span>
          <span className="mt-1 block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Open all tools and pin the ones you use most.
          </span>
        </button>
      )}

    </section>
  );
}

function ContextualToolSuggestion({
  item,
  reason,
  eyebrow = "Useful right now",
  intentProps,
}: {
  item: DirectoryItem;
  reason: string;
  eyebrow?: string;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
}) {
  return (
    <section aria-labelledby="compass-suggestion-heading">
      <Link
        href={item.href}
        prefetch={false}
        {...externalLinkProps(item)}
        {...intentProps(item)}
        className="tactile-interactive group flex min-h-[64px] items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand) 24%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated-solid))",
        }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            color: "var(--app-brand-press)",
            background: "color-mix(in srgb, var(--app-brand) 10%, transparent)",
          }}
          aria-hidden
        >
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id="compass-suggestion-heading"
            className="block text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            {eyebrow}
          </span>
          <span className="mt-0.5 block text-[14px] font-semibold leading-tight">
            {item.label}
          </span>
          <span
            className="mt-0.5 block text-[12px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            {reason}
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.2}
          aria-hidden
        />
      </Link>
    </section>
  );
}

function RecentTools({
  items,
  intentProps,
}: {
  items: DirectoryItem[];
  intentProps: (item: DirectoryItem) => LinkIntentProps;
}) {
  return (
    <section aria-labelledby="compass-recent-heading" className="flex min-w-0 items-center gap-2.5">
      <h2
        id="compass-recent-heading"
        className="shrink-0 text-[12px] font-medium"
        style={{ color: "var(--app-ink-3)" }}
      >
        Recent
      </h2>
      <div className="relative min-w-0 flex-1">
        <ul className="flex min-w-0 snap-x snap-proximity gap-2 overflow-x-auto py-0.5 pr-7 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <li key={item.id} className="shrink-0 snap-start">
              <Link
                href={item.href}
                prefetch={false}
                {...externalLinkProps(item)}
                {...intentProps(item)}
                className="tactile-interactive inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)] px-3 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-ink)",
                }}
              >
                <item.icon
                  className="h-3.5 w-3.5"
                  style={{ color: item.color }}
                  strokeWidth={2}
                  aria-hidden
                />
                {item.label}
                {item.external ? (
                  <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[var(--app-bg)] to-transparent"
        />
      </div>
    </section>
  );
}

/**
 * One live fact per intent row, read from /api/deck after mount.
 *
 * Compass sits on top of eleven live feeds and used to state no live fact at
 * all — every row was a fixed registry sentence, which is why the page read
 * as a table of contents. This is deliberately ONE fetch, not the poll the
 * old DeckBoard ran: Compass is a navigation index a person passes through,
 * not a dashboard they leave open, and each upstream integration behind the
 * route carries its own revalidate window so the call is usually a cache
 * read. It is equally deliberately NOT awaited in the server component: the
 * route fans out to twelve integrations behind a 6s ceiling, and blocking a
 * navigation index on that would be a worse regression than the silence.
 *
 * Each intent names the deck keys that can speak for it. Active alerts,
 * closures, outages, and incidents outrank routine readings within that
 * family; equal readings keep the declared order. A key only speaks when its
 * feed answered (status "ok") and it has a face value. Otherwise the row
 * keeps its plain sentence — an honest absence, not a placeholder.
 */
const INTENT_LIVE_KEYS: Partial<Record<CompassIntentId, readonly string[]>> = {
  "go-out": ["events"],
  "get-around": ["buses", "traffic", "trains"],
  "local-help": ["weather", "power", "schools", "reports"],
  "explore-yours": ["news", "water"],
};

function deckKeyImportance(key: DeckLiveKey): number {
  if (key.status !== "ok") return Number.NEGATIVE_INFINITY;

  const activePriority: Partial<Record<string, { pattern: RegExp; score: number }>> = {
    weather: { pattern: /active alerts?/i, score: 500 },
    schools: { pattern: /closures?|delays?/i, score: 400 },
    power: { pattern: /customers? out/i, score: 300 },
    traffic: { pattern: /incidents?/i, score: 200 },
  };
  const active = activePriority[key.id];
  if (active && activeCount(key, active.pattern) > 0) return active.score;

  // Routine readings remain useful context, but never outrank a condition
  // that changes the resident's next move.
  const routinePriority: Record<string, number> = {
    events: 90,
    buses: 80,
    trains: 70,
    reports: 60,
    news: 50,
    water: 40,
    weather: 30,
    traffic: 20,
    power: 10,
    schools: 0,
  };
  return routinePriority[key.id] ?? 0;
}

export function liveLineForIntent(
  intentId: CompassIntentId,
  keys: readonly DeckLiveKey[],
): string | null {
  const keyOrder = INTENT_LIVE_KEYS[intentId] ?? [];
  const rankedKeys = keyOrder
    .flatMap((keyId, order) => {
      const key = keys.find((candidate) => candidate.id === keyId);
      return key ? [{ key, order }] : [];
    })
    .sort(
      (a, b) =>
        deckKeyImportance(b.key) - deckKeyImportance(a.key) ||
        a.order - b.order,
    );

  for (const { key } of rankedKeys) {
    const face = key?.faces?.[0];
    if (key?.status === "ok" && face?.value && face.label) {
      const value = face.value.trim();
      const label = face.label.trim();
      if (label.toLocaleLowerCase().startsWith(value.toLocaleLowerCase())) {
        return label;
      }
      return /^\d+$/.test(value) ? `${value} ${label}` : `${value} · ${label}`;
    }
  }
  return null;
}

function useDeckLiveKeys(): readonly DeckLiveKey[] {
  const [keys, setKeys] = useState<readonly DeckLiveKey[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/deck", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { keys?: DeckLiveKey[] }) => {
        setKeys(Array.isArray(data.keys) ? data.keys : []);
      })
      .catch(() => {
        // The rows keep their registry sentences. A degraded deck costs the
        // page its live garnish, never its function.
      });
    return () => ctrl.abort();
  }, []);
  return keys;
}

function CompassIntentBoard({
  intents,
  onOpen,
  liveKeys,
}: {
  intents: typeof COMPASS_INTENT_DEFINITIONS;
  onOpen: (view: CompassDeckView, managePins?: boolean) => void;
  liveKeys: readonly DeckLiveKey[];
}) {
  const liveLines = Object.fromEntries(
    COMPASS_INTENT_DEFINITIONS.flatMap((intent) => {
      const line = liveLineForIntent(intent.id, liveKeys);
      return line ? [[intent.id, line]] : [];
    }),
  ) as Partial<Record<CompassIntentId, string>>;
  return (
    <section aria-labelledby="compass-browse-heading" className="space-y-2.5">
      <h2
        id="compass-browse-heading"
        className="text-[16px] font-semibold tracking-[-0.01em]"
      >
        Choose a direction
      </h2>

      {/* The four rows route intent. They do not preview another grid of tools;
          the directory appears only after a person deliberately chooses a
          direction or asks for All tools. */}
      <div className="overflow-hidden border-y" style={{ borderColor: "var(--app-border)" }}>
        {intents.map((intent) => (
          <button
            key={intent.id}
            type="button"
            onClick={() => onOpen(intent.id)}
            className="tactile-interactive flex min-h-[72px] w-full items-center gap-3 border-b px-1 py-2.5 text-left outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            <intent.icon
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                {intent.label}
              </span>
              <span
                className="mt-1 block text-[12px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {intent.description}
              </span>
              {liveLines[intent.id] ? (
                <span
                  className="mt-1 block text-[12px] font-medium tabular-nums leading-snug"
                  style={{ color: "var(--app-cool)" }}
                >
                  {liveLines[intent.id]}
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 opacity-45"
              strokeWidth={2.1}
              aria-hidden
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onOpen("all")}
        className="tactile-interactive flex min-h-11 w-full items-center gap-2 rounded-[var(--app-radius-md)] px-2 text-left text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        style={{ color: "var(--app-brand-press)" }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 9%, transparent)",
          }}
          aria-hidden
        >
          <List className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <span className="min-w-0 flex-1">
          All tools
          <span
            className="mt-0.5 block text-[11px] font-normal"
            style={{ color: "var(--app-ink-3)" }}
          >
            Browse the complete directory by category.
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          strokeWidth={2.1}
          aria-hidden
        />
      </button>
    </section>
  );
}

function ToolSearchResults({
  query,
  items,
  pinnedIds,
  onTogglePin,
  intentProps,
}: {
  query: string;
  items: DirectoryItem[];
  pinnedIds: string[];
  onTogglePin: (item: DirectoryItem) => void;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
}) {
  const queryHref = `/search?q=${encodeURIComponent(query)}`;
  const resolvedItems = items.map((item) =>
    item.id === "search"
      ? {
          ...item,
          href: queryHref,
          label: `Search Frederick for “${query.length > 28 ? `${query.slice(0, 27)}…` : query}”`,
        }
      : item,
  );

  return (
    <section aria-labelledby="compass-search-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="compass-search-heading"
          role="status"
          aria-live="polite"
          className="text-[17px] font-semibold tracking-[-0.01em]"
        >
          {resolvedItems.length} {resolvedItems.length === 1 ? "tool" : "tools"} for “{query}”
        </h2>
      </div>
      {resolvedItems.length > 0 ? (
        <ToolLedger
          items={resolvedItems}
          pinnedIds={pinnedIds}
          onTogglePin={onTogglePin}
          intentProps={intentProps}
          showPinControls
        />
      ) : (
        <EmptySearch query={query} />
      )}
      <CompassSearchActions
        query={query}
        matchedItems={resolvedItems}
        intentProps={intentProps}
      />
    </section>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <div
      className="rounded-[var(--app-radius-md)] border px-4 py-5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <p className="text-[13px] font-semibold">No tool is named “{query}.”</p>
      <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        Search Frederick itself or ask Radius in plain language.
      </p>
    </div>
  );
}

function CompassSearchActions({
  query,
  matchedItems,
  intentProps,
}: {
  query: string;
  matchedItems: DirectoryItem[];
  intentProps: (item: DirectoryItem) => LinkIntentProps;
}) {
  const searchItem: DirectoryItem = {
    id: "search-query",
    href: `/search?q=${encodeURIComponent(query)}`,
    label: `Search Frederick for “${query.length > 28 ? `${query.slice(0, 27)}…` : query}”`,
    description: "Search places, events, towns, guides, and tools.",
    icon: Search,
    color: "var(--app-brand-press)",
  };
  const askItem: DirectoryItem = {
    ...ASK_RADIUS,
    id: "ask-query",
    href: `/ask?q=${encodeURIComponent(query)}`,
    label: "Ask Radius about this",
  };
  const hasSearch = matchedItems.some(
    (item) => item.id === "search" || item.href.startsWith("/search?"),
  );
  const hasAsk = matchedItems.some(
    (item) => item.id === "ask-radius" || item.href === "/ask",
  );
  const alternateItems = [
    ...(hasSearch ? [] : [searchItem]),
    ...(hasAsk ? [] : [askItem]),
  ];

  if (alternateItems.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {alternateItems.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
          {...externalLinkProps(item)}
          {...intentProps(item)}
          className="tactile-interactive group flex min-h-[64px] items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <item.icon
            className="h-[18px] w-[18px] shrink-0"
            style={{ color: item.color }}
            strokeWidth={2.05}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-tight">
              {item.label}
            </span>
            <span
              className="mt-1 block line-clamp-1 text-[12px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {item.description}
            </span>
          </span>
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.2}
            aria-hidden
          />
        </Link>
      ))}
    </div>
  );
}

function DeckToolBrowser({
  groups,
  pinnedIds,
  onTogglePin,
  intentProps,
  showPinControls = false,
  showCategoryNav = false,
}: {
  groups: ToolDeckGroup[];
  pinnedIds: string[];
  onTogglePin: (item: DirectoryItem) => void;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
  showPinControls?: boolean;
  showCategoryNav?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const visibleGroups = searchToolDeckGroups(groups, filter);
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  const showGroupHeadings = groups.length > 1;

  return (
    <div className="space-y-4">
      {showCategoryNav && !filter ? (
        <nav
          aria-label="Tool categories"
          className="sticky top-0 z-10 -mx-1 border-b bg-[var(--app-bg-elevated-solid)] px-1 pb-2 pt-0.5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((group) => {
              const Icon = GROUP_META[group.id].icon;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    document
                      .getElementById(`compass-tools-${group.id}`)
                      ?.scrollIntoView({
                        behavior: window.matchMedia(
                          "(prefers-reduced-motion: reduce)",
                        ).matches
                          ? "auto"
                          : "smooth",
                        block: "start",
                      });
                  }}
                  className="tactile-interactive inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink-2)",
                    background: "var(--app-bg)",
                  }}
                >
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{ color: GROUP_META[group.id].color }}
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  {group.label}
                  <span
                    className="font-mono text-[10px] tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {group.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {total > 7 ? (
        <label className="block">
          <span className="sr-only">Search tools in this section</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <input
              type="search"
              role="searchbox"
              inputMode="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter these tools"
              className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] py-2.5 pl-10 pr-10 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-ink)",
              }}
            />
            {filter ? (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear section search"
                className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </span>
        </label>
      ) : null}

      {visibleGroups.length > 0 ? (
        visibleGroups.map((group) => (
          <section
            key={group.id}
            id={`compass-tools-${group.id}`}
            className="scroll-mt-14 space-y-2.5"
          >
            {showGroupHeadings ? (
              <div>
                <h3 className="text-[14px] font-semibold">{group.label}</h3>
                <p
                  className="mt-0.5 text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {group.description}
                </p>
              </div>
            ) : null}
            <ToolLedger
              items={group.items}
              pinnedIds={pinnedIds}
              onTogglePin={onTogglePin}
              intentProps={intentProps}
              showPinControls={showPinControls}
            />
          </section>
        ))
      ) : (
        <p
          role="status"
          className="rounded-[var(--app-radius-md)] border px-4 py-5 text-[13px] font-medium"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
          }}
        >
          No tools in this section match “{filter.trim()}.”
        </p>
      )}
    </div>
  );
}

function ToolLedger({
  items,
  pinnedIds,
  onTogglePin,
  intentProps,
  showPinControls = false,
}: {
  items: DirectoryItem[];
  pinnedIds: string[];
  onTogglePin: (item: DirectoryItem) => void;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
  showPinControls?: boolean;
}) {
  return (
    <ul
      className="divide-y border-y bg-[var(--app-bg-elevated-solid)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {items.map((item) => {
        const pinned = pinnedIds.includes(item.id);
        return (
          <li
            key={item.id}
            className="flex min-h-[64px] items-stretch"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Link
              href={item.href}
              prefetch={false}
              {...externalLinkProps(item)}
              {...intentProps(item)}
              className="tactile-interactive group flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center"
                style={{ color: item.color }}
                aria-hidden
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight">
                  {item.label}
                </span>
                <span
                  className="mt-0.5 block line-clamp-2 text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {item.description}
                </span>
              </span>
              {item.external ? (
                <>
                  <ExternalLink
                    className="h-4 w-4 shrink-0 opacity-55"
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  <span className="sr-only"> Opens in a new tab.</span>
                </>
              ) : (
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 opacity-30 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.2}
                  aria-hidden
                />
              )}
            </Link>
            {showPinControls ? (
              <button
                type="button"
                aria-label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
                aria-pressed={pinned}
                onClick={() => onTogglePin(item)}
                className="grid min-h-11 w-12 shrink-0 place-items-center self-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{
                  color: pinned
                    ? "var(--app-brand-press)"
                    : "var(--app-ink-3)",
                }}
              >
                <Pin
                  className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
