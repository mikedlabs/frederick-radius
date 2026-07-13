"use client";

import Link from "next/link";
import {
  Info,
  Settings as SettingsIcon,
  ShieldCheck,
  Tag,
  Plane,
  DoorOpen,
  CalendarDays,
  CalendarSearch,
  AudioWaveform,
  Music,
  Layers,
  ScrollText,
  Camera,
  MapPinned,
  CalendarPlus,
  CirclePlus,
  Store,
  FileText,
  MapPin,
  Landmark,
  History,
  ParkingCircle,
  BusFront,
  ChevronRight,
  HeartHandshake,
  Package,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import ExploreDeck from "@/components/nav/ExploreDeck";

/**
 * MoreSheet v7 — Discover-first + app-drawer icon grids.
 *
 * v6 had a coherent layout but the rhythm still privileged Tools at
 * the top. The user's read: the books and editorial collections are
 * the *destination* people came for; the utility surfaces (Tools /
 * Useful / App) are launcher targets, not the lead.
 *
 * v7 inverts:
 *   1. DISCOVER moves to the top. Two landscape book covers + a
 *      pair of editorial-list icon tiles (History / Collections).
 *      This is the surface that earns a return visit.
 *   2. TOOLS, USEFUL, APP all collapse to the same icon-tile grid
 *      — small label under a tinted-circle icon, no description.
 *      One language for every launcher. The descriptions still
 *      live in aria-label so screen-readers and search get them;
 *      we just don't paint a paragraph next to every glyph.
 *
 * This puts the heaviest visual weight on the surface with the most
 * editorial richness and turns the utility clusters into a
 * scannable home-screen-style grid.
 */

type Item = {
  href: string;
  label: string;
  description: string;
  icon: typeof Info;
  /** Accent color for the icon background — one per item so the
   *  sheet reads as a colored list instead of a wall of blue. */
  color: string;
  external?: boolean;
};

// Explore is the field-guide INDEX, not a second copy of the Today "I want…"
// grid. Everything that has a craving/destination on Today (eat, drink,
// outdoors, parking, trails, rivers, markers, plan, pulse, happy hour, brunch,
// libraries, worship…) lives THERE and is intentionally NOT repeated here. This
// sheet keeps only what Today doesn't surface: the discovery + curiosity
// surfaces, County services (the /contacts civic hub, otherwise reachable only
// from two deep pages), ways to contribute, and the app/meta pages.
// UX-15 (July 2026 review): the sheet regroups by JOB, not one equal-weight
// wall. "Right now" quick actions lead as compact tiles; the editorial deck
// keeps only the discovery surfaces; task utilities get their own cluster;
// experimental toys demote to quiet ruled rows at the bottom.

// Right now — the four most common time-sensitive asks, compact and first.
const RIGHT_NOW: Item[] = [
  { href: "/open-now", label: "Open now", description: "Everything open across the county right this minute", icon: DoorOpen, color: "var(--app-positive)" },
  // ?lens=weekend is the explorer's URL-synced time facet (nuqs) — the
  // same deep link EventAgenda and /search emit, so the tile lands on
  // the weekend-filtered board, not the unfiltered list.
  { href: "/events?lens=weekend", label: "This weekend", description: "What's on this weekend, Friday through Sunday", icon: CalendarDays, color: "var(--app-brand)" },
  { href: "/live-music", label: "Live music", description: "Who's playing tonight and this week across the county", icon: Music, color: "var(--app-accent)" },
  { href: "/deals", label: "Deals", description: "Verified daily specials across the county, by day", icon: Tag, color: "var(--app-brand)" },
];

// Explore — the editorial discovery deck (a five-plate fan reads better
// than twelve; ExploreDeck's rotation math adapts to the count).
const DISCOVER: Item[] = [
  { href: "/collections", label: "Collections", description: "Editor's picks: date night, with kids, rainy day", icon: Layers, color: "var(--app-brand-2)" },
  { href: "/towns", label: "Towns", description: "All 12 municipalities, plus Urbana", icon: MapPinned, color: "var(--app-brand-2)" },
  { href: "/nonprofits", label: "Nonprofits", description: "Every registered nonprofit in the county, by cause", icon: HeartHandshake, color: "var(--app-brand-2)" },
  { href: "/history", label: "History", description: "How Frederick County came to be, place by place", icon: ScrollText, color: "var(--app-accent-press)" },
  { href: "/markers", label: "Markers & landmarks", description: "Read the inscription on every roadside marker, plus the historic landmarks and covered bridges", icon: Landmark, color: "var(--app-accent-press)" },
  { href: "/from-above/preview", label: "From Above", description: "The aerial photography book of Frederick County", icon: Camera, color: "var(--app-cool)" },
  { href: "/rhythm", label: "The Rhythm", description: "Watch 1,200 places wake and sleep, hour by hour", icon: AudioWaveform, color: "var(--app-brand)" },
];

// Plan + help — task-based utilities, one labeled cluster.
const PLAN_HELP: Item[] = [
  // The organizer's door (beta feedback, Jul 2026): planners need to see a
  // date's existing commitments BEFORE setting their own.
  { href: "/check-a-date", label: "Check a date", description: "See what's already scheduled before you set yours", icon: CalendarSearch, color: "var(--app-brand-2)" },
  { href: "/contacts", label: "County services", description: "Who to call and how to do it: 311, permits, trash, taxes, voting, and every county + city department", icon: Landmark, color: "var(--app-cool)" },
  { href: "/parking", label: "Parking", description: "Downtown garages, lots, and where locals actually park", icon: ParkingCircle, color: "var(--app-cool)" },
  { href: "/transit", label: "Getting around", description: "TransIT routes, live buses, and the MARC schedule", icon: BusFront, color: "var(--app-cool)" },
  { href: "/shipping", label: "Post & shipping", description: "Every post office, UPS Store, FedEx, and mailbox in the county", icon: Package, color: "var(--app-brand)" },
];

// More local tools — experimental/curiosity surfaces, quiet ruled rows.
const MORE_TOOLS: Item[] = [
  { href: "/overhead", label: "Overhead", description: "Live radar of planes flying over the county right now", icon: Plane, color: "var(--app-cool)" },
  // The orthoimagery scrubber had ZERO inbound links despite being fully
  // built (experience review) — this is its front door; history moments
  // deep-link into it at their own block + era.
  { href: "/from-above/time-machine", label: "Time Machine", description: "Scrub your block through 65 years of aerial imagery, 1958 to 2025", icon: History, color: "var(--app-cool)" },
];

// Ways to contribute — community submission + business claim surfaces that were
// only reachable from scattered contextual links. Their own labeled cluster so
// "how do I add my event / place / business" has an obvious home.
const CONTRIBUTE: Item[] = [
  { href: "/report", label: "Mark a spot", description: "Flag a hazard, live condition, tip, or note on the map", icon: MapPin, color: "var(--app-brand)" },
  { href: "/submit/event", label: "Add an event", description: "Submit a public event for the calendar", icon: CalendarPlus, color: "var(--app-brand)" },
  { href: "/submit/place", label: "Add a place", description: "Suggest a place that's missing from the map", icon: CirclePlus, color: "var(--app-positive)" },
  { href: "/business/claim", label: "Claim your business", description: "Own a listing? Claim it to keep it accurate", icon: Store, color: "var(--app-brand-2)" },
];

const APP: Item[] = [
  { href: "/about",    label: "About",        description: "What this app is and how it stays honest",     icon: Info,        color: "var(--app-ink-2)" },
  { href: "/trust",    label: "Trust & data", description: "Where the data comes from and what the badges mean", icon: ShieldCheck, color: "var(--app-cool)" },
  { href: "/settings", label: "Settings",     description: "Persona, home spot, interests, notifications", icon: SettingsIcon, color: "var(--app-ink-3)" },
  { href: "/terms",    label: "Terms",        description: "Terms of use and privacy",                     icon: FileText,    color: "var(--app-ink-3)" },
];

export default function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => onOpenChange(false);

  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="The county"
      subtitle="Every page, tool, and way to help"
    >
      {/* The field-guide index: every surface in the app, in one place, grouped
          into scannable clusters so nothing is reachable only by typing a URL.
          (Renamed from "More" — it's a directory of the whole app, not an
          overflow afterthought.) */}
      <div className="space-y-5 px-4 pt-3 pb-6">
        {/* Right now leads (UX-15): the four time-sensitive asks as compact
            tiles, not deck plates — a quick action, not a browse. */}
        <IconCluster heading="Right now" items={RIGHT_NOW} onClose={close} columns={4} />
        {/* Explore — the editorial deck, now only the discovery surfaces. */}
        <section className="space-y-2">
          <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
            Explore
          </h3>
          <ExploreDeck items={DISCOVER} onNavigate={close} />
        </section>
        <IconCluster heading="Plan & help" items={PLAN_HELP} onClose={close} columns={4} />
        <IconCluster heading="Contribute" items={CONTRIBUTE} onClose={close} columns={3} />
        {/* More local tools — the experiments, demoted to quiet ruled rows. */}
        <section>
          <h3 className="eyebrow px-1 pb-1.5" style={{ color: "var(--app-ink-3)" }}>
            More local tools
          </h3>
          <ul
            className="overflow-hidden rounded-[var(--app-radius-md)]"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            {MORE_TOOLS.map((t, i) => (
              <li
                key={t.href}
                style={i > 0 ? { borderTop: "1px solid color-mix(in srgb, var(--app-ink) 7%, transparent)" } : undefined}
              >
                <Link
                  href={t.href}
                  onClick={close}
                  className="tactile-interactive flex min-h-[44px] items-center gap-3 px-3.5 py-2.5"
                >
                  <t.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.9} style={{ color: t.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {t.label}
                    </span>
                    <span className="block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                      {t.description}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-30" style={{ color: "var(--app-ink-3)" }} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <IconCluster heading="App" items={APP} onClose={close} columns={3} />
      </div>
    </BottomDrawer>
  );
}

/**
 * Icon-tile cluster used by Tools / Useful / App and (for symmetry)
 * Discover's editorial rows. App-drawer pattern: tinted circle icon
 * + small label beneath, no description. Descriptions still flow
 * through aria-label so screen-readers and search keep the context.
 *
 * `columns` controls the grid density: 3 for verbs/launcher rows,
 * 4 for the long USEFUL list so it doesn't sprawl.
 */
function IconCluster({
  heading,
  items,
  onClose,
  columns,
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
  columns: 3 | 4;
}) {
  const gridClass = columns === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <section className="space-y-2">
      <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        {heading}
      </h3>
      <ul className={`grid gap-1.5 ${gridClass}`}>
        {items.map((it) => (
          <li key={it.href}>
            <IconTile {...it} onClose={onClose} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Single icon tile — tinted circle icon, label below, no
 *  description text. Shared by Discover editorial rows + the
 *  three icon clusters so the visual language is consistent. */
function IconTile({
  href,
  label,
  description,
  icon: Icon,
  color,
  external,
  onClose,
}: Item & { onClose: () => void }) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          style={{ color }}
        />
      </span>
      <span
        className="block text-center text-[12px] font-semibold leading-tight"
        style={{ color: "var(--app-ink)" }}
      >
        {label}
      </span>
    </>
  );
  const className =
    "hover-lift flex h-[92px] w-full flex-col items-center justify-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2 transition";
  const style = {
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  };
  const aria = `${label}: ${description}`;
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClose}
      className={className}
      style={style}
      aria-label={aria}
    >
      {body}
    </a>
  ) : (
    <Link
      href={href}
      onClick={onClose}
      className={className}
      style={style}
      aria-label={aria}
    >
      {body}
    </Link>
  );
}

