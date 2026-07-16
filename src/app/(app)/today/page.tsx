import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Clock3,
  Compass,
  MapPin,
  ParkingCircle,
  Sparkles,
} from "lucide-react";
import { easternDayKey } from "@/lib/tz";
import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";
import CivicAlerts from "@/components/today/CivicAlerts";
import FreshnessGuard from "@/components/today/FreshnessGuard";
import MomentSpotlight from "@/components/today/MomentSpotlight";
import ShareTodayButton from "@/components/today/ShareTodayButton";
import SkyHero from "@/components/today/SkyHero";
import TodayAsk from "@/components/today/TodayAsk";
import TodayBestBets from "@/components/today/TodayBestBets";
import TodayCard from "@/components/today/TodayCard";
import { activeMoment } from "@/data/civic-moments";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const day = easternDayKey(new Date());
  const description = "A clear, current guide to what matters and what is worth doing in Frederick County today.";
  return {
    alternates: { canonical: "/today" },
    title: "Today in Frederick County",
    description,
    openGraph: {
      title: "Today in Frederick County",
      description,
      images: [{ url: `/api/og?type=almanac&day=${day}`, width: 1200, height: 630, alt: `Frederick County today, ${day}` }],
    },
  };
}

const PRIMARY = [
  { href: "/open-now", label: "Open now", note: "Food, coffee, shops", icon: Clock3 },
  { href: "/events?lens=today", label: "Happening today", note: "Events and live music", icon: CalendarDays },
  { href: "/nearby", label: "Near me", note: "Ranked from your location", icon: MapPin },
  { href: "/plan", label: "Make a plan", note: "A few hours, built around you", icon: Sparkles },
];

const USEFUL = [
  { href: "/happy-hour", label: "Happy hour", note: "Verified weekday specials", icon: Clock3 },
  { href: "/parking", label: "Downtown parking", note: "Garages, lots, and a backup", icon: ParkingCircle },
  { href: "/pulse", label: "County pulse", note: "Roads, power, schools, and alerts", icon: Compass },
];

function todayDateline(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export default function TodayPage() {
  const now = new Date();
  const moment = activeMoment(now);

  return (
    <main className="relative space-y-7 pb-5">
      <PageBloom variant="warm-cool" />
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      <Suspense fallback={null}>
        <div className="[&:not(:empty)]:mb-1"><CivicAlerts /></div>
      </Suspense>
      {moment ? <MomentSpotlight moment={moment} /> : null}

      <header className="px-0.5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>{todayDateline(now)}</p>
          <ShareTodayButton />
        </div>
        <h1 className="mt-2 font-serif text-[36px] font-semibold leading-[0.96] tracking-[-0.035em] sm:text-[44px]" style={{ color: "var(--app-ink)" }}>
          Today in Frederick.
        </h1>
        <p className="mt-2 max-w-[34rem] text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          What matters now, and a few good ways to spend the day.
        </p>
      </header>

      <SkyHero className="relative overflow-hidden rounded-[var(--app-radius-lg)]">
        <Link href="/pulse?open=weather" prefetch={false} aria-label="Open the full forecast" className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]">
          <Suspense fallback={<Skeleton.Block height={110} round="var(--app-radius-lg)" />}>
            <TodayCard />
          </Suspense>
          <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 opacity-45 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </SkyHero>

      <TodayAsk />

      <section aria-labelledby="today-shortcuts-heading">
        <h2 id="today-shortcuts-heading" className="sr-only">Quick ways into Frederick Radius</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {PRIMARY.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className="group min-h-[108px] rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5 transition active:scale-[0.99]" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
              <item.icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
              <span className="mt-3 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{item.label}<ArrowRight className="h-3.5 w-3.5 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="mt-1 block text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{item.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <TodayBestBets />

      <section aria-labelledby="today-useful-heading">
        <h2 id="today-useful-heading" className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Useful right now</h2>
        <div className="mt-3 divide-y border-y" style={{ borderColor: "var(--app-border)" }}>
          {USEFUL.map((item) => <UtilityRow key={item.href} {...item} />)}
        </div>
      </section>

      <details className="group rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]" style={{ borderColor: "var(--app-border)" }}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          More for today
          <ArrowRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <nav aria-label="More for today" className="grid grid-cols-2 gap-2 border-t p-3" style={{ borderColor: "var(--app-border)" }}>
          <MoreLink href="/deals" label="Deals" />
          <MoreLink href="/collections" label="Collections" />
          <MoreLink href="/my-radius" label="Saved" icon={<Bookmark className="h-4 w-4" aria-hidden />} />
          <MoreLink href="/compass" label="All tools" icon={<Compass className="h-4 w-4" aria-hidden />} />
        </nav>
      </details>
    </main>
  );
}

function UtilityRow({ href, label, note, icon: Icon }: (typeof USEFUL)[number]) {
  return (
    <Link href={href} prefetch={false} className="group flex min-h-[66px] items-center gap-3 py-2.5">
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span>
        <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{note}</span>
      </span>
      <ArrowRight className="h-4 w-4 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function MoreLink({ href, label, icon }: { href: string; label: string; icon?: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[12px] font-semibold" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
      {icon}{label}<ArrowRight className="ml-auto h-3.5 w-3.5 opacity-35" aria-hidden />
    </Link>
  );
}
