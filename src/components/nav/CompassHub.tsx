"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type CSSProperties } from "react";
import {
  ArrowRight,
  AudioWaveform,
  Bookmark,
  BusFront,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Camera,
  CirclePlus,
  Clock3,
  Compass,
  HandHeart,
  History,
  Landmark,
  Layers3,
  Map,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  Package,
  ParkingCircle,
  Plane,
  Sigma,
  Settings,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

type CompassItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
};

const START_HERE: CompassItem[] = [
  {
    href: "/ask",
    label: "Ask Radius",
    description: "Get a local answer or build a plan from current Radius data.",
    icon: MessageCircleQuestion,
    color: "var(--app-brand)",
  },
  {
    href: "/open-now",
    label: "Open now",
    description: "Find useful places that are open now.",
    icon: Clock3,
    color: "var(--app-positive)",
  },
  {
    href: "/events?lens=weekend",
    label: "This weekend",
    description: "See county events from Friday through Sunday.",
    icon: CalendarDays,
    color: "var(--app-brand)",
  },
  {
    href: "/nearby",
    label: "Nearby",
    description: "Rank nearby options using your current location.",
    icon: Navigation,
    color: "var(--app-cool)",
  },
  {
    href: "/plan",
    label: "Make a plan",
    description: "Build an outing around a mood or occasion.",
    icon: CalendarCheck,
    color: "var(--app-accent-press)",
  },
];

const DISCOVER: CompassItem[] = [
  {
    href: "/collections",
    label: "Collections",
    description: "Local shortlists with a clear reason for every stop.",
    icon: Layers3,
    color: "var(--app-brand)",
  },
  {
    href: "/towns",
    label: "Towns",
    description: "Browse Frederick City, county towns, and surrounding communities.",
    icon: Map,
    color: "var(--app-brand-2)",
  },
  {
    href: "/history",
    label: "History",
    description: "Read Frederick's history through the places where it happened.",
    icon: History,
    color: "var(--app-accent-press)",
  },
  {
    href: "/markers",
    label: "Markers & landmarks",
    description: "Read roadside markers and find other local landmarks.",
    icon: Landmark,
    color: "var(--app-cool)",
  },
  {
    href: "/nonprofits",
    label: "Nonprofits",
    description: "Find local organizations by cause and community.",
    icon: HandHeart,
    color: "var(--app-civic)",
  },
  {
    href: "/from-above/preview",
    label: "From Above",
    description: "See Frederick County through Mike's drone archive.",
    icon: Camera,
    color: "var(--app-cool)",
  },
];

const PRACTICAL: CompassItem[] = [
  {
    href: "/parking",
    label: "Parking",
    description: "Find garages, lots, and event parking guidance.",
    icon: ParkingCircle,
    color: "var(--app-cool)",
  },
  {
    href: "/transit",
    label: "Transit",
    description: "See current TransIT buses and MARC information.",
    icon: BusFront,
    color: "var(--app-cool)",
  },
  {
    href: "/contacts",
    label: "Contacts",
    description: "Find the correct local office for permits, trash, taxes, or voting.",
    icon: Landmark,
    color: "var(--app-civic)",
  },
  {
    href: "/check-a-date",
    label: "Check a date",
    description: "See what is already happening before you schedule.",
    icon: CalendarCheck,
    color: "var(--app-brand-2)",
  },
  {
    href: "/shipping",
    label: "Post & shipping",
    description: "Find mail and shipping locations, including collection boxes.",
    icon: Package,
    color: "var(--app-brand-2)",
  },
  {
    href: "/deals",
    label: "Deals",
    description: "Compare verified local specials by day.",
    icon: Tag,
    color: "var(--app-brand)",
  },
];

const CURIOSITIES: CompassItem[] = [
  ...(CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED
    ? [
        {
          href: "/from-above/time-machine",
          label: "Time Machine",
          description: "Scrub a block through 65 years of aerial imagery.",
          icon: History,
          color: "var(--app-cool)",
        } satisfies CompassItem,
      ]
    : []),
  {
    href: "/rhythm",
    label: "County hours",
    description: "See how activity changes across the county by hour.",
    icon: AudioWaveform,
    color: "var(--app-brand)",
  },
  {
    href: "/overhead",
    label: "Overhead",
    description: "See the aircraft crossing Frederick right now.",
    icon: Plane,
    color: "var(--app-cool)",
  },
  {
    href: "/numbers",
    label: "The county, counted",
    description: "See counts computed from the current Radius dataset.",
    icon: Sigma,
    color: "var(--app-brand-2)",
  },
];

const CONTRIBUTE: CompassItem[] = [
  {
    href: "/report",
    label: "Mark a spot",
    description: "Add a useful note to the map.",
    icon: MapPin,
    color: "var(--app-brand)",
  },
  {
    href: "/submit/event",
    label: "Add an event",
    description: "Submit an event for the calendar.",
    icon: CalendarPlus,
    color: "var(--app-brand)",
  },
  {
    href: "/submit/place",
    label: "Add a place",
    description: "Tell us which place the map is missing.",
    icon: CirclePlus,
    color: "var(--app-positive)",
  },
];

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const noHomeTown = () => null;

export default function CompassHub() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(subscribeHomeTown, getHomeMuni, noHomeTown);
  const home = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;
  const warm = (href: string) => router.prefetch(href);
  const intentProps = (href: string) => ({
    onMouseEnter: () => warm(href),
    onFocus: () => warm(href),
    onPointerDown: () => warm(href),
  });

  return (
    <div className="space-y-10">
      {/* Field-guide plate masthead — the wayfinding hub now speaks the same
          paper-cream plate language as every sibling surface (eyebrow +
          serif title + brand rule) instead of a one-off dark gradient hero.
          The compass motif rides as a small eyebrow mark, not a banner. */}
      <header className="relative -mx-4 -mt-6 overflow-hidden border-y border-black/10 bg-[var(--app-bg-elevated-solid)] px-5 py-8 text-[var(--app-ink)] shadow-[var(--app-elev-1)] sm:-mx-5 sm:px-8 sm:py-10 lg:mx-0 lg:mt-0 lg:rounded-[8px] lg:border lg:px-10">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-[#e14328]/28" aria-hidden>
          <span className="absolute inset-10 rounded-full border border-black/7" />
          <span className="absolute inset-[5.2rem] rounded-full border border-[#e14328]/20" />
          <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e14328] shadow-[0_0_0_8px_rgba(225,67,40,.12)]" />
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
          <span className="h-px w-10 bg-[#e14328]" aria-hidden />
          Open a tool
        </div>
      </header>

      <section aria-labelledby="compass-start" className="space-y-3">
        <SectionHeading id="compass-start" numeral="I" title="Start here" />
        <LedgerList items={START_HERE} intentProps={intentProps} />
      </section>

      <section aria-labelledby="compass-yours" className="space-y-3">
        <SectionHeading id="compass-yours" numeral="II" title="Yours" />
        <LedgerList
          cols={3}
          intentProps={intentProps}
          items={[
            {
              href: home ? `/m/${home.slug}` : "/settings",
              label: home ? home.name : "Choose your home town",
              description: home ? "Open the guide for your home area." : "Choose a home area for nearby results.",
              icon: MapPin,
              color: "var(--app-brand)",
            },
            { href: "/my-radius", label: "Saved", description: "Open the places and events you saved.", icon: Bookmark, color: "var(--app-brand-2)" },
            { href: "/settings", label: "Settings", description: "Change how Radius is set up for you.", icon: Settings, color: "var(--app-cool)" },
          ]}
        />
      </section>

      <section aria-labelledby="compass-discover">
        <SectionHeading id="compass-discover" numeral="III" title="The guides" />
        <ul className="mt-3 grid grid-cols-2 gap-2.5">
          {DISCOVER.map((item, index) => (
            <li key={item.href}>
              <EditorialCard item={item} index={index} intentProps={intentProps(item.href)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="compass-practical">
        <SectionHeading id="compass-practical" numeral="IV" title="Get something done" />
        <div className="mt-3">
          <LedgerList items={PRACTICAL} intentProps={intentProps} />
        </div>
      </section>

      <section aria-labelledby="compass-curious">
        <SectionHeading id="compass-curious" numeral="V" title="More county data" />
        <div className="mt-3">
          <LedgerList items={CURIOSITIES} intentProps={intentProps} />
        </div>
      </section>

      <section aria-labelledby="compass-contribute" className="space-y-3">
        <SectionHeading
          id="compass-contribute"
          numeral="VI"
          title="Help make the guide better"
          description="Add what is missing or keep a local listing accurate."
        />
        <LedgerList items={CONTRIBUTE} intentProps={intentProps} />
      </section>

    </div>
  );
}

/** A printed-index section heading: roman numeral, serif title, and the
 *  fg-rule running to the edge — a table of contents, not a stack of hero
 *  headers. Replaced the eyebrow + 28px title + description block that made
 *  every section spend ~90px before showing a single destination. */
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
 *  Every section that isn't the signature numbered guide-cards uses this,
 *  replacing four competing card styles with one dense, calm column. */
function LedgerList({
  items,
  cols = 2,
  intentProps,
}: {
  items: CompassItem[];
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
      {/* href alone can repeat ("Choose your home town" and "Settings"
          both land on /settings until a home is set) — key on the pair. */}
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

function EditorialCard({
  item,
  index,
  intentProps,
}: {
  item: CompassItem;
  index: number;
  intentProps: Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown">;
}) {
  const style = {
    "--compass-card-accent": item.color,
    borderColor: "var(--app-border)",
    background: `linear-gradient(158deg, color-mix(in srgb, ${item.color} 10%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 66%)`,
    boxShadow: "0 12px 28px -24px rgba(22,20,14,.55)",
  } as CSSProperties;

  return (
    <Link
      href={item.href}
      prefetch={false}
      {...intentProps}
      className="tactile-interactive group relative block min-h-[138px] overflow-hidden rounded-[6px] border p-3.5 sm:min-h-[150px] sm:p-4"
      style={style}
    >
      <span className="font-mono text-[9px] font-semibold tracking-[0.14em]" style={{ color: item.color }} aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <item.icon className="absolute right-3 top-3 h-5 w-5 opacity-60 sm:h-6 sm:w-6" strokeWidth={1.55} style={{ color: item.color }} aria-hidden />
      <span className="mt-5 block font-serif text-[17px] font-semibold leading-tight tracking-tight sm:text-[19px]" style={{ color: "var(--app-ink)" }}>{item.label}</span>
      <span className="mt-1.5 block max-w-[20rem] text-[11.5px] leading-snug sm:pr-3 sm:text-[12px] sm:leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{item.description}</span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-[0.24] transition-transform duration-300 group-hover:scale-x-100" style={{ background: item.color }} />
    </Link>
  );
}
