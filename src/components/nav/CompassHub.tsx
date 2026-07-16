"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarCheck,
  ChevronRight,
  CirclePlus,
  HandHeart,
  History,
  Landmark,
  Map,
  MapPin,
  Navigation,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

type Item = { href: string; label: string; note: string; icon: LucideIcon };

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

  return (
    <main className="space-y-10 pb-5 sm:space-y-12">
      <header className="border-b pb-7 sm:pb-9" style={{ borderColor: "var(--app-border-strong)" }}>
        <h1 className="max-w-[38rem] font-serif text-[39px] font-semibold leading-[0.94] tracking-[-0.045em] sm:text-[52px]" style={{ color: "var(--app-ink)" }}>
          Browse Frederick County.
        </h1>
        <p className="mt-4 max-w-[34rem] text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Town guides, local tools, history, and collections in one place.
        </p>
      </header>

      <section aria-labelledby="compass-yours-heading" className="grid overflow-hidden rounded-[20px] border bg-[var(--app-bg-elevated)] sm:grid-cols-[0.72fr_1.28fr]" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
        <div className="border-b p-5 sm:border-b-0 sm:border-r sm:p-6" style={{ borderColor: "var(--app-border)" }}>
          <h2 id="compass-yours-heading" className="font-serif text-[25px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>Your Frederick</h2>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>Saved places and your home town.</p>
        </div>
        <div className="divide-y px-5" style={{ borderColor: "var(--app-border)" }}>
          <SimpleRow href="/my-radius" label="Saved places and events" note="Your personal short list" icon={<Bookmark className="h-[18px] w-[18px]" aria-hidden />} />
          <SimpleRow href={home ? `/m/${home.slug}` : "/settings"} label={home ? home.name : "Choose your home town"} note={home ? "Open your town guide" : "Tune nearby results"} icon={<MapPin className="h-[18px] w-[18px]" aria-hidden />} />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <Directory title="Explore" items={EXPLORE} warm={warm} />
        <Directory title="Practical" items={PRACTICAL} warm={warm} />
      </div>

      <details className="group border-y" style={{ borderColor: "var(--app-border-strong)" }}>
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
          <CirclePlus className="h-[18px] w-[18px]" style={{ color: "var(--app-brand)" }} aria-hidden />
          Help improve Frederick Radius
          <span className="hidden text-[11px] font-normal sm:inline" style={{ color: "var(--app-ink-3)" }}>Add a place, event, or field note</span>
          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t py-3 sm:grid-cols-4" style={{ borderColor: "var(--app-border)" }}>
          <SmallLink href="/report" label="Mark a spot" icon={<MapPin className="h-4 w-4" />} />
          <SmallLink href="/submit/event" label="Add an event" icon={<CirclePlus className="h-4 w-4" />} />
          <SmallLink href="/submit/place" label="Add a place" icon={<CirclePlus className="h-4 w-4" />} />
          <SmallLink href="/settings" label="Settings" icon={<Settings className="h-4 w-4" />} />
        </div>
      </details>

    </main>
  );
}

function Directory({ title, items, warm }: { title: string; items: Item[]; warm: (href: string) => { onMouseEnter: () => void; onFocus: () => void } }) {
  return (
    <section>
      <h2 className="font-serif text-[27px] font-semibold tracking-[-0.025em]" style={{ color: "var(--app-ink)" }}>{title}</h2>
      <ul className="mt-3 border-t" style={{ borderColor: "var(--app-border-strong)" }}>
        {items.map((item) => (
          <li key={item.href} className="border-b" style={{ borderColor: "var(--app-border)" }}>
            <Link href={item.href} prefetch={false} {...warm(item.href)} className="group flex min-h-[64px] items-center gap-3 py-2">
              <item.icon className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{item.label}</span><span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{item.note}</span></span>
              <ArrowRight className="h-3.5 w-3.5 opacity-30 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SimpleRow({ href, label, note, icon }: { href: string; label: string; note: string; icon: ReactNode }) {
  return <Link href={href} prefetch={false} className="group flex min-h-[72px] items-center gap-3"><span style={{ color: "var(--app-brand)" }}>{icon}</span><span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span><span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{note}</span></span><ArrowRight className="h-4 w-4 opacity-30 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>;
}

function SmallLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return <Link href={href} className="flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[12px] font-semibold" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>{icon}{label}</Link>;
}
