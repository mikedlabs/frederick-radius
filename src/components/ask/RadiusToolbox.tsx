"use client";

import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import {
  FEATURED_RADIUS_TOOLS,
  RADIUS_TOOL_GROUPS,
  RADIUS_TOOLS,
  type RadiusTool,
  type RadiusToolIcon,
  type RadiusToolTone,
} from "@/data/radius-tools";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";

const ICONS: Record<RadiusToolIcon, LucideIcon> = {
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

function recordToolOpen(tool: RadiusTool, surface: "featured" | "all"): void {
  haptic("light");
  track("ask_tool_open", { tool: tool.id, surface });
}

function FeaturedTool({ tool }: { tool: RadiusTool }) {
  const Icon = ICONS[tool.icon];
  const color = TONE_COLOR[tool.tone];
  const style = {
    "--tool-color": color,
    borderColor: "var(--app-border)",
    background:
      "linear-gradient(150deg, color-mix(in srgb, var(--tool-color) 9%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 72%)",
    boxShadow: "0 14px 30px -27px rgba(24, 20, 13, 0.72)",
  } as CSSProperties;

  return (
    <Link
      href={tool.href}
      prefetch={false}
      onClick={() => recordToolOpen(tool, "featured")}
      className="tactile-interactive group relative min-h-[118px] overflow-hidden rounded-[18px] border p-3.5 text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] active:translate-y-0 active:scale-[0.99] sm:min-h-[128px] sm:p-4"
      style={style}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-[11px]"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
        aria-hidden
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <span
        className="mt-4 block pr-5 font-serif text-[16px] font-semibold leading-tight tracking-tight sm:text-[17px]"
        style={{ color: "var(--app-ink)" }}
      >
        {tool.label}
      </span>
      <span
        className="mt-1.5 line-clamp-2 block text-[11px] leading-snug sm:text-[11.5px]"
        style={{ color: "var(--app-ink-2)" }}
      >
        {tool.description}
      </span>
      <ArrowRight
        className="absolute right-3.5 top-4 h-4 w-4 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-70"
        style={{ color }}
        strokeWidth={2}
        aria-hidden
      />
      <span
        className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-[0.2] transition-transform duration-300 group-hover:scale-x-100"
        style={{ background: color }}
        aria-hidden
      />
    </Link>
  );
}

function ToolLink({ tool }: { tool: RadiusTool }) {
  const Icon = ICONS[tool.icon];
  const color = TONE_COLOR[tool.tone];

  return (
    <Link
      href={tool.href}
      prefetch={false}
      onClick={() => recordToolOpen(tool, "all")}
      aria-label={`${tool.label}. ${tool.description}`}
      className="tactile-interactive group flex min-h-12 items-center gap-2.5 rounded-[13px] border px-3 outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] active:scale-[0.99]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color }}
        strokeWidth={1.9}
        aria-hidden
      />
      <span
        className="min-w-0 flex-1 text-[11.5px] font-semibold leading-tight sm:text-[12px]"
        style={{ color: "var(--app-ink)" }}
      >
        {tool.label}
      </span>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 opacity-30 transition group-hover:translate-x-0.5 group-hover:opacity-65"
        style={{ color: "var(--app-ink-2)" }}
        aria-hidden
      />
    </Link>
  );
}

type RadiusToolboxProps = {
  /** Keep the answer page focused; the complete toolbox stays one tap away. */
  compact?: boolean;
};

export default function RadiusToolbox({ compact = false }: RadiusToolboxProps) {
  const [showAll, setShowAll] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const normalizedQuery = toolQuery.trim().toLocaleLowerCase();
  const groups = RADIUS_TOOL_GROUPS.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => {
      // The featured row already exposes these six destinations. They rejoin
      // the results only while filtering, when the featured row is hidden.
      if (!compact && !normalizedQuery && tool.featured) return false;
      if (!normalizedQuery) return true;
      return `${tool.label} ${tool.description}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    }),
  })).filter((group) => group.tools.length > 0);
  const resultCount = groups.reduce((count, group) => count + group.tools.length, 0);

  return (
    <section
      id="radius-tools"
      aria-labelledby="radius-tools-heading"
      className={`${compact ? "mt-5 rounded-[18px]" : "mt-7 rounded-[24px]"} overflow-hidden border`}
      style={{
        borderColor: "var(--app-border-strong, var(--app-border))",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1)",
        scrollMarginTop: "calc(var(--topbar-h, 64px) + 18px)",
      }}
    >
      <div
        className={`border-b px-4 ${compact ? "py-3.5" : "py-4 sm:px-5 sm:py-5"}`}
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
              {compact ? "More Radius tools" : "Radius tools"}
            </p>
            <h2
              id="radius-tools-heading"
              className={`${compact ? "text-[18px]" : "text-[22px] sm:text-[25px]"} mt-1.5 font-serif font-semibold leading-tight tracking-tight`}
              style={{ color: "var(--app-ink)" }}
            >
              {compact ? "Need a different tool?" : "Go straight to the tool you need."}
            </h2>
          </div>
          <span
            className="shrink-0 font-mono text-[10px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {RADIUS_TOOLS.length} tools
          </span>
        </div>
        {!compact ? (
          <p
            className="mt-2 max-w-[560px] text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Use a shortcut when you already know what you want. Ask Radius when
            you need help deciding.
          </p>
        ) : null}
      </div>

      {!compact && !normalizedQuery ? (
        <nav
          aria-label="Featured Radius tools"
          className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 sm:p-4"
        >
          {FEATURED_RADIUS_TOOLS.map((tool) => (
            <FeaturedTool key={tool.id} tool={tool} />
          ))}
        </nav>
      ) : null}

      <div
        className={!compact ? "border-t" : undefined}
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setShowAll((value) => {
              if (value) setToolQuery("");
              return !value;
            });
          }}
          aria-expanded={showAll}
          aria-controls="all-radius-tools"
          className="tap-44 group flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[12px] font-semibold outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)] sm:px-5"
          style={{ color: "var(--app-ink)" }}
        >
          <span>
            {showAll
              ? "Hide the toolbox"
              : compact
                ? `Browse all ${RADIUS_TOOLS.length} tools`
                : `Show all ${RADIUS_TOOLS.length} tools`}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
            style={{ color: "var(--app-brand-press)" }}
            aria-hidden
          />
        </button>

        {showAll ? (
          <div
            id="all-radius-tools"
            className="border-t px-3 pb-5 pt-1 sm:px-4 sm:pb-6"
            style={{ borderColor: "var(--app-border)" }}
          >
            <label className="relative mt-3 block">
              <span className="sr-only">Filter Radius tools</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
              <input
                type="search"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
                placeholder="Filter tools, guides, and public essentials"
                className="min-h-11 w-full rounded-[13px] border bg-[var(--app-bg-elevated-solid)] py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              />
            </label>
            <p
              className="mt-2 px-0.5 text-[10px]"
              style={{ color: "var(--app-ink-3)" }}
              role="status"
            >
              {normalizedQuery
                ? `${resultCount} ${resultCount === 1 ? "tool" : "tools"} found.`
                : compact
                  ? `${RADIUS_TOOLS.length} tools.`
                  : `${RADIUS_TOOLS.length - FEATURED_RADIUS_TOOLS.length} more tools.`}
            </p>

            {groups.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`radius-tool-group-${group.id}`}
                className="pt-5"
              >
                <div className="mb-2.5 flex items-center gap-2.5 px-0.5">
                  <h3
                    id={`radius-tool-group-${group.id}`}
                    className="font-serif text-[16px] font-semibold leading-none"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {group.label}
                  </h3>
                  <span
                    className="h-px flex-1"
                    style={{ background: "var(--app-border)" }}
                    aria-hidden
                  />
                  <span
                    className="font-mono text-[9px] tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {group.tools.length}
                  </span>
                </div>
                <nav
                  aria-label={`${group.label} tools`}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {group.tools.map((tool) => (
                    <ToolLink key={tool.id} tool={tool} />
                  ))}
                </nav>
              </section>
            ))}
            {groups.length === 0 ? (
              <p
                className="px-2 py-8 text-center text-[12px]"
                style={{ color: "var(--app-ink-2)" }}
              >
                No Radius tool matches that search.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
