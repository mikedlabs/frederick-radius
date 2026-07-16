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
  Navigation,
  Package,
  ParkingCircle,
  Plane,
  Settings,
  ShieldCheck,
  Store,
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
    href: "/open-now",
    label: "Open now",
    description: "Food, shops, and useful places open this minute",
    icon: Clock3,
    color: "var(--app-positive)",
  },
  {
    href: "/events?lens=weekend",
    label: "This weekend",
    description: "The county calendar, already narrowed to Friday–Sunday",
    icon: CalendarDays,
    color: "var(--app-brand)",
  },
  {
    href: "/nearby",
    label: "Near me",
    description: "Good options ranked from where you are",
    icon: Navigation,
    color: "var(--app-cool)",
  },
  {
    href: "/plan",
    label: "Make a plan",
    description: "Build a few hours around a mood or an occasion",
    icon: CalendarCheck,
    color: "var(--app-accent-press)",
  },
];

const DISCOVER: CompassItem[] = [
  {
    href: "/collections",
    label: "Collections",
    description: "Hand-picked shortlists for date night, rainy days, kids, and more.",
    icon: Layers3,
    color: "var(--app-brand)",
  },
  {
    href: "/towns",
    label: "Towns",
    description: "Meet the city, towns, village, and communities that make the county.",
    icon: Map,
    color: "var(--app-brand-2)",
  },
  {
    href: "/history",
    label: "History",
    description: "Frederick's story, tied to the places where it happened.",
    icon: History,
    color: "var(--app-accent-press)",
  },
  {
    href: "/markers",
    label: "Markers & landmarks",
    description: "Roadside inscriptions, covered bridges, and historic landmarks.",
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
    description: "See Frederick County as an aerial field guide.",
    icon: Camera,
    color: "var(--app-cool)",
  },
];

const PRACTICAL: CompassItem[] = [
  {
    href: "/parking",
    label: "Parking",
    description: "Garages, lots, live guidance, and local backup options",
    icon: ParkingCircle,
    color: "var(--app-cool)",
  },
  {
    href: "/transit",
    label: "Transit",
    description: "Live buses, TransIT routes, and MARC information",
    icon: BusFront,
    color: "var(--app-cool)",
  },
  {
    href: "/contacts",
    label: "County services",
    description: "Permits, trash, taxes, voting, and who to call",
    icon: Landmark,
    color: "var(--app-civic)",
  },
  {
    href: "/check-a-date",
    label: "Check a date",
    description: "See what is already happening before you schedule",
    icon: CalendarCheck,
    color: "var(--app-brand-2)",
  },
  {
    href: "/shipping",
    label: "Post & shipping",
    description: "Post offices, UPS, FedEx, and collection boxes",
    icon: Package,
    color: "var(--app-brand-2)",
  },
  {
    href: "/deals",
    label: "Deals",
    description: "Verified local specials, organized by day",
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
    label: "The Rhythm",
    description: "Watch the county wake and sleep, hour by hour.",
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
];

const CONTRIBUTE: CompassItem[] = [
  {
    href: "/report",
    label: "Mark a spot",
    description: "Add a useful note to the map",
    icon: MapPin,
    color: "var(--app-brand)",
  },
  {
    href: "/submit/event",
    label: "Add an event",
    description: "Submit something for the calendar",
    icon: CalendarPlus,
    color: "var(--app-brand)",
  },
  {
    href: "/submit/place",
    label: "Add a place",
    description: "Tell us what the map is missing",
    icon: CirclePlus,
    color: "var(--app-positive)",
  },
  {
    href: "/business/claim",
    label: "Claim a business",
    description: "Keep your listing accurate",
    icon: Store,
    color: "var(--app-brand-2)",
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
    <div className="space-y-7">
      {/* Field-guide plate masthead — the wayfinding hub now speaks the same
          paper-cream plate language as every sibling surface (eyebrow +
          serif title + brand rule) instead of a one-off dark gradient hero.
          The compass motif rides as a small eyebrow mark, not a banner. */}
      <header className="px-0.5">
        <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
          <Compass className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Frederick County compass
        </p>
        <h1
          className="mt-2 max-w-[19rem] font-serif text-[34px] font-semibold leading-[0.98] tracking-[-0.02em] text-balance sm:max-w-[30rem] sm:text-[44px]"
          style={{ color: "var(--app-ink)" }}
        >
          Find your way around Frederick.
        </h1>
        <p
          className="mt-3 max-w-[28rem] text-[13.5px] leading-relaxed sm:text-[14px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          Start with what you need. Compass will get you to the right guide,
          map, calendar, or local tool.
        </p>
        <span aria-hidden className="mt-3 block h-[3px] w-11 rounded-full" style={{ background: "var(--app-brand)" }} />
      </header>

      <section aria-labelledby="compass-start" className="space-y-3">
        <SectionHeading id="compass-start" numeral="I" title="Right now" />
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
              description: home ? "Your local guide" : "Tune nearby results",
              icon: MapPin,
              color: "var(--app-brand)",
            },
            { href: "/my-radius", label: "Saved", description: "Places and events you kept", icon: Bookmark, color: "var(--app-brand-2)" },
            { href: "/settings", label: "Tune Compass", description: "Home, interests, and alerts", icon: Settings, color: "var(--app-cool)" },
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
        <SectionHeading id="compass-curious" numeral="V" title="Curiosities" />
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

      <nav aria-label="About Frederick Radius" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-5 text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        <Link href="/about" prefetch={false} {...intentProps("/about")} className="hover:underline">About</Link>
        <Link href="/trust" prefetch={false} {...intentProps("/trust")} className="inline-flex items-center gap-1 hover:underline"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Trust & data</Link>
        <Link href="/terms" prefetch={false} {...intentProps("/terms")} className="hover:underline">Terms & privacy</Link>
      </nav>
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
      className={`overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] sm:grid ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      {/* href alone can repeat ("Choose your home town" and "Tune Compass"
          both land on /settings until a home is set) — key on the pair. */}
      {items.map((item) => (
        <li key={`${item.href}|${item.label}`} className={liClass} style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={item.href}
            prefetch={false}
            {...intentProps(item.href)}
            className="tactile-interactive group flex min-h-[68px] items-center gap-3 px-3.5 py-3"
          >
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ color: item.color, background: `color-mix(in srgb, ${item.color} 11%, transparent)` }}>
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
    boxShadow: "var(--app-elev-1), var(--app-hi)",
  } as CSSProperties;

  return (
    <Link
      href={item.href}
      prefetch={false}
      {...intentProps}
      className="tactile tactile-interactive group relative block min-h-[138px] overflow-hidden rounded-[var(--app-radius-lg)] border p-3.5 sm:min-h-[150px] sm:p-4"
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
