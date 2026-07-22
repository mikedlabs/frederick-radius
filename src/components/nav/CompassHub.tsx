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

type CompassSection = {
  id: string;
  label: string;
  items: DirectoryItem[];
};

const COMMON_TASK_IDS = [
  "open-now",
  "events",
  "public-essentials",
  "county-pulse",
] as const;

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

/** The small front door to the four jobs residents reach for most often.
 *  This is derived from the same registry-backed sections as the full index,
 *  so it cannot point at a stale duplicate route. */
export function commonCompassTasks(sections: CompassSection[]): DirectoryItem[] {
  const byId = new globalThis.Map(
    sections.flatMap((section) => section.items).map((item) => [item.id, item]),
  );
  return COMMON_TASK_IDS.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
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
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const warm = (href: string) => router.prefetch(href);
  const intentProps = (href: string) => ({
    onMouseEnter: () => warm(href),
    onFocus: () => warm(href),
    onPointerDown: () => warm(href),
    onClick: () => track("compass_tool_open"),
  });

  const sections = useMemo(() => buildCompassSections(homeSlug), [homeSlug]);
  const commonTasks = useMemo(() => commonCompassTasks(sections), [sections]);

  useEffect(() => {
    const openHashSection = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!hash.startsWith("cat-")) return;
      const sectionId = hash.slice(4);
      if (!sections.some((section) => section.id === sectionId)) return;
      const details = document.getElementById(hash)?.querySelector("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      });
    };

    openHashSection();
    window.addEventListener("hashchange", openHashSection);
    return () => window.removeEventListener("hashchange", openHashSection);
  }, [sections, normalizedQuery]);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => toolMatchesQuery(item, normalizedQuery)),
    }))
    .filter((section) => section.items.length > 0);

  const resultCount = visibleSections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  const syncSection = (sectionId: string, open: boolean) => {
    if (open) {
      document.querySelectorAll<HTMLDetailsElement>("details[data-compass-section]").forEach((details) => {
        if (details.dataset.compassSection !== sectionId) details.open = false;
      });
    }
    const url = new URL(window.location.href);
    if (open) url.hash = `cat-${sectionId}`;
    else if (url.hash === `#cat-${sectionId}`) url.hash = "";
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="space-y-5">
      <header className="-mx-4 -mt-6 border-y border-black/10 bg-[var(--app-bg-elevated-solid)] px-5 pb-5 pt-6 text-[var(--app-ink)] shadow-[var(--app-elev-1)] sm:-mx-5 sm:px-8 sm:py-7 lg:mx-0 lg:mt-0 lg:rounded-[8px] lg:border lg:px-10">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-brand-press)]">
          <Compass className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Frederick County tools
        </p>
        <h1 className="mt-2 font-sans text-[clamp(2rem,8vw,3rem)] font-semibold leading-none tracking-[-0.035em] text-balance">
          All tools
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Search by need, or browse by section.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            Filter all tools
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a task or topic"
              className="min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] py-2 pl-9 pr-11 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
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
            {resultCount} {resultCount === 1 ? "tool" : "tools"} found
          </p>
        ) : null}
      </header>

      {!normalizedQuery && commonTasks.length > 0 ? (
        <CommonTasks items={commonTasks} intentProps={intentProps} />
      ) : null}

      {normalizedQuery
        ? visibleSections.map((section) => (
            <SearchResultSection key={section.id} section={section} intentProps={intentProps} />
          ))
        : sections.map((section) => (
            <CompassSectionDisclosure
              key={section.id}
              section={section}
              onToggle={(open) => syncSection(section.id, open)}
              intentProps={intentProps}
            />
          ))}

      {visibleSections.length === 0 ? (
        <CompassSearchFallback query={query.trim()} intentProps={intentProps} />
      ) : null}

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
      <p
        id="compass-common-tasks-heading"
        className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Common tasks
      </p>
      <ul
        className="grid grid-cols-2 border-y [&>li:nth-child(-n+2)]:border-b [&>li:nth-child(odd)]:border-r"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} style={{ borderColor: "var(--app-border)" }}>
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile-interactive group flex min-h-12 items-center gap-2.5 px-2 py-2 text-[12.5px] font-semibold outline-none transition hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)] sm:px-3"
                style={{ color: "var(--app-ink)" }}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand-press)" }} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-30 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CompassSectionDisclosure({
  section,
  onToggle,
  intentProps,
}: {
  section: CompassSection;
  onToggle: (open: boolean) => void;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  const examples = section.items.slice(0, 2).map((item) => item.label).join(" · ");
  const contentId = `compass-${section.id}-content`;
  const headingId = `compass-${section.id}`;

  return (
    <section id={`cat-${section.id}`} aria-labelledby={headingId} className="scroll-mt-24">
      <details
        name="compass-sections"
        data-compass-section={section.id}
        className="group"
        onToggle={(event) => onToggle(event.currentTarget.open)}
      >
        <summary
          aria-controls={contentId}
          className="tactile-interactive flex min-h-[58px] w-full cursor-pointer list-none items-center gap-3 border-y px-1 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)" }}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span id={headingId} className="font-serif text-[21px] font-semibold leading-none tracking-[-0.015em]" style={{ color: "var(--app-ink)" }}>
                {section.label}
              </span>
              <span className="font-mono text-[9px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {section.items.length}
              </span>
            </span>
            <span className="mt-1 block truncate text-[10.5px] font-normal" style={{ color: "var(--app-ink-3)" }}>
              {examples}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            strokeWidth={2.25}
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
        </summary>
        <div id={contentId} className="pt-2.5">
          {section.id === "essentials" ? (
            <AmenityReveal items={section.items} intentProps={intentProps} />
          ) : (
            <LedgerList items={section.items} intentProps={intentProps} />
          )}
        </div>
      </details>
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

function CompassSearchFallback({
  query,
  intentProps,
}: {
  query: string;
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown" | "onClick">;
}) {
  const encodedQuery = encodeURIComponent(query);
  const askHref = `/ask?q=${encodedQuery}`;
  const searchHref = `/search?q=${encodedQuery}`;

  return (
    <div
      className="rounded-[var(--app-radius-md)] border px-4 py-6 text-center"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
    >
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        There is no matching tool, but Ask Radius can still look for an answer.
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Link
          href={askHref}
          prefetch={false}
          {...intentProps(askHref)}
          className="tactile-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-sm)] bg-[var(--app-brand)] px-4 text-[13px] font-semibold text-[var(--app-on-brand)] outline-none transition hover:bg-[var(--app-brand-press)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2"
        >
          Ask Radius this
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
        <Link
          href={searchHref}
          prefetch={false}
          {...intentProps(searchHref)}
          className="tactile-interactive inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)] px-4 text-[13px] font-semibold outline-none transition hover:bg-[var(--app-bg-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
        >
          Search places and events
        </Link>
      </div>
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
      className={`border-y sm:grid ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
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
            className="tactile-interactive group flex min-h-[54px] items-center gap-3 px-1 py-2 transition hover:bg-black/[0.025] sm:px-3"
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px]" style={{ color: item.color, background: `color-mix(in srgb, ${item.color} 10%, transparent)` }}>
              <item.icon className="h-[17px] w-[17px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
              <span className="mt-0.5 block line-clamp-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
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
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const { openAll, amenities, rows } = splitEssentialItems(items);
  const visibleAmenities = showAllAmenities ? amenities : amenities.slice(0, 6);

  return (
    <div className="space-y-3">
      <div
        className="rounded-[var(--app-radius-md)] border p-3.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            Open the map to any public amenity.
          </p>
          {openAll ? (
            <Link
              href={openAll.href}
              prefetch={false}
              {...intentProps(openAll.href)}
              className="tap-44-y inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Open all
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          ) : null}
        </div>
        <ul id="compass-amenity-list" className="mt-3 flex flex-wrap gap-2">
          {visibleAmenities.map((item) => {
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
        {amenities.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowAllAmenities((value) => !value)}
            className="tap-44-y mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
            aria-expanded={showAllAmenities}
            aria-controls="compass-amenity-list"
          >
            {showAllAmenities ? "Show fewer amenities" : `Show ${amenities.length - 6} more amenities`}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform${showAllAmenities ? " rotate-180" : ""}`} aria-hidden />
          </button>
        ) : null}
      </div>
      <LedgerList items={rows} intentProps={intentProps} />
    </div>
  );
}
