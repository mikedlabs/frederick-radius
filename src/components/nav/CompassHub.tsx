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
  Clock3,
  History,
  Home,
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
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";
import { haptic } from "@/lib/haptics";
import { getHomeMuni } from "@/lib/personalize";
import { toolMatchesQuery } from "@/lib/search/toolQuery";
import { track } from "@/lib/track";
import {
  DEFAULT_TOOL_DECK_PIN_IDS,
  TOOL_DECK_GROUP_DEFINITIONS,
  TOOL_DECK_PIN_LIMIT,
  TOOL_DECK_PINS_KEY,
  normalizeToolDeckPins,
  toolDeckMoment,
  type ToolDeckGroupId,
} from "./toolDeckModel";

const RECENT_TOOLS_KEY = "fr.compass.recent.v1";
export const ALL_COMPASS_TOOLS_ID = "all-tools";

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

export type DirectoryItem = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  keywords?: string[];
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
  };
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
 * The Tool Deck has one resident-facing organization. It resolves every row
 * from the shared registry, then places Ask Radius at the decision front door.
 * A home shortcut is deliberately kept outside this 60-tool count.
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

  return TOOL_DECK_GROUP_DEFINITIONS.map((definition) => {
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

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

function homeShortcut(homeSlug: string | null): DirectoryItem | null {
  if (!homeSlug) return null;
  const home = MUNICIPALITY_BY_SLUG[homeSlug];
  if (!home) return null;
  return {
    id: `home-${home.slug}`,
    href: `/m/${home.slug}`,
    label: home.name,
    description: "Open your home-area guide.",
    icon: Home,
    color: "var(--app-brand-press)",
    keywords: ["home", "my town", "home area"],
  };
}

function deckParamFromLocation(): ToolDeckGroupId | "all" | null {
  const value = new URL(window.location.href).searchParams.get("deck");
  if (value === "all") return value;
  return TOOL_DECK_GROUP_DEFINITIONS.some((group) => group.id === value)
    ? (value as ToolDeckGroupId)
    : null;
}

function writeDeckUrl(
  value: ToolDeckGroupId | "all",
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
  const shortcut = useMemo(() => homeShortcut(homeSlug), [homeSlug]);
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
  const [deckQuery, setDeckQuery] = useState("");
  const [deckView, setDeckView] = useState<
    ToolDeckGroupId | "all" | null
  >(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([
    ...DEFAULT_TOOL_DECK_PIN_IDS,
  ]);
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [momentClock, setMomentClock] = useState<Date | null>(null);
  const [pinNotice, setPinNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

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

      setMomentClock(new Date());
      setDeckView(deckParamFromLocation());
      setHydrated(true);
    }, 0);

    const onPopState = () => setDeckView(deckParamFromLocation());
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

  const openDeck = (view: ToolDeckGroupId | "all") => {
    haptic("light");
    setDeckQuery("");
    setDeckView(view);
    writeDeckUrl(view, "push");
  };

  const changeDeckView = (view: ToolDeckGroupId | "all") => {
    haptic("light");
    setDeckQuery("");
    setDeckView(view);
    writeDeckUrl(view, "replace");
  };

  const closeDeck = () => {
    setDeckView(null);
    setDeckQuery("");
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
  const pinnedHrefs = new Set(pinnedItems.map((item) => item.href));
  const allKnownItems = shortcut
    ? [shortcut, ...directory.groups.flatMap((group) => group.items)]
    : directory.groups.flatMap((group) => group.items);
  const itemByHref = new globalThis.Map(
    allKnownItems.map((item) => [item.href, item]),
  );
  const recentItems = recentHrefs
    .flatMap((href) => {
      const item = itemByHref.get(href);
      return item && !pinnedHrefs.has(href) ? [item] : [];
    })
    .slice(0, 3);

  const visibleGroups = searchToolDeckGroups(groups, query);
  const searchItems = visibleGroups.flatMap((group) => group.items);
  const normalizedQuery = query.trim();

  const moment = toolDeckMoment(momentClock);
  const usefulNow = moment.suggestions
    .filter((suggestion) => !pinnedIds.includes(suggestion.id))
    .flatMap((suggestion) => {
      const item = itemById.get(suggestion.id);
      return item ? [{ item, reason: suggestion.reason }] : [];
    })
    .slice(0, 3);

  const selectedGroup =
    deckView && deckView !== "all"
      ? groups.find((group) => group.id === deckView) ?? null
      : null;
  const dialogSearchGroups = searchToolDeckGroups(groups, deckQuery);
  const dialogSearchItems = dialogSearchGroups.flatMap(
    (group) => group.items,
  );

  return (
    <div
      className="space-y-7"
      data-compass-ready={hydrated ? "true" : "false"}
    >
      <header
        className="-mx-4 -mt-4 border-b px-4 pb-4 pt-4 sm:-mx-5 sm:-mt-6 sm:px-5 sm:pt-5 lg:mx-0 lg:mt-0 lg:rounded-[var(--app-radius-lg)] lg:border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated-solid)",
        }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Frederick Radius
            </p>
            <h1 className="mt-0.5 text-[28px] font-semibold leading-none tracking-[-0.035em]">
              Compass
            </h1>
          </div>
          <p
            className="hidden max-w-[290px] text-right text-[12px] leading-snug sm:block"
            style={{ color: "var(--app-ink-3)" }}
          >
            Your shortcuts, every Radius tool, and a quicker path to the right
            one.
          </p>
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
              type="search"
              role="searchbox"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search parking, buses, scanner, events…"
              className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] py-2.5 pl-10 pr-11 text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
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
          <PinnedTools
            items={pinnedItems}
            home={shortcut}
            pinNotice={pinNotice}
            intentProps={intentProps}
            onTogglePin={togglePin}
            onManage={() => openDeck("all")}
          />

          {recentItems.length > 0 ? (
            <RecentTools items={recentItems} intentProps={intentProps} />
          ) : null}

          <BrowseToolGroups
            directory={directory}
            onOpen={openDeck}
          />

          <UsefulNow
            label={moment.label}
            suggestions={usefulNow}
            intentProps={intentProps}
          />
        </>
      )}

      <ToolDeckDialog
        open={deckView !== null}
        title={selectedGroup?.label ?? "Tool Deck"}
        description={
          selectedGroup?.description ??
          `${directory.total} Radius tools in nine clear groups.`
        }
        onClose={closeDeck}
      >
        <div className="space-y-4 py-4">
          {selectedGroup ? (
            <button
              type="button"
              onClick={() => changeDeckView("all")}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              All groups
            </button>
          ) : null}

          <label className="block">
            <span className="sr-only">Search the Tool Deck</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
              <input
                type="search"
                value={deckQuery}
                onChange={(event) => setDeckQuery(event.target.value)}
                placeholder="Search all tools"
                className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] py-2.5 pl-10 pr-11 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{
                  borderColor: "var(--app-border)",
                  color: "var(--app-ink)",
                }}
              />
              {deckQuery ? (
                <button
                  type="button"
                  onClick={() => setDeckQuery("")}
                  aria-label="Clear Tool Deck search"
                  className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </span>
          </label>

          <p
            aria-live="polite"
            className={`min-h-4 text-[11px] ${pinNotice ? "" : "sr-only"}`}
            style={{ color: "var(--app-ink-3)" }}
          >
            {pinNotice || "Pin changes will be announced here."}
          </p>

          {deckQuery.trim() ? (
            dialogSearchItems.length > 0 ? (
              <ToolLedger
                items={dialogSearchItems}
                pinnedIds={pinnedIds}
                onTogglePin={togglePin}
                intentProps={intentProps}
              />
            ) : (
              <EmptySearch query={deckQuery.trim()} />
            )
          ) : selectedGroup ? (
            <ToolLedger
              items={selectedGroup.items}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              intentProps={intentProps}
            />
          ) : (
            <DeckGroupDirectory
              groups={directory.groups}
              onOpen={changeDeckView}
            />
          )}
        </div>
      </ToolDeckDialog>
    </div>
  );
}

function PinnedTools({
  items,
  home,
  pinNotice,
  intentProps,
  onTogglePin,
  onManage,
}: {
  items: DirectoryItem[];
  home: DirectoryItem | null;
  pinNotice: string;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
  onTogglePin: (item: DirectoryItem) => void;
  onManage: () => void;
}) {
  const visibleItems = home ? [home, ...items] : items;

  return (
    <section aria-labelledby="compass-pinned-heading" className="space-y-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div>
          <h2
            id="compass-pinned-heading"
            className="text-[16px] font-semibold tracking-[-0.01em]"
          >
            Your tools
          </h2>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Pin up to {TOOL_DECK_PIN_LIMIT}. They stay on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Manage
          <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => {
            const isHome = item.id.startsWith("home-");
            return (
              <article
                key={item.id}
                className="relative flex min-h-[104px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-elev-1)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Link
                  href={item.href}
                  prefetch={false}
                  {...intentProps(item)}
                  className="tactile-interactive group flex min-w-0 flex-1 flex-col justify-between p-3 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
                >
                  <item.icon
                    className="h-[19px] w-[19px]"
                    style={{ color: item.color }}
                    strokeWidth={2.05}
                    aria-hidden
                  />
                  <span className="mt-4 block min-w-0">
                    <span className="block truncate text-[13px] font-semibold leading-tight">
                      {item.label}
                    </span>
                    <span
                      className="mt-1 block truncate text-[10.5px] leading-tight"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {isHome ? "Home guide" : item.description}
                    </span>
                  </span>
                </Link>
                {!isHome ? (
                  <button
                    type="button"
                    aria-label={`Unpin ${item.label}`}
                    aria-pressed="true"
                    onClick={() => onTogglePin(item)}
                    className="grid h-11 w-11 shrink-0 place-items-center self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    <Pin className="h-3.5 w-3.5 fill-current" strokeWidth={2} aria-hidden />
                  </button>
                ) : (
                  <span
                    className="mr-2 mt-2 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em]"
                    style={{
                      color: "var(--app-brand-press)",
                      background:
                        "color-mix(in srgb, var(--app-brand) 9%, transparent)",
                    }}
                  >
                    Home
                  </span>
                )}
              </article>
            );
          })}
        </div>
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
          <span className="mt-1 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Open the Tool Deck and pin the tools you use most.
          </span>
        </button>
      )}

      <p
        aria-live="polite"
        className={pinNotice ? "text-[11px]" : "sr-only"}
        style={{ color: "var(--app-ink-3)" }}
      >
        {pinNotice || "Pin changes will be announced here."}
      </p>
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
        className="shrink-0 text-[11px] font-medium"
        style={{ color: "var(--app-ink-3)" }}
      >
        Recent
      </h2>
      <ul className="flex min-w-0 gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <Link
              href={item.href}
              prefetch={false}
              {...intentProps(item)}
              className="tactile-interactive inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated-solid)] px-3 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
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
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BrowseToolGroups({
  directory,
  onOpen,
}: {
  directory: ToolDeckDirectory;
  onOpen: (view: ToolDeckGroupId | "all") => void;
}) {
  return (
    <section aria-labelledby="compass-browse-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            id="compass-browse-heading"
            className="text-[16px] font-semibold tracking-[-0.01em]"
          >
            Browse tools
          </h2>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Everything is visible by purpose, not buried in menus.
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {directory.total} tools
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {directory.groups.map((group) => (
          <ToolGroupButton key={group.id} group={group} onOpen={onOpen} />
        ))}
        <button
          type="button"
          onClick={() => onOpen("all")}
          className="tactile tactile-interactive flex min-h-[112px] items-start gap-3 rounded-[var(--app-radius-md)] border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] lg:col-span-3 lg:min-h-20 lg:items-center"
          style={{
            borderColor: "var(--app-border-strong)",
            background:
              "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated-solid))",
          }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]"
            style={{
              color: "var(--app-brand-press)",
              background:
                "color-mix(in srgb, var(--app-brand) 10%, transparent)",
            }}
            aria-hidden
          >
            <List className="h-[18px] w-[18px]" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">All tools</span>
            <span
              className="mt-1 block text-[10.5px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              Search the full Tool Deck or choose a group.
            </span>
          </span>
          <span
            className="hidden font-mono text-[10px] tabular-nums lg:block"
            style={{ color: "var(--app-ink-3)" }}
          >
            {directory.total}
          </span>
          <ChevronRight
            className="mt-2 hidden h-4 w-4 shrink-0 lg:block"
            style={{ color: "var(--app-ink-3)" }}
            strokeWidth={2.1}
            aria-hidden
          />
        </button>
      </div>
    </section>
  );
}

function ToolGroupButton({
  group,
  onOpen,
}: {
  group: ToolDeckGroup;
  onOpen: (view: ToolDeckGroupId | "all") => void;
}) {
  const meta = GROUP_META[group.id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(group.id)}
      className="tactile tactile-interactive flex min-h-[112px] flex-col rounded-[var(--app-radius-md)] border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <Icon
          className="h-[18px] w-[18px]"
          style={{ color: meta.color }}
          strokeWidth={2.05}
          aria-hidden
        />
        <span
          className="font-mono text-[9px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {group.items.length}
        </span>
      </span>
      <span className="mt-auto block">
        <span className="block text-[12.5px] font-semibold leading-tight">
          {group.label}
        </span>
        <span
          className="mt-1 block line-clamp-2 text-[10px] leading-snug"
          style={{ color: "var(--app-ink-3)" }}
        >
          {group.description}
        </span>
      </span>
    </button>
  );
}

function UsefulNow({
  label,
  suggestions,
  intentProps,
}: {
  label: string;
  suggestions: Array<{ item: DirectoryItem; reason: string }>;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
}) {
  return (
    <section aria-labelledby="compass-useful-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock3
          className="h-4 w-4"
          style={{ color: "var(--app-accent-press)" }}
          strokeWidth={2}
          aria-hidden
        />
        <div>
          <h2
            id="compass-useful-heading"
            className="text-[15px] font-semibold tracking-[-0.01em]"
          >
            Useful now
          </h2>
          <p className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
            {label}. Based on Frederick time, not guessed live activity.
          </p>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {suggestions.map(({ item, reason }) => (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              {...intentProps(item)}
              className="tactile-interactive group flex min-h-[72px] items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <item.icon
                className="h-[18px] w-[18px] shrink-0"
                style={{ color: item.color }}
                strokeWidth={2}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold leading-tight">
                  {item.label}
                </span>
                <span
                  className="mt-1 block text-[10px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {reason}
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
      ) : (
        <p
          className="rounded-[var(--app-radius-md)] border px-3 py-3 text-[11px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
          }}
        >
          Your pinned tools already cover these suggestions.
        </p>
      )}
    </section>
  );
}

function DeckGroupDirectory({
  groups,
  onOpen,
}: {
  groups: ToolDeckGroup[];
  onOpen: (view: ToolDeckGroupId | "all") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map((group) => (
        <ToolGroupButton key={group.id} group={group} onOpen={onOpen} />
      ))}
    </div>
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
  return (
    <section aria-labelledby="compass-search-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="compass-search-heading"
          className="text-[17px] font-semibold tracking-[-0.01em]"
        >
          {items.length} {items.length === 1 ? "tool" : "tools"} for “{query}”
        </h2>
      </div>
      {items.length > 0 ? (
        <ToolLedger
          items={items}
          pinnedIds={pinnedIds}
          onTogglePin={onTogglePin}
          intentProps={intentProps}
        />
      ) : (
        <EmptySearch query={query} />
      )}
      <CompassSearchActions query={query} intentProps={intentProps} />
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
      <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Search Frederick itself or ask Radius in plain language.
      </p>
    </div>
  );
}

function CompassSearchActions({
  query,
  intentProps,
}: {
  query: string;
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

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[searchItem, askItem].map((item) => (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
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
            <span className="block text-[12px] font-semibold leading-tight">
              {item.label}
            </span>
            <span
              className="mt-1 block line-clamp-1 text-[10px]"
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

function ToolLedger({
  items,
  pinnedIds,
  onTogglePin,
  intentProps,
}: {
  items: DirectoryItem[];
  pinnedIds: string[];
  onTogglePin: (item: DirectoryItem) => void;
  intentProps: (item: DirectoryItem) => LinkIntentProps;
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
                  className="mt-0.5 block line-clamp-2 text-[10.5px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {item.description}
                </span>
              </span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 opacity-30 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.2}
                aria-hidden
              />
            </Link>
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
          </li>
        );
      })}
    </ul>
  );
}
