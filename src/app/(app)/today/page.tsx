import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  ParkingCircle,
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
import { EVENTS } from "@/data/events";
import { selectTodayEvents } from "@/lib/today-events";

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

type Shortcut = { href: string; label: string; note: string; icon: typeof Clock3 };

const CORE_SHORTCUTS: Shortcut[] = [
  { href: "/open-now", label: "Open now", note: "Food, coffee, shops", icon: Clock3 },
  { href: "/events?lens=today", label: "Today’s events", note: "What’s happening around the county", icon: CalendarDays },
];

const HAPPY_HOUR_SHORTCUT: Shortcut = {
  href: "/happy-hour", label: "Happy hour", note: "Verified weekday specials", icon: Clock3,
};

const PARKING_SHORTCUT: Shortcut = {
  href: "/parking", label: "Parking", note: "Downtown garages and lots", icon: ParkingCircle,
};

function shortcutsFor(now: Date): Shortcut[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const timelyHappyHour = isWeekday && hour >= 14 && hour < 20;
  return [...CORE_SHORTCUTS, timelyHappyHour ? HAPPY_HOUR_SHORTCUT : PARKING_SHORTCUT];
}

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
  const initialEvents = selectTodayEvents(EVENTS, now);
  const shortcuts = shortcutsFor(now);

  return (
    <main className="relative space-y-5 pb-5 sm:space-y-7">
      <PageBloom variant="warm-cool" />
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      <Suspense fallback={null}>
        <CivicAlerts includeWeather={false} />
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

      <SkyHero className="relative overflow-hidden rounded-[var(--app-radius-lg)] !py-3 sm:!py-4">
        <Link href="/pulse?open=weather" prefetch={false} aria-label="Open the full forecast" className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]">
          <Suspense fallback={<Skeleton.Block height={110} round="var(--app-radius-lg)" />}>
            <TodayCard />
          </Suspense>
          <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 opacity-45 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </SkyHero>

      <Suspense fallback={<Skeleton.Block height={132} round="var(--app-radius-lg)" />}>
        <TodayAsk />
      </Suspense>

      <TodayBestBets initial={{ events: initialEvents, partial: true }} />

      <section aria-labelledby="today-shortcuts-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="today-shortcuts-heading" className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Useful today</h2>
          <Link href="/compass" className="group inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
            All guides <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <div className="mt-3 divide-y border-y" style={{ borderColor: "var(--app-border)" }}>
          {shortcuts.map((item) => <UtilityRow key={item.href} {...item} />)}
        </div>
      </section>
    </main>
  );
}

function UtilityRow({ href, label, note, icon: Icon }: Shortcut) {
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
