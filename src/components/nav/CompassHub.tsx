"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Compass,
  History,
  Landmark,
  List,
  Map,
  MapPin,
  MessageCircleQuestion,
  Search,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AMENITY_MAP_TOOLS,
  RADIUS_TOOL_GROUPS,
  type RadiusTool,
  type RadiusToolTone,
} from "@/data/radius-tools";
import { TOOL_ICONS } from "@/components/tools/toolIcons";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";
import { toolMatchesQuery } from "@/lib/search/toolQuery";
import { track } from "@/lib/track";

/** One Lucide component per registry icon key, so the directory renders
 *  straight from the shared RADIUS_TOOL_GROUPS instead of a hand-kept copy of
 *  the toolbox. The Record type makes the map complete-by-compiler: a new icon
 *  in the union that is missing here is a build error, not a runtime blank. */

const TONE_COLOR: Record<RadiusToolTone, string> = {
  accent: "var(--app-accent-press)",
  brand: "var(--app-brand-press)",
  civic: "var(--app-civic)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

type DirectoryItem = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** Extra words a resident might type to reach this item, folded into filter
   *  matching alongside the label and description. */
  keywords?: string[];
};

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

/** Feature-gated aerial surface. It is not part of the tool registry (that
 *  route is fail-closed behind a license flag, and the toolbox health checks
 *  require every registered tool to render), so it joins the county-data
 *  section here, behind the same flag. */
const TIME_MACHINE: DirectoryItem = {
  id: "time-machine",
  href: "/from-above/time-machine",
  label: "Time Machine",
  description: "Scrub a block through decades of aerial imagery.",
  icon: History,
  color: "var(--app-cool)",
  keywords: ["time machine", "aerial", "historic imagery"],
};

/** Ask is the decision gateway into the toolbox, not another tool inside one
 * subject group. Keeping it outside the registry avoids listing "Ask Radius"
 * inside Ask's own tool browser while still giving All tools one clear
 * starting action for someone who does not know which destination they need. */
const ASK_RADIUS: DirectoryItem = {
  id: "ask-radius",
  href: "/ask",
  label: "Ask Radius",
  description: "Get help choosing, planning, or finding the right local answer.",
  icon: MessageCircleQuestion,
  color: "var(--app-brand-press)",
  keywords: ["ask", "help me choose", "plan", "recommendation"],
};

type CompassSection = {
  id: string;
  label: string;
  items: DirectoryItem[];
};

export type CompassOutcome = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  sections: CompassSection[];
};

const COMPASS_OUTCOME_DEFINITIONS: ReadonlyArray<
  Omit<CompassOutcome, "sections"> & { sectionIds: readonly string[] }
> = [
  {
    id: "go-out",
    label: "Eat, drink, or go out",
    description: "Find food, drinks, events, and plans.",
    icon: UtensilsCrossed,
    color: "var(--app-brand-press)",
    sectionIds: ["eat-drink", "events-plans"],
  },
  {
    id: "explore",
    label: "Explore Frederick",
    description: "See outdoor places, local history, and county data.",
    icon: Compass,
    color: "var(--app-positive)",
    sectionIds: ["outdoors", "explore", "county-data"],
  },
  {
    id: "get-around",
    label: "Get around",
    description: "Plan a route, park, ride transit, or check travel conditions.",
    icon: Map,
    color: "var(--app-cool)",
    sectionIds: ["get-around"],
  },
  {
    id: "local-help",
    label: "Find local help",
    description: "Find public essentials, civic services, and reliable contacts.",
    icon: Landmark,
    color: "var(--app-civic)",
    sectionIds: ["essentials", "civic"],
  },
  {
    id: "your-radius",
    label: "Make Radius yours",
    description: "Return to your places, preferences, and ways to contribute.",
    icon: Bookmark,
    color: "var(--app-accent-press)",
    sectionIds: ["yours", "contribute"],
  },
];

const COMMON_TASK_IDS = [
  "nearby",
  "county-pulse",
  "public-essentials",
] as const;

const COMMON_TASK_LABELS: Partial<Record<(typeof COMMON_TASK_IDS)[number], string>> = {
  "county-pulse": "Pulse",
  "public-essentials": "Nearby essentials",
};

const RECENT_TOOLS_KEY = "fr.compass.recent.v1";
export const ALL_COMPASS_TOOLS_ID = "all-tools";

/** Build the directory once from the registry. When a home town has not been
 * chosen, Settings becomes the single setup row instead of rendering two links
 * to the same destination. */
export function buildCompassSections(homeSlug: string | null): CompassSection[] {
  const home = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;

  return RADIUS_TOOL_GROUPS.map((group) => {
    let items = group.tools.map(toDirectoryItem);
    if (group.id === "yours") {
      if (home) {
        items = [
          {
            id: `home-${home.slug}`,
            href: `/m/${home.slug}`,
            label: home.name,
            description: "Open the guide for your home area.",
            icon: MapPin,
            color: "var(--app-brand-press)",
            keywords: ["home", "my town", "home area"],
          },
          ...items,
        ];
      } else {
        items = items.map((item) =>
          item.id === "settings"
            ? {
                ...item,
                label: "Choose your home town",
                description: "Choose a home area for nearby results and local shortcuts.",
              }
            : item,
        );
      }
    }
    if (group.id === "county-data" && CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED) {
      items = [...items, TIME_MACHINE];
    }
    return { id: group.id, label: group.label, items };
  });
}

/** Convert the registry's implementation-oriented sections into five jobs a
 * person can recognize. Every raw section remains present exactly once, but
 * its tool inventory stays behind the chosen outcome instead of filling the
 * page on arrival. */
export function buildCompassOutcomes(sections: CompassSection[]): CompassOutcome[] {
  const byId = new globalThis.Map(sections.map((section) => [section.id, section]));
  return COMPASS_OUTCOME_DEFINITIONS.map(({ sectionIds, ...definition }) => ({
    ...definition,
    sections: sectionIds.flatMap((sectionId) => {
      const section = byId.get(sectionId);
      return section ? [section] : [];
    }),
  })).filter((outcome) => outcome.sections.length > 0);
}

/** Public essentials has a visual amenity picker, but every other registered
 * tool must remain in the rows beneath it. Deriving the split prevents a new
 * tool such as Scanner from disappearing from the browse view. */
export function splitEssentialItems(items: DirectoryItem[]) {
  const amenityIds = new Set(AMENITY_MAP_TOOLS.map((tool) => tool.id));
  return {
    openAll: items.find((item) => item.id === "public-essentials") ?? null,
    amenities: items.filter((item) => amenityIds.has(item.id)),
    rows: items.filter(
      (item) => item.id !== "public-essentials" && !amenityIds.has(item.id),
    ),
  };
}

/** The small front door to the common jobs residents reach for most often.
 *  This is derived from the same registry-backed sections as the full index,
 *  so it cannot point at a stale duplicate route. */
export function commonCompassTasks(sections: CompassSection[]): DirectoryItem[] {
  const byId = new globalThis.Map(
    sections.flatMap((section) => section.items).map((item) => [item.id, item]),
  );
  return [ASK_RADIUS, ...COMMON_TASK_IDS.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  })];
}

export type CompassDirectory = {
  id: typeof ALL_COMPASS_TOOLS_ID;
  label: "All tools";
  total: number;
  sections: CompassSection[];
};

/** The explicit, complete directory behind the compact command center.
 * Unlike the five outcome shortcuts, this preserves the registry's own groups
 * and exposes every row at once. */
export function buildAllToolsDirectory(sections: CompassSection[]): CompassDirectory {
  return {
    id: ALL_COMPASS_TOOLS_ID,
    label: "All tools",
    total: sections.reduce((count, section) => count + section.items.length, 0),
    sections,
  };
}

/** Keep the UI and its coverage tests on one search contract. */
export function searchCompassSections(
  sections: CompassSection[],
  query: string,
): CompassSection[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => toolMatchesQuery(item, normalizedQuery)),
    }))
    .filter((section) => section.items.length > 0);
}

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

export default function CompassHub() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(subscribeHomeTown, getHomeMuni, noHomeTown);
  const [query, setQuery] = useState("");
  // Browse views stay closed on arrival. Search and common jobs remain the
  // compact front door; a person can then open one outcome or the complete
  // registry-backed directory.
  const [activeOutcomeId, setActiveOutcomeId] = useState<string | null>(null);
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const warm = (href: string) => router.prefetch(href);
  const intentProps = (href: string) => ({
    onMouseEnter: () => warm(href),
    onFocus: () => warm(href),
    onPointerDown: () => warm(href),
    onClick: () => {
      track("compass_tool_open");
      setRecentHrefs((current) => {
        const next = [href, ...current.filter((item) => item !== href)].slice(0, 4);
        try {
          window.localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
        } catch {
          // The directory works normally when storage is blocked.
        }
        return next;
      });
    },
  });

  const sections = useMemo(() => buildCompassSections(homeSlug), [homeSlug]);
  const outcomes = useMemo(() => buildCompassOutcomes(sections), [sections]);
  const allTools = useMemo(() => buildAllToolsDirectory(sections), [sections]);
  const commonTasks = useMemo(() => commonCompassTasks(sections), [sections]);
  const recentItems = useMemo(() => {
    const byHref = new globalThis.Map(
      sections.flatMap((section) => section.items).map((item) => [item.href, item]),
    );
    const quickHrefs = new Set(commonTasks.map((item) => item.href));
    return recentHrefs.flatMap((href) => {
      if (quickHrefs.has(href)) return [];
      const item = byHref.get(href);
      return item ? [item] : [];
    }).slice(0, 2);
  }, [commonTasks, recentHrefs, sections]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(RECENT_TOOLS_KEY) ?? "[]") as unknown;
        if (Array.isArray(stored)) {
          setRecentHrefs(stored.filter((item): item is string => typeof item === "string").slice(0, 4));
        }
      } catch {
        setRecentHrefs([]);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const openHashSection = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!hash.startsWith("cat-")) return;
      const sectionId = hash.slice(4);
      if (!sections.some((section) => section.id === sectionId)) return;
      const outcome = outcomes.find((candidate) =>
        candidate.sections.some((section) => section.id === sectionId),
      );
      setActiveOutcomeId(outcome?.id ?? null);
      window.requestAnimationFrame(() => {
        document.getElementById(`compass-section-${sectionId}`)?.scrollIntoView({ block: "nearest" });
      });
    };

    openHashSection();
    window.addEventListener("hashchange", openHashSection);
    return () => window.removeEventListener("hashchange", openHashSection);
  }, [outcomes, sections]);

  const visibleSections = searchCompassSections(sections, normalizedQuery);

  const resultCount = visibleSections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <div className="space-y-6" data-compass-ready={hydrated ? "true" : "false"}>
      <header
        className="-mx-4 -mt-4 border-b px-4 pb-4 pt-4 text-[var(--app-ink)] sm:-mx-5 sm:-mt-6 sm:px-5 sm:pt-5 lg:mx-0 lg:mt-0 lg:rounded-[var(--app-radius-md)] lg:border"
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
            <h1 className="mt-0.5 font-sans text-[28px] font-semibold leading-none tracking-[-0.035em]">
              Compass
            </h1>
          </div>
          <p
            className="hidden max-w-[250px] text-right text-[12px] leading-snug sm:block"
            style={{ color: "var(--app-ink-3)" }}
          >
            Find a place, plan your day, or open a local tool.
          </p>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search all tools</span>
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
              data-compass-ready={hydrated ? "true" : "false"}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools: parking, buses, events…"
              className="min-h-12 w-full rounded-[var(--app-radius-sm)] border bg-[var(--app-bg)] py-2.5 pl-10 pr-11 text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear tool filter"
                className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-[var(--app-radius-sm)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
              >
                <X className="h-4 w-4" style={{ color: "var(--app-ink-3)" }} aria-hidden />
              </button>
            ) : null}
          </span>
        </label>
        {normalizedQuery ? (
          <p className="relative mt-2 px-0.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }} role="status">
            {resultCount > 0
              ? `${resultCount} matching ${resultCount === 1 ? "tool" : "tools"}`
              : "No Radius tool matches that yet."}
          </p>
        ) : null}
      </header>

      {!normalizedQuery && commonTasks.length > 0 ? (
        <CommonTasks items={commonTasks} intentProps={intentProps} />
      ) : null}

      {!normalizedQuery && recentItems.length > 0 ? (
        <RecentTools items={recentItems} intentProps={intentProps} />
      ) : null}

      {normalizedQuery ? (
        <>
          {visibleSections.map((section) => (
            <SearchResultSection key={section.id} section={section} intentProps={intentProps} />
          ))}
          <CompassSearchActions query={query.trim()} intentProps={intentProps} />
        </>
      ) : (
        <CompassOutcomePicker
          outcomes={outcomes}
          allTools={allTools}
          activeOutcomeId={activeOutcomeId}
          onToggle={(outcomeId) => {
            setActiveOutcomeId((current) => current === outcomeId ? null : outcomeId);
          }}
          interactive={hydrated}
          intentProps={intentProps}
        />
      )}
    </div>
  );
}

function CommonTasks({
  items,
  intentProps,
}: {
  items: DirectoryItem[];
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <nav aria-labelledby="compass-common-tasks-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="compass-common-tasks-heading"
          className="text-[15px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--app-ink)" }}
        >
          Quick access
        </h2>
        <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Useful right now
        </span>
      </div>

      {items[0] ? (
        <Link
          href={items[0].href}
          prefetch={false}
          {...intentProps(items[0].href)}
          className="tactile-interactive group mt-2 flex min-h-[58px] items-center gap-3 rounded-[var(--app-radius-sm)] px-3.5 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{
            color: "var(--app-on-brand)",
            background: "var(--app-brand-press)",
          }}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
            style={{ background: "color-mix(in srgb, var(--app-on-brand) 14%, transparent)" }}
          >
            <MessageCircleQuestion className="h-[17px] w-[17px]" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-tight">Ask Radius</span>
            <span className="mt-0.5 block text-[10.5px] leading-tight opacity-80">
              Tell us what you need.
            </span>
          </span>
          <ArrowRight
            className="h-4 w-4 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.25}
            aria-hidden
          />
        </Link>
      ) : null}

      <ul
        className="mt-2 grid grid-cols-3 divide-x overflow-hidden rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)]"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        {items.slice(1).map((item) => {
          const Icon = item.icon;
          const label = COMMON_TASK_LABELS[item.id as keyof typeof COMMON_TASK_LABELS] ?? item.label;
          return (
            <li key={item.id} style={{ borderColor: "var(--app-border)" }}>
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile-interactive flex min-h-[72px] flex-col items-center justify-center gap-1.5 px-1.5 py-2 text-center outline-none transition hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
                style={{ color: "var(--app-ink)" }}
              >
                <Icon className="h-[18px] w-[18px]" style={{ color: item.color }} strokeWidth={2.05} aria-hidden />
                <span className="text-[10.5px] font-semibold leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RecentTools({
  items,
  intentProps,
}: {
  items: DirectoryItem[];
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <section aria-labelledby="compass-recent-heading" className="flex min-w-0 items-center gap-2.5">
      <p id="compass-recent-heading" className="shrink-0 text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        Recent
      </p>
      <ul className="flex min-w-0 gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={`${item.href}|recent`} className="shrink-0">
            <Link
              href={item.href}
              prefetch={false}
              {...intentProps(item.href)}
              className="tactile-interactive inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated-solid)] px-2.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} strokeWidth={2} aria-hidden />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompassOutcomePicker({
  outcomes,
  allTools,
  activeOutcomeId,
  onToggle,
  interactive,
  intentProps,
}: {
  outcomes: CompassOutcome[];
  allTools: CompassDirectory;
  activeOutcomeId: string | null;
  onToggle: (outcomeId: string) => void;
  interactive: boolean;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <section aria-labelledby="compass-browse-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="compass-browse-heading"
          className="text-[15px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--app-ink)" }}
        >
          Browse tools
        </h2>
        <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {allTools.total} tools
        </span>
      </div>
      <button
        type="button"
        disabled={!interactive}
        aria-expanded={activeOutcomeId === ALL_COMPASS_TOOLS_ID}
        aria-controls="compass-all-tools-directory"
        onClick={() => onToggle(ALL_COMPASS_TOOLS_ID)}
        className="tactile-interactive flex min-h-12 w-full items-center gap-3 border-y px-1 text-left outline-none transition hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)] disabled:cursor-wait"
        style={{
          borderColor: "var(--app-border-strong)",
          color: "var(--app-ink)",
          background: activeOutcomeId === ALL_COMPASS_TOOLS_ID
            ? "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated-solid))"
            : "var(--app-bg-elevated-solid)",
        }}
      >
        <List
          className="h-[18px] w-[18px] shrink-0"
          style={{ color: "var(--app-brand-press)" }}
          strokeWidth={2.1}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">All tools</span>
          <span className="mt-0.5 block text-[10.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
            Every working Radius tool, grouped in one list.
          </span>
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {allTools.total}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          strokeWidth={2.25}
          style={{
            color: "var(--app-ink-3)",
            transform: activeOutcomeId === ALL_COMPASS_TOOLS_ID ? "rotate(180deg)" : undefined,
          }}
          aria-hidden
        />
      </button>
      <p className="text-[10.5px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        Or browse by need
      </p>
      <div
        role="group"
        aria-label="Choose what you need"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {outcomes.map((outcome) => {
          const Icon = outcome.icon;
          const active = outcome.id === activeOutcomeId;
          const panelId = `compass-outcome-${outcome.id}`;
          return (
            <button
              key={outcome.id}
              type="button"
              disabled={!interactive}
              aria-expanded={active}
              aria-controls={panelId}
              onClick={() => onToggle(outcome.id)}
              className="tactile-interactive flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-[11.5px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] disabled:cursor-wait"
              style={{
                borderColor: active ? outcome.color : "var(--app-border)",
                color: active ? "var(--app-ink)" : "var(--app-ink-2)",
                background: active
                  ? `color-mix(in srgb, ${outcome.color} 10%, var(--app-bg-elevated-solid))`
                  : "var(--app-bg-elevated-solid)",
              }}
            >
              <Icon className="h-4 w-4" style={{ color: outcome.color }} strokeWidth={2.05} aria-hidden />
              {outcome.label}
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 transition-transform"
                strokeWidth={2.25}
                style={{
                  color: "var(--app-ink-3)",
                  transform: active ? "rotate(180deg)" : undefined,
                }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      {activeOutcomeId === ALL_COMPASS_TOOLS_ID ? (
        <AllToolsDirectory directory={allTools} intentProps={intentProps} />
      ) : null}
      {outcomes.map((outcome) => outcome.id === activeOutcomeId ? (
        <div
          key={outcome.id}
          id={`compass-outcome-${outcome.id}`}
          className="space-y-5 border-t pt-4"
          style={{ borderColor: "var(--app-border-strong)" }}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
              style={{
                color: outcome.color,
                background: `color-mix(in srgb, ${outcome.color} 10%, transparent)`,
              }}
            >
              <outcome.icon className="h-4 w-4" strokeWidth={2.05} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                {outcome.label}
              </h3>
              <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                {outcome.description}
              </p>
            </div>
          </div>
          {outcome.sections.map((section) => (
            <ActiveToolSection
              key={section.id}
              section={section}
              intentProps={intentProps}
            />
          ))}
        </div>
      ) : null)}
    </section>
  );
}

function AllToolsDirectory({
  directory,
  intentProps,
}: {
  directory: CompassDirectory;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <div
      id="compass-all-tools-directory"
      className="space-y-6 border-t pt-4"
      style={{ borderColor: "var(--app-border-strong)" }}
    >
      <div>
        <h3 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          All tools
        </h3>
        <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          This directory includes {directory.total} tools across {directory.sections.length} groups.
        </p>
      </div>
      {directory.sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`compass-all-tools-${section.id}`}
          className="space-y-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              id={`compass-all-tools-${section.id}`}
              className="text-[13px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              {section.label}
            </h4>
            <span
              className="font-mono text-[10px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
              aria-label={`${section.items.length} ${section.items.length === 1 ? "tool" : "tools"}`}
            >
              {section.items.length}
            </span>
          </div>
          <LedgerList items={section.items} intentProps={intentProps} />
        </section>
      ))}
    </div>
  );
}

function ActiveToolSection({
  section,
  intentProps,
}: {
  section: CompassSection;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <section
      id={`compass-section-${section.id}`}
      aria-labelledby={`compass-section-heading-${section.id}`}
      className="scroll-mt-24 space-y-2.5"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <h3
          id={`compass-section-heading-${section.id}`}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {section.label}
        </h3>
        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {section.items.length}
        </span>
      </div>
      {section.id === "essentials" ? (
        <AmenityReveal items={section.items} intentProps={intentProps} />
      ) : (
        <div id="compass-active-tool-list">
          <LedgerList items={section.items} intentProps={intentProps} />
        </div>
      )}
    </section>
  );
}

function SearchResultSection({
  section,
  intentProps,
}: {
  section: CompassSection;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <section aria-labelledby={`compass-search-${section.id}`} className="space-y-2.5">
      <h2 id={`compass-search-${section.id}`} className="font-sans text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {section.label}
      </h2>
      <LedgerList items={section.items} intentProps={intentProps} />
    </section>
  );
}

function CompassSearchActions({
  query,
  intentProps,
}: {
  query: string;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  const encodedQuery = encodeURIComponent(query);
  const askHref = `/ask?q=${encodedQuery}`;
  const searchHref = `/search?q=${encodedQuery}`;
  const displayQuery = query.length > 32 ? `${query.slice(0, 31)}…` : query;

  return (
    <div
      className="rounded-[var(--app-radius-md)] border p-3"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
    >
      <Link
        href={searchHref}
        prefetch={false}
        {...intentProps(searchHref)}
        className="tactile-interactive group flex min-h-[58px] items-center gap-3 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-elevated-solid)] px-3 outline-none shadow-[var(--app-elev-1)] transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px]"
          style={{
            color: "var(--app-brand-press)",
            background: "color-mix(in srgb, var(--app-brand) 10%, transparent)",
          }}
        >
          <Search className="h-4 w-4" strokeWidth={2.1} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Search Frederick for “{displayQuery}”
          </span>
          <span className="mt-0.5 block text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
            Places, events, and towns
          </span>
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
      </Link>
      <Link
        href={askHref}
        prefetch={false}
        {...intentProps(askHref)}
        className="tactile-interactive mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--app-radius-sm)] border px-3 text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink)",
          background: "color-mix(in srgb, var(--app-brand) 7%, var(--app-bg-elevated-solid))",
        }}
      >
        Ask Radius about this
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </Link>
    </div>
  );
}

/** The index's ONE list grammar: a hairline-divided ledger of destinations.
 *  Every section uses this — one dense, calm column instead of competing card
 *  styles. */
function LedgerList({
  items,
  intentProps,
}: {
  items: DirectoryItem[];
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  return (
    <ul
      className="divide-y border-y bg-[var(--app-bg-elevated-solid)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* href alone can repeat ("Choose your home town" and "Settings" both
          land on /settings until a home is set) — key on the pair. */}
      {items.map((item) => (
        <li key={`${item.href}|${item.label}`} style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={item.href}
            prefetch={false}
            {...intentProps(item.href)}
            className="tactile-interactive group flex min-h-[58px] items-center gap-3 px-1 py-2.5 outline-none transition hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center" style={{ color: item.color }}>
              <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
              <span className="mt-0.5 block line-clamp-1 text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-70" strokeWidth={2.25} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Public essentials gets a stronger reveal than a stack of look-alike rows
 *  (owner call): the mapped amenities are named as their own labelled set of
 *  chips (restrooms, water, Wi-Fi, EV charging, dog stations, bike racks,
 *  seating, play areas, and the rest), each opening the map to that layer. The
 *  amenities guide and the emergency-vet contact stay as their own rows below. */
function AmenityReveal({
  items,
  intentProps,
}: {
  items: DirectoryItem[];
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  const { openAll, amenities, rows } = splitEssentialItems(items);

  return (
    <div className="space-y-3">
      <div
        className="border-y px-1 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Need it now
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              Find the closest mapped essential
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Restroom, water, trash, dog bags, seating, or power
            </p>
          </div>
          {openAll ? (
            <Link
              href={openAll.href}
              prefetch={false}
              {...intentProps(openAll.href)}
              className="tap-44-y inline-flex shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] px-2 text-[12px] font-semibold"
              style={{ color: "var(--app-on-brand)", background: "var(--app-brand-press)" }}
            >
              Find nearest
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      {amenities.length > 0 ? (
        <details
          className="group overflow-hidden border-y"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[12.5px] font-semibold">
            <span style={{ color: "var(--app-ink)" }}>Choose a specific map layer</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {amenities.length}
              </span>
              <ChevronDown
                className="h-4 w-4 transition group-open:rotate-180"
                strokeWidth={2.25}
                aria-hidden
                style={{ color: "var(--app-ink-3)" }}
              />
            </span>
          </summary>
          <ul
            id="compass-amenity-list"
            className="flex flex-wrap gap-2 border-t px-3.5 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            {amenities.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    {...intentProps(item.href)}
                    className="tactile-interactive flex min-h-11 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated-solid)] px-3 text-[12.5px] font-semibold outline-none transition hover:bg-[var(--app-bg-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                    style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} strokeWidth={2} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
      <LedgerList items={rows} intentProps={intentProps} />
    </div>
  );
}
