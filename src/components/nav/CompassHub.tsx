"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  Beer,
  Bike,
  Bookmark,
  BusFront,
  CalendarCheck,
  CalendarDays,
  Camera,
  Car,
  ChevronDown,
  Coffee,
  Compass,
  Dog,
  History,
  Landmark,
  Map,
  MapPin,
  MessageCircleQuestion,
  Music,
  Package,
  ParkingCircle,
  PawPrint,
  Plane,
  Plug,
  Route,
  Search,
  Settings,
  Sigma,
  Sparkles,
  Store,
  Tag,
  Toilet,
  Trash2,
  Trees,
  Truck,
  UtensilsCrossed,
  Waves,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AMENITY_MAP_TOOLS,
  RADIUS_TOOL_GROUPS,
  type RadiusTool,
  type RadiusToolIcon,
  type RadiusToolTone,
} from "@/data/radius-tools";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";
import { toolMatchesQuery } from "@/lib/search/toolQuery";
import { track } from "@/lib/track";

/** One Lucide component per registry icon key, so the directory renders
 *  straight from the shared RADIUS_TOOL_GROUPS instead of a hand-kept copy of
 *  the toolbox. The Record type makes the map complete-by-compiler: a new icon
 *  in the union that is missing here is a build error, not a runtime blank. */
const TOOL_ICONS: Record<RadiusToolIcon, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  beer: Beer,
  bike: Bike,
  bookmark: Bookmark,
  bus: BusFront,
  calendar: CalendarDays,
  "calendar-check": CalendarCheck,
  camera: Camera,
  car: Car,
  coffee: Coffee,
  compass: Compass,
  dog: Dog,
  history: History,
  landmark: Landmark,
  map: Map,
  "map-pin": MapPin,
  music: Music,
  package: Package,
  parking: ParkingCircle,
  paw: PawPrint,
  plane: Plane,
  plug: Plug,
  route: Route,
  search: Search,
  settings: Settings,
  sigma: Sigma,
  sparkles: Sparkles,
  store: Store,
  tag: Tag,
  toilet: Toilet,
  trash: Trash2,
  trees: Trees,
  truck: Truck,
  utensils: UtensilsCrossed,
  waves: Waves,
  wifi: Wifi,
};

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

const COMMON_TASK_IDS = [
  "nearby",
  "county-pulse",
  "public-essentials",
] as const;

const COMMON_TASK_LABELS: Partial<Record<(typeof COMMON_TASK_IDS)[number], string>> = {
  "county-pulse": "Live conditions",
  "public-essentials": "Nearby essentials",
};

const SECTION_ICONS: Record<string, LucideIcon> = {
  "eat-drink": UtensilsCrossed,
  "get-around": Map,
  outdoors: Trees,
  essentials: MapPin,
  "events-plans": CalendarDays,
  civic: Landmark,
  "county-data": Sigma,
  explore: Compass,
  yours: Bookmark,
  contribute: Sparkles,
};

const RECENT_TOOLS_KEY = "fr.compass.recent.v1";

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

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

export default function CompassHub() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(subscribeHomeTown, getHomeMuni, noHomeTown);
  const [query, setQuery] = useState("");
  // Open on the most broadly useful subject instead of a blank directory.
  // A hash still overrides this, and the topic rail remains the explicit way
  // to change subjects.
  const [activeSectionId, setActiveSectionId] = useState("");
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
  const commonTasks = useMemo(() => commonCompassTasks(sections), [sections]);
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? null;
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
      setActiveSectionId(sectionId);
      window.requestAnimationFrame(() => {
        document.getElementById("compass-active-section")?.scrollIntoView({ block: "nearest" });
      });
    };

    openHashSection();
    window.addEventListener("hashchange", openHashSection);
    return () => window.removeEventListener("hashchange", openHashSection);
  }, [sections, normalizedQuery]);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.id !== "search" && toolMatchesQuery(item, normalizedQuery)),
    }))
    .filter((section) => section.items.length > 0);

  const resultCount = visibleSections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  const selectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const url = new URL(window.location.href);
    url.hash = `cat-${sectionId}`;
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="space-y-5" data-compass-ready={hydrated ? "true" : "false"}>
      <header
        className="-mx-4 -mt-6 border-y px-4 pb-4 pt-3 text-[var(--app-ink)] shadow-[var(--app-elev-1)] sm:-mx-5 sm:px-5 lg:mx-0 lg:mt-0 lg:rounded-[var(--app-radius-md)] lg:border"
        style={{
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-brand) 5%, var(--app-bg-elevated-solid))",
        }}
      >
        <h1 className="sr-only">
          All tools
        </h1>
        <label className="mt-3 block">
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
              placeholder="Search restrooms, parking, events…"
              className="min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] py-2.5 pl-10 pr-11 text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear tool filter"
                className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-[var(--app-radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
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

      {normalizedQuery
        ? (
          <>
            {visibleSections.map((section) => (
              <SearchResultSection key={section.id} section={section} intentProps={intentProps} />
            ))}
            <CompassSearchActions query={query.trim()} intentProps={intentProps} />
          </>
        )
        : (
          <>
            <CompassCategoryPicker
              sections={sections}
              activeSectionId={activeSection?.id ?? ""}
              onSelect={selectSection}
              interactive={hydrated}
            />
            {activeSection ? (
              <ActiveToolSection key={activeSection.id} section={activeSection} intentProps={intentProps} />
            ) : null}
          </>
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
    <nav aria-labelledby="compass-common-tasks-heading" className="space-y-2">
      <p
        id="compass-common-tasks-heading"
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Start here
      </p>

      <ul
        className="grid grid-cols-2 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)]"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          const label = COMMON_TASK_LABELS[item.id as keyof typeof COMMON_TASK_LABELS] ?? item.label;
          const primary = item.id === ASK_RADIUS.id;
          const lastRowStart = Math.floor((items.length - 1) / 2) * 2;
          return (
            <li
              key={item.id}
              className={`${index % 2 === 0 ? "border-r" : ""}${index < lastRowStart ? " border-b" : ""}`}
              style={{ borderColor: "var(--app-border)" }}
            >
            <Link
              href={item.href}
              prefetch={false}
              {...intentProps(item.href)}
              className="tactile-interactive flex min-h-[60px] items-center gap-2.5 px-3 py-2 text-left outline-none transition hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
              style={{
                color: primary ? "var(--app-on-brand)" : "var(--app-ink)",
                background: primary ? "var(--app-brand-press)" : undefined,
              }}
            >
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
                style={{
                  color: primary ? "var(--app-on-brand)" : item.color,
                  background: primary
                    ? "color-mix(in srgb, var(--app-on-brand) 14%, transparent)"
                    : `color-mix(in srgb, ${item.color} 11%, transparent)`,
                }}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-semibold leading-tight">{label}</span>
                {primary ? (
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-80">
                    Help me choose or plan
                  </span>
                ) : null}
              </span>
              {primary ? (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
              ) : null}
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
    <section aria-labelledby="compass-recent-heading" className="space-y-2">
      <p id="compass-recent-heading" className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        Recently used
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={`${item.href}|recent`} className="shrink-0">
            <Link
              href={item.href}
              prefetch={false}
              {...intentProps(item.href)}
              className="tactile-interactive inline-flex min-h-11 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated-solid)] px-3 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={2} aria-hidden />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompassCategoryPicker({
  sections,
  activeSectionId,
  onSelect,
  interactive,
}: {
  sections: CompassSection[];
  activeSectionId: string;
  onSelect: (sectionId: string) => void;
  interactive: boolean;
}) {
  return (
    <section aria-labelledby="compass-browse-heading" className="space-y-2.5">
      <h2 id="compass-browse-heading" className="font-sans text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
        Browse by topic
      </h2>
      <div
        role="group"
        aria-label="Browse by topic"
        className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.id] ?? Compass;
          const active = section.id === activeSectionId;
          return (
            <button
              key={section.id}
              id={`cat-${section.id}`}
              type="button"
              disabled={!interactive}
              aria-pressed={active}
              aria-controls={active ? "compass-active-section" : undefined}
              onClick={() => onSelect(section.id)}
              className="tactile-interactive flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{
                borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                background: active
                  ? "color-mix(in srgb, var(--app-brand) 11%, var(--app-bg-elevated-solid))"
                  : "var(--app-bg-elevated-solid)",
                color: active ? "var(--app-brand-press)" : "var(--app-ink)",
              }}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="text-[12px] font-semibold leading-tight">{section.label}</span>
            </button>
          );
        })}
      </div>
    </section>
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
    <section id="compass-active-section" aria-labelledby="compass-active-heading" className="scroll-mt-24 space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--app-border-strong)" }}>
        <h2 id="compass-active-heading" className="font-sans text-[21px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
          {section.label}
        </h2>
        <span className="text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {section.items.length} {section.items.length === 1 ? "tool" : "tools"}
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
  cols = 2,
  intentProps,
}: {
  items: DirectoryItem[];
  cols?: 2 | 3;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  const liClass =
    cols === 3
      ? "border-b last:border-b-0 sm:[&:nth-last-child(-n+3)]:border-b-0 sm:[&:not(:nth-child(3n))]:border-r"
      : "border-b last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r";
  return (
    <ul
      className={`overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] sm:grid ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      style={{ borderColor: "var(--app-border-strong)" }}
    >
      {/* href alone can repeat ("Choose your home town" and "Settings" both
          land on /settings until a home is set) — key on the pair. */}
      {items.map((item) => (
        <li key={`${item.href}|${item.label}`} className={liClass} style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={item.href}
            prefetch={false}
            {...intentProps(item.href)}
            className="tactile-interactive group flex min-h-[60px] items-center gap-3 px-3 py-2.5 transition hover:bg-black/[0.025]"
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px]" style={{ color: item.color, background: `color-mix(in srgb, ${item.color} 10%, transparent)` }}>
              <item.icon className="h-[17px] w-[17px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
              <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
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
        className="rounded-[var(--app-radius-md)] border p-3.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
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
          className="group overflow-hidden rounded-[var(--app-radius-md)] border"
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
