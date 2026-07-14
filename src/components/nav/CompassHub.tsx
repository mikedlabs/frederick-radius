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
  Search,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";

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
  {
    href: "/from-above/time-machine",
    label: "Time Machine",
    description: "Scrub a block through 65 years of aerial imagery.",
    icon: History,
    color: "var(--app-cool)",
  },
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

  const openSearch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // /search remains the no-JS destination. In the hydrated app, the global
    // overlay is faster and keeps people in context.
    event.preventDefault();
    window.dispatchEvent(new Event("fr:open-search"));
  };

  return (
    <div className="space-y-9">
      <header
        className="relative overflow-hidden rounded-[24px] border px-5 pb-5 pt-6 sm:px-7 sm:pb-7 sm:pt-8"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand-2) 70%, black)",
          background:
            "radial-gradient(circle at 88% 5%, color-mix(in srgb, var(--app-cool) 70%, transparent), transparent 36%), linear-gradient(145deg, var(--app-brand-2), color-mix(in srgb, var(--app-brand-2) 76%, var(--app-bedrock)))",
          boxShadow: "var(--app-elev-2), var(--app-edge)",
          color: "var(--app-ink-inverse)",
        }}
      >
        <CompassDial />
        <div className="relative max-w-[34rem]">
          <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">
            <Compass className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Frederick County compass
          </p>
          <h1 className="mt-3 max-w-[19rem] font-serif text-[34px] font-semibold leading-[0.98] tracking-[-0.035em] text-balance sm:max-w-[30rem] sm:text-[44px]">
            Find your way around Frederick.
          </h1>
          <p className="mt-3 max-w-[28rem] text-[13.5px] leading-relaxed opacity-80 sm:text-[14px]">
            Start with what you need. Compass will get you to the right guide,
            map, calendar, or local tool.
          </p>
          <Link
            href="/search"
            prefetch={false}
            onClick={openSearch}
            className="tactile-interactive mt-5 flex min-h-12 w-full items-center gap-3 rounded-[14px] border px-4 text-left"
            style={{
              borderColor: "rgba(255,255,255,0.24)",
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink)",
              boxShadow: "0 10px 30px -18px rgba(0,0,0,0.75), var(--app-hi)",
            }}
          >
            <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium" style={{ color: "var(--app-ink-2)" }}>
              Search places, events, towns…
            </span>
            <span className="hidden rounded-md border px-1.5 py-0.5 font-mono text-[9px] sm:inline" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
              ⌘K
            </span>
          </Link>
        </div>
      </header>

      <section aria-labelledby="compass-start">
        <SectionHeading
          id="compass-start"
          eyebrow="Start here"
          title="What do you need?"
          description="The four fastest ways into the county."
        />
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3">
          {START_HERE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile tactile-interactive group flex min-h-[134px] h-full flex-col rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 sm:min-h-[142px] sm:p-4"
                style={{
                  borderColor: "var(--app-border)",
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{
                    color: item.color,
                    background: `color-mix(in srgb, ${item.color} 13%, transparent)`,
                  }}
                >
                  <item.icon className="h-[17px] w-[17px]" strokeWidth={2.1} />
                </span>
                <span className="mt-3 block font-serif text-[18px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {item.label}
                </span>
                <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                  {item.description}
                </span>
                <ArrowRight className="mt-auto h-3.5 w-3.5 self-end transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} style={{ color: item.color }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="compass-yours">
        <SectionHeading id="compass-yours" eyebrow="Your Frederick" title="Pick up where you left off." />
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <PersonalLink
            href={home ? `/m/${home.slug}` : "/settings"}
            label={home ? home.name : "Choose your home town"}
            description={home ? "Your local guide" : "Tune nearby results"}
            icon={MapPin}
            color="var(--app-brand)"
            {...intentProps(home ? `/m/${home.slug}` : "/settings")}
          />
          <PersonalLink
            href="/my-radius"
            label="Saved"
            description="Places and events you kept"
            icon={Bookmark}
            color="var(--app-brand-2)"
            {...intentProps("/my-radius")}
          />
          <PersonalLink
            href="/settings"
            label="Tune Compass"
            description="Home, interests, and alerts"
            icon={Settings}
            color="var(--app-cool)"
            {...intentProps("/settings")}
          />
        </div>
      </section>

      <section aria-labelledby="compass-discover">
        <SectionHeading
          id="compass-discover"
          eyebrow="Explore the county"
          title="Go beyond the directory."
          description="Edited ways into Frederick's places and stories."
        />
        <ul className="mt-3 grid grid-cols-2 gap-2.5">
          {DISCOVER.map((item, index) => (
            <li key={item.href}>
              <EditorialCard item={item} index={index} intentProps={intentProps(item.href)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="compass-practical">
        <SectionHeading
          id="compass-practical"
          eyebrow="Practical Frederick"
          title="Get something done."
          description="Useful local answers without hunting through agency sites."
        />
        <ul
          className="mt-3 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] sm:grid sm:grid-cols-2"
          style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
        >
          {PRACTICAL.map((item) => (
            <li
              key={item.href}
              className="border-b last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r"
              style={{ borderColor: "var(--app-border)" }}
            >
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile-interactive group flex min-h-[76px] items-center gap-3 px-3.5 py-3"
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
      </section>

      <section aria-labelledby="compass-curious">
        <SectionHeading id="compass-curious" eyebrow="Curiosities" title="See Frederick differently." />
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {CURIOSITIES.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile tactile-interactive group relative block h-full min-h-[132px] overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
                style={{
                  borderColor: "var(--app-border)",
                  background: `linear-gradient(145deg, color-mix(in srgb, ${item.color} 13%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))`,
                  boxShadow: "var(--app-elev-1), var(--app-hi)",
                }}
              >
                <item.icon className="absolute -bottom-3 -right-3 h-20 w-20 opacity-[0.07]" strokeWidth={1.1} style={{ color: item.color }} aria-hidden />
                <item.icon className="h-5 w-5" strokeWidth={1.9} style={{ color: item.color }} aria-hidden />
                <span className="mt-5 block font-serif text-[17px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
                <span className="mt-1 block max-w-[16rem] text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="compass-contribute"
        className="rounded-[var(--app-radius-lg)] border p-4 sm:p-5"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand-2) 28%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-brand-2) 6%, var(--app-bg-elevated-solid))",
          boxShadow: "var(--app-hi)",
        }}
      >
        <SectionHeading
          id="compass-contribute"
          eyebrow="Made with Frederick"
          title="Help make the guide better."
          description="Add what is missing or keep a local listing accurate."
        />
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {CONTRIBUTE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                {...intentProps(item.href)}
                className="tactile-interactive flex min-h-[86px] h-full flex-col rounded-[13px] border bg-[var(--app-bg-elevated)] p-3"
                style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-hi)" }}
              >
                <item.icon className="h-[17px] w-[17px]" strokeWidth={2} style={{ color: item.color }} aria-hidden />
                <span className="mt-2 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{item.label}</span>
                <span className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="About Frederick Radius" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-5 text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        <Link href="/about" prefetch={false} {...intentProps("/about")} className="hover:underline">About</Link>
        <Link href="/trust" prefetch={false} {...intentProps("/trust")} className="inline-flex items-center gap-1 hover:underline"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Trust & data</Link>
        <Link href="/terms" prefetch={false} {...intentProps("/terms")} className="hover:underline">Terms & privacy</Link>
      </nav>
    </div>
  );
}

function CompassDial() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 opacity-[0.16] sm:-right-7 sm:-top-14 sm:h-64 sm:w-64"
      fill="none"
    >
      <circle cx="100" cy="100" r="78" stroke="currentColor" strokeWidth="1" />
      <circle cx="100" cy="100" r="56" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
      <path d="M100 9 113 87 191 100 113 113 100 191 87 113 9 100 87 87 100 9Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="m100 34 9 57-9 9-9-9 9-57Z" fill="currentColor" />
      <circle cx="100" cy="100" r="7" fill="currentColor" />
    </svg>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>{eyebrow}</p>
      <h2 id={id} className="mt-1 font-serif text-[25px] font-semibold leading-[1.05] tracking-tight sm:text-[28px]" style={{ color: "var(--app-ink)" }}>
        {title}
      </h2>
      {description ? <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{description}</p> : null}
    </div>
  );
}

function PersonalLink({
  href,
  label,
  description,
  icon: Icon,
  color,
  ...events
}: CompassItem & Pick<React.ComponentProps<typeof Link>, "onMouseEnter" | "onFocus" | "onPointerDown">) {
  return (
    <Link
      href={href}
      prefetch={false}
      {...events}
      className="tactile-interactive group flex min-h-[72px] items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-3"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <Icon className="h-4 w-4" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span>
        <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{description}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-35 transition group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
    </Link>
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
      className="tactile tactile-interactive group relative block min-h-[174px] overflow-hidden rounded-[var(--app-radius-lg)] border p-3.5 sm:min-h-[150px] sm:p-4"
      style={style}
    >
      <span className="font-mono text-[9px] font-semibold tracking-[0.14em]" style={{ color: item.color }} aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <item.icon className="absolute right-3 top-3 h-5 w-5 opacity-60 sm:h-6 sm:w-6" strokeWidth={1.55} style={{ color: item.color }} aria-hidden />
      <span className="mt-7 block font-serif text-[17px] font-semibold leading-tight tracking-tight sm:text-[19px]" style={{ color: "var(--app-ink)" }}>{item.label}</span>
      <span className="mt-1.5 block max-w-[20rem] text-[11.5px] leading-snug sm:pr-3 sm:text-[12px] sm:leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{item.description}</span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-[0.24] transition-transform duration-300 group-hover:scale-x-100" style={{ background: item.color }} />
    </Link>
  );
}
