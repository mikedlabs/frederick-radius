"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
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
  type LucideIcon,
} from "lucide-react";
import {
  AMENITY_MAP_TOOLS,
  RADIUS_TOOL_GROUPS,
  RADIUS_TOOLS,
  type RadiusTool,
  type RadiusToolIcon,
  type RadiusToolTone,
} from "@/data/radius-tools";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

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
  href: "/from-above/time-machine",
  label: "Time Machine",
  description: "Scrub a block through decades of aerial imagery.",
  icon: History,
  color: "var(--app-cool)",
  keywords: ["time machine", "aerial", "historic imagery"],
};

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

function itemMatches(item: DirectoryItem, query: string): boolean {
  if (!query) return true;
  return `${item.label} ${item.description} ${(item.keywords ?? []).join(" ")}`
    .toLocaleLowerCase()
    .includes(query);
}

export default function CompassHub() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(subscribeHomeTown, getHomeMuni, noHomeTown);
  const home = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const warm = (href: string) => router.prefetch(href);
  const intentProps = (href: string) => ({
    onMouseEnter: () => warm(href),
    onFocus: () => warm(href),
    onPointerDown: () => warm(href),
  });

  // One directory built from the single tool registry. The Yours section leads
  // with the reader's own home-town shortcut (client state), and the
  // county-data section appends the gated Time Machine — everything else maps
  // straight from RADIUS_TOOL_GROUPS, so the index can never drift from the
  // toolbox again.
  const sections = useMemo(() => {
    return RADIUS_TOOL_GROUPS.map((group, index) => {
      let items = group.tools.map(toDirectoryItem);
      if (group.id === "yours") {
        items = [
          {
            href: home ? `/m/${home.slug}` : "/settings",
            label: home ? home.name : "Choose your home town",
            description: home
              ? "Open the guide for your home area."
              : "Choose a home area for nearby results.",
            icon: MapPin,
            color: "var(--app-brand-press)",
            keywords: ["home", "my town", "home area"],
          },
          ...items,
        ];
      }
      if (group.id === "county-data" && CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED) {
        items = [...items, TIME_MACHINE];
      }
      return { id: group.id, label: group.label, numeral: NUMERALS[index], items };
    });
  }, [home]);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => itemMatches(item, normalizedQuery)),
    }))
    .filter((section) => section.items.length > 0);

  const resultCount = visibleSections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <div className="space-y-8">
      {/* Field-guide plate masthead — the wayfinding hub speaks the same
          paper-cream plate language as every sibling surface (eyebrow +
          serif title + brand rule) instead of a one-off dark gradient hero.
          The compass motif rides as a small eyebrow mark, not a banner. */}
      <header className="relative -mx-4 -mt-6 overflow-hidden border-y border-black/10 bg-[var(--app-bg-elevated-solid)] px-5 py-8 text-[var(--app-ink)] shadow-[var(--app-elev-1)] sm:-mx-5 sm:px-8 sm:py-10 lg:mx-0 lg:mt-0 lg:rounded-[8px] lg:border lg:px-10">
        <div
          className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border"
          style={{ borderColor: "color-mix(in srgb, var(--app-brand) 28%, transparent)" }}
          aria-hidden
        >
          <span className="absolute inset-10 rounded-full border border-black/7" />
          <span
            className="absolute inset-[5.2rem] rounded-full border"
            style={{ borderColor: "color-mix(in srgb, var(--app-brand) 20%, transparent)" }}
          />
          <span
            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "var(--app-brand)", boxShadow: "0 0 0 8px color-mix(in srgb, var(--app-brand) 12%, transparent)" }}
          />
        </div>
        <p className="relative font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--app-brand-press)]">
          <Compass className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Frederick County compass
        </p>
        <h1
          className="relative mt-4 max-w-[8ch] font-serif text-[clamp(3.4rem,14vw,6rem)] font-semibold leading-[0.82] tracking-[-0.055em] text-balance"
        >
          What do you need?
        </h1>
        <p
          className="relative mt-5 max-w-[28rem] text-[13.5px] leading-relaxed text-[var(--app-ink-2)] sm:text-[15px]"
        >
          Open a Radius guide, map, calendar, or practical tool without hunting through the app.
        </p>
        <div className="relative mt-6 flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--app-ink-3)]">
          <span className="h-px w-10" style={{ background: "var(--app-brand)" }} aria-hidden />
          {RADIUS_TOOLS.length} tools, grouped
        </div>
      </header>

      {/* Filter — one field over the whole index. Typing what you want narrows
          every section at once, the grammar the Ask toolbox already uses. */}
      <div>
        <label className="relative block">
          <span className="sr-only">Filter tools and guides</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools, guides, and public essentials"
            className="min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          />
        </label>
        {normalizedQuery ? (
          <p className="mt-2 px-0.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }} role="status">
            {resultCount} {resultCount === 1 ? "tool" : "tools"} found
          </p>
        ) : null}
      </div>

      {visibleSections.map((section) => (
        <section
          key={section.id}
          id={`cat-${section.id}`}
          aria-labelledby={`compass-${section.id}`}
          className="space-y-3 scroll-mt-24"
        >
          <SectionHeading id={`compass-${section.id}`} numeral={section.numeral} title={section.label} />
          {section.id === "essentials" && !normalizedQuery ? (
            <AmenityReveal intentProps={intentProps} />
          ) : (
            <LedgerList items={section.items} intentProps={intentProps} />
          )}
        </section>
      ))}

      {visibleSections.length === 0 ? (
        <p className="px-2 py-10 text-center text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          No tool matches that search.
        </p>
      ) : null}

      {/* About the guide — informational surfaces, kept apart from the working
          tools as a quiet footer rather than a tile in the grid. */}
      {!normalizedQuery ? (
        <footer className="border-t pt-4 text-[12px]" style={{ borderColor: "var(--app-border)" }}>
          <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            About the guide
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/about" prefetch={false} className="tap-44-y font-semibold" style={{ color: "var(--app-ink-2)" }}>
              About Frederick Radius
            </Link>
            <Link href="/trust" prefetch={false} className="tap-44-y font-semibold" style={{ color: "var(--app-ink-2)" }}>
              Where the data comes from
            </Link>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/** A printed-index section heading: roman numeral, serif title, and the
 *  fg-rule running to the edge — a table of contents, not a stack of hero
 *  headers. */
function SectionHeading({
  id,
  numeral,
  title,
  description,
}: {
  id: string;
  numeral: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5 px-0.5">
        <span aria-hidden className="font-mono text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>
          {numeral}.
        </span>
        <h2 id={id} className="font-serif text-[21px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        <div className="fg-rule flex-1" />
      </div>
      {description ? <p className="mt-1.5 px-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{description}</p> : null}
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
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown">;
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
            className="tactile-interactive group flex min-h-[68px] items-center gap-3 px-1 py-3 transition hover:bg-black/[0.025] sm:px-3"
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px]" style={{ color: item.color, background: `color-mix(in srgb, ${item.color} 10%, transparent)` }}>
              <item.icon className="h-[17px] w-[17px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
              <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
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
  intentProps,
}: {
  intentProps: (href: string) => Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown">;
}) {
  const openAll = RADIUS_TOOLS.find((tool) => tool.id === "public-essentials");
  const rows = ["amenities-guide", "emergency-vet"]
    .map((id) => RADIUS_TOOLS.find((tool) => tool.id === id))
    .filter((tool): tool is RadiusTool => Boolean(tool))
    .map(toDirectoryItem);

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
              style={{ color: "var(--app-brand-press)" }}
            >
              Open all
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          ) : null}
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {AMENITY_MAP_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            const color = TONE_COLOR[tool.tone];
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  prefetch={false}
                  {...intentProps(tool.href)}
                  className="tactile-interactive flex min-h-11 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated-solid)] px-3 text-[12.5px] font-semibold outline-none transition hover:bg-[var(--app-bg-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden />
                  {tool.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <LedgerList items={rows} intentProps={intentProps} />
    </div>
  );
}
