"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Compass,
  Info,
  MapPinned,
  Wrench,
  Building2,
  Bus,
  Mountain,
  BookOpen,
  Palette,
  Settings as SettingsIcon,
  Activity,
  CalendarRange,
  Landmark,
  Droplets,
  ExternalLink,
  ArrowRight,
  Search as SearchIcon,
  Clock,
  Calendar,
  Sparkles,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * MoreSheet v2 — action-first, not a directory.
 *
 * Pre-launch this sheet was a four-cluster list (Tools / Useful /
 * Discover / App). It worked but read as a phonebook. The user
 * pushed back: it should DO things, not list things. So:
 *
 *   1. PLAN-A-NIGHT HERO — big brand-color card at the top. The
 *      most common ask ("what should I do tonight?") gets the
 *      most prominent answer button. Links to /plan, which is a
 *      real planning surface already built.
 *
 *   2. NOW-TONIGHT-WEEKEND 3-card row — same pattern as /now's
 *      RightNowStrip. Three impulse doorways: open-near-me /
 *      starting-tonight / weekend-bet. Each links to /browse or
 *      /events with the right time filter pre-set.
 *
 *   3. CONTEXTUAL BANNER — a quiet one-line suggestion that
 *      changes with the time of day ("Coffee mornings, dinner
 *      around 5, late-night around 9"). Driven by client time;
 *      no LLM, no live data fetch, just rule-based phrasing
 *      against the hour-of-day. The map's intent chips set the
 *      bar for "interactive AND useful"; this row matches it.
 *
 *   4. FILTER INPUT — typeahead-style search that narrows the
 *      directory below by label/description match. Lets a user
 *      who knows what they want type "trail" or "park" and jump
 *      straight there. Empty input shows the full directory.
 *
 *   5. DIRECTORY — kept, but compact and below the actions.
 *      Groups: Tools / Useful / Discover / App. Each row is a
 *      single icon + label + description Link, same as v1.
 *
 * Still pure client UI — no API calls, no LLM. The "intelligence"
 * is rule-based (time-of-day routing). If we want real plan
 * generation later, the AI variant adds a server action that
 * grounds the LLM in our actual places/events data.
 */

type Item = {
  href: string;
  label: string;
  description: string;
  icon: typeof Compass;
  external?: boolean;
};

const TOOLS: Item[] = [
  { href: "/plan",   label: "Plan a night",  description: "Dinner, drinks, somewhere to land late",         icon: CalendarRange },
  { href: "/radius", label: "Within reach",  description: "What's reachable on foot, by bike, or by car",   icon: MapPinned },
  { href: "/pulse",  label: "Pulse",          description: "What's open, busy, or moving across the county", icon: Activity },
];

const USEFUL: Item[] = [
  { href: "/amenities", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2 },
  { href: "/transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus },
  { href: "/trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain },
  { href: "/parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: Mountain },
  { href: "/water",     label: "Water",     description: "Public drinking fountains and water bottle refills", icon: Droplets },
];

const DISCOVER: Item[] = [
  { href: "/from-above/preview", label: "From Above",       description: "The coffee-table book of drone photography over Frederick", icon: BookOpen },
  { href: "https://www.colorfrederick.com", label: "Color Frederick", description: "The Frederick coloring book", icon: Palette, external: true },
  { href: "/history",            label: "History",          description: "Frederick County, one story at a time",                       icon: Landmark },
];

const APP: Item[] = [
  { href: "/about",    label: "About",    description: "What this app is and how it stays honest", icon: Info },
  { href: "/settings", label: "Settings", description: "Persona, home spot, interests, notifications", icon: SettingsIcon },
];

const ALL_GROUPS: Array<{ heading: string; items: Item[] }> = [
  { heading: "Tools", items: TOOLS },
  { heading: "Useful", items: USEFUL },
  { heading: "Discover", items: DISCOVER },
  { heading: "App", items: APP },
];

/** Pull a time-aware nudge from the current hour. Pure
 *  client-side rule-based copy — no live data lookup. The hour
 *  is read in Eastern time so a user in another zone still sees
 *  the Frederick-relevant suggestion. */
function nudgeForHour(hour: number): { eyebrow: string; line: string } {
  if (hour >= 5 && hour < 11) {
    return { eyebrow: "Morning", line: "Open coffee shops, parks for a walk, the weekly markets if it's a Saturday." };
  }
  if (hour >= 11 && hour < 14) {
    return { eyebrow: "Midday", line: "Lunch spots near you, museums and galleries with quiet hours." };
  }
  if (hour >= 14 && hour < 17) {
    return { eyebrow: "Afternoon", line: "Trails before sunset, breweries opening, kid-friendly spots." };
  }
  if (hour >= 17 && hour < 21) {
    return { eyebrow: "Evening", line: "Alive @ Five at Carroll Creek runs through September. Dinner reservations move fast." };
  }
  if (hour >= 21 && hour < 24) {
    return { eyebrow: "Late", line: "Last-call bars, late-night spots, parking lots that stay open." };
  }
  return { eyebrow: "Overnight", line: "24-hour pharmacies, ER directions, late food." };
}

export default function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_GROUPS;
    return ALL_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const hour = (() => {
    try {
      return parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hour12: false,
        }).format(new Date()),
        10,
      );
    } catch {
      return new Date().getHours();
    }
  })();
  const nudge = nudgeForHour(hour);

  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="More"
      subtitle="Plan your night or browse the rest"
    >
      <div className="space-y-4 px-4 pt-3 pb-6">
        {/* 1. PLAN-A-NIGHT HERO. The brand-color card up top. The
            single most useful action of the entire menu, given the
            visual weight it deserves. */}
        <Link
          href="/plan"
          onClick={() => onOpenChange(false)}
          className="tactile tactile-interactive group flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-lg)] p-4 transition active:scale-[0.99]"
          style={{
            background: "var(--app-brand)",
            color: "#fff",
            boxShadow: "0 12px 32px -10px color-mix(in srgb, var(--app-brand) 50%, transparent)",
          }}
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] opacity-85">
              Right now
            </span>
            <span className="block font-serif text-[19px] font-semibold leading-tight">
              Plan tonight in one tap
            </span>
            <span className="block truncate text-[12px] opacity-85">
              Dinner, drinks, somewhere to land late.
            </span>
          </span>
          <ArrowRight
            aria-hidden
            className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5"
            strokeWidth={2.25}
          />
        </Link>

        {/* 2. RIGHT-NOW 3-CARD ROW. Same shape as /now's
            RightNowStrip. Three doorways into the most common
            impulse asks. Links target /browse or /events with the
            right time filter so the user lands somewhere already
            narrow. */}
        <ul className="grid grid-cols-3 gap-2">
          {[
            {
              href: "/browse?intent=eat&t=now",
              eyebrow: "Open now",
              title: "Eat near me",
              meta: "Restaurants open this hour",
              Icon: Clock,
              color: "var(--app-positive)",
            },
            {
              href: "/events?t=tonight",
              eyebrow: "Tonight",
              title: "Starting soon",
              meta: "Music, food, festivals",
              Icon: Calendar,
              color: "var(--app-brand)",
            },
            {
              href: "/events?t=weekend",
              eyebrow: "Weekend",
              title: "This weekend",
              meta: "Fri eve → Sun night",
              Icon: Sparkles,
              color: "var(--app-accent)",
            },
          ].map(({ href, eyebrow, title, meta, Icon, color }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => onOpenChange(false)}
                className="tactile tactile-interactive flex h-full flex-col gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition active:scale-[0.97]"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${color} 14%, transparent)`,
                  }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} style={{ color }} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="block text-[9px] font-bold uppercase tracking-[0.1em]"
                    style={{ color }}
                  >
                    {eyebrow}
                  </span>
                  <span
                    className="block text-[12px] font-semibold leading-snug"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {title}
                  </span>
                  <span
                    className="mt-auto block truncate text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {meta}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* 3. CONTEXTUAL BANNER. Quiet, time-aware. Reads like a
            local telling you what makes sense at this hour. */}
        <div
          className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-cool)" }}
          >
            {nudge.eyebrow}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {nudge.line}
          </p>
        </div>

        {/* 4. FILTER INPUT. Typeahead-style narrowing of the
            directory below. Empty = full directory. The page header
            already had "More"; this input is the question users
            actually ask when they tap More. */}
        <div
          className="flex items-center gap-2 rounded-full border bg-[var(--app-bg-sunken)] px-3 py-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          <SearchIcon
            aria-hidden
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--app-ink-3)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a tool…"
            aria-label="Filter tools"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--app-ink-3)]"
            style={{ color: "var(--app-ink)" }}
          />
        </div>

        {/* 5. DIRECTORY. The browse-by-name fallback. Groups stay
            stable but render only the items that match the filter.
            When the input is empty all clusters show. */}
        <div className="space-y-4">
          {filteredGroups.map((g) => (
            <Cluster
              key={g.heading}
              heading={g.heading}
              items={g.items}
              onClose={() => onOpenChange(false)}
            />
          ))}
          {filteredGroups.length === 0 && (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[12px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Nothing in More matches “{query}”. Try a different word.
            </p>
          )}
        </div>
      </div>
    </BottomDrawer>
  );
}

function Cluster({
  heading,
  items,
  onClose,
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
}) {
  return (
    <section className="space-y-1.5">
      <h3
        className="eyebrow px-1"
        style={{ color: "var(--app-ink-3)" }}
      >
        {heading}
      </h3>
      <ul className="space-y-1.5">
        {items.map(({ href, label, description, icon: Icon, external }) => {
          const body = (
            <>
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {label}
                </span>
                <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {description}
                </span>
              </span>
              {external && (
                <ExternalLink
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={2}
                  style={{ color: "var(--app-ink-3)" }}
                />
              )}
            </>
          );
          const className =
            "hover-lift flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition";
          const style = {
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          };
          return (
            <li key={href}>
              {external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className={className}
                  style={style}
                >
                  {body}
                </a>
              ) : (
                <Link href={href} onClick={onClose} className={className} style={style}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
