"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Clock3,
  Compass,
  HandHeart,
  History,
  Landmark,
  Map,
  MapPin,
  Navigation,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

type Item = { href: string; label: string; note: string; icon: LucideIcon };

const START: Item[] = [
  { href: "/open-now", label: "Open now", note: "Food, coffee, shops", icon: Clock3 },
  { href: "/nearby", label: "Near me", note: "Ranked from your location", icon: Navigation },
  { href: "/events?lens=weekend", label: "This weekend", note: "The calendar, narrowed", icon: CalendarDays },
  { href: "/plan", label: "Make a plan", note: "Build a few good hours", icon: CalendarCheck },
];

const EXPLORE: Item[] = [
  { href: "/collections", label: "Collections", note: "Edited shortlists", icon: Sparkles },
  { href: "/towns", label: "Towns", note: "Guides across the county", icon: Map },
  { href: "/archive", label: "Archive Lens", note: "Maps, photos, newspapers", icon: History },
  { href: "/history", label: "History", note: "Stories tied to place", icon: Landmark },
  { href: "/markers", label: "Markers & landmarks", note: "Historic places in the field", icon: MapPin },
  { href: "/nonprofits", label: "Nonprofits", note: "Organizations by cause", icon: HandHeart },
  ...(CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED
    ? [{ href: "/from-above/time-machine", label: "Aerial time machine", note: "A block across 65 years", icon: History }]
    : []),
];

const PRACTICAL: Item[] = [
  { href: "/parking", label: "Parking", note: "Downtown garages and lots", icon: MapPin },
  { href: "/transit", label: "Transit", note: "Buses and MARC", icon: Navigation },
  { href: "/contacts", label: "County services", note: "Permits, trash, taxes, voting", icon: Landmark },
  { href: "/check-a-date", label: "Check a date", note: "See what is already happening", icon: CalendarCheck },
  { href: "/deals", label: "Deals", note: "Verified daily specials", icon: Sparkles },
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
  const warm = (href: string) => ({
    onMouseEnter: () => router.prefetch(href),
    onFocus: () => router.prefetch(href),
  });

  const openSearch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.dispatchEvent(new Event("fr:open-search"));
  };

  return (
    <main className="space-y-7 pb-5">
      <header className="px-0.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          <Compass className="h-4 w-4" aria-hidden /> Compass
        </div>
        <h1 className="mt-2 max-w-[26rem] font-serif text-[36px] font-semibold leading-[0.96] tracking-[-0.035em] sm:text-[44px]" style={{ color: "var(--app-ink)" }}>
          Where do you want to go?
        </h1>
        <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-ink-2)" }}>One starting point for every guide, map, and local tool.</p>

        <Link
          href="/search"
          prefetch={false}
          onClick={openSearch}
          className="mt-4 flex min-h-12 items-center gap-3 rounded-[14px] border bg-[var(--app-bg-elevated-solid)] px-4"
          style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
        >
          <Search className="h-[18px] w-[18px]" style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="flex-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>Search Frederick Radius</span>
          <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>⌘K</span>
        </Link>
      </header>

      <section aria-labelledby="compass-start-heading">
        <h2 id="compass-start-heading" className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Start here</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {START.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} {...warm(item.href)} className="group min-h-[116px] rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
              <item.icon className="h-[18px] w-[18px]" style={{ color: "var(--app-brand)" }} aria-hidden />
              <span className="mt-4 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{item.label}<ArrowRight className="h-3.5 w-3.5 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="mt-1 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{item.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="compass-yours-heading">
        <h2 id="compass-yours-heading" className="sr-only">Your Frederick</h2>
        <div className="divide-y rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-4" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
          <SimpleRow href="/my-radius" label="Saved places and events" note="Pick up where you left off" icon={<Bookmark className="h-[18px] w-[18px]" aria-hidden />} />
          <SimpleRow href={home ? `/m/${home.slug}` : "/settings"} label={home ? home.name : "Choose your home town"} note={home ? "Open your town guide" : "Tune nearby results"} icon={<MapPin className="h-[18px] w-[18px]" aria-hidden />} />
        </div>
      </section>

      <Directory title="Explore Frederick" items={EXPLORE} warm={warm} />
      <Directory title="Practical tools" items={PRACTICAL} warm={warm} />

      <details className="group rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]" style={{ borderColor: "var(--app-border)" }}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Add or correct something
          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t p-3" style={{ borderColor: "var(--app-border)" }}>
          <SmallLink href="/report" label="Mark a spot" icon={<MapPin className="h-4 w-4" />} />
          <SmallLink href="/submit/event" label="Add an event" icon={<CirclePlus className="h-4 w-4" />} />
          <SmallLink href="/submit/place" label="Add a place" icon={<CirclePlus className="h-4 w-4" />} />
          <SmallLink href="/settings" label="Settings" icon={<Settings className="h-4 w-4" />} />
        </div>
      </details>

      <nav aria-label="About Frederick Radius" className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t pt-5 text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        <Link href="/about">About</Link>
        <Link href="/trust" className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Trust & data</Link>
        <Link href="/terms">Terms & privacy</Link>
      </nav>
    </main>
  );
}

function Directory({ title, items, warm }: { title: string; items: Item[]; warm: (href: string) => { onMouseEnter: () => void; onFocus: () => void } }) {
  return (
    <details className="group border-y" style={{ borderColor: "var(--app-border)" }}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {title}<span className="ml-2 text-[11px] font-normal" style={{ color: "var(--app-ink-3)" }}>{items.length}</span>
        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="pb-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} {...warm(item.href)} className="group flex min-h-[58px] items-center gap-3">
              <item.icon className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{item.label}</span><span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{item.note}</span></span>
              <ArrowRight className="h-3.5 w-3.5 opacity-30 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SimpleRow({ href, label, note, icon }: { href: string; label: string; note: string; icon: ReactNode }) {
  return <Link href={href} prefetch={false} className="group flex min-h-[64px] items-center gap-3"><span style={{ color: "var(--app-brand)" }}>{icon}</span><span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span><span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{note}</span></span><ArrowRight className="h-4 w-4 opacity-30 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>;
}

function SmallLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return <Link href={href} className="flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[12px] font-semibold" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>{icon}{label}</Link>;
}
