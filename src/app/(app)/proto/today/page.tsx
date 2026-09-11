import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import TodayBlock from "@/components/proto/TodayBlock";
import OverheadCount from "@/components/proto/OverheadCount";
import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { parseHappyHour } from "@/lib/happyHour";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: today" };
export const dynamic = "force-dynamic";

function easternNowParts(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}
const easternDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * PROTOTYPE /proto/today — direction #2 (big type + color blocks) on the REAL
 * today data: live deals, happy-hours-on-now, tonight's events, planes
 * overhead. Throwaway; lets the owner judge the treatment on actual content.
 */
export default async function Page() {
  const now = new Date();
  const weekday = EASTERN_WEEKDAY(now);
  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" }).format(now);
  const { day, min } = easternNowParts(now);

  const deals = todaysDeals(now);
  const dealLead = deals[0];

  const { publicEvents } = await assembleUnifiedEvents(now);
  const todayStr = easternDate(now);
  const tonight = publicEvents
    .filter((e) => easternDate(new Date(e.starts_at)) === todayStr && +new Date(e.starts_at) >= +now - 2 * 3_600_000)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const tonightLead = tonight[0];

  let hhCount = 0;
  let hhLead: { name: string; schedule: string } | null = null;
  for (const v of placesWithFieldHappyHour()) {
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    const on = parseHappyHour(v.happy_hour.schedule).some((w) => w.days.includes(day) && min >= w.start && min < w.end);
    if (on) {
      hhCount++;
      if (!hhLead) hhLead = { name: p.name, schedule: v.happy_hour.schedule };
    }
  }

  return (
    <ProtoFrame title="Today, color-blocked" blurb="Direction #2 on the real today data: live deals, happy hours on now, tonight's events, planes overhead. This is what the front door could be.">
      <div className="space-y-5">
        <header>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>{weekday} · {monthDay}</p>
          <h1 className="mt-1 font-serif text-[44px] font-semibold leading-[0.92] tracking-[-0.03em]" style={{ color: "var(--app-ink)" }}>Today in Frederick</h1>
          <p className="mt-2.5 text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>The whole day, at a glance. Tap a block to go deeper.</p>
        </header>

        <div className="space-y-2.5">
          <TodayBlock
            ink="var(--app-brand-2)"
            eyebrow="Tonight"
            title={tonightLead?.title ?? "A quiet night"}
            teaser={tonightLead ? `${tonightLead.venue_name ?? "Frederick"}${tonight.length > 1 ? ` · ${tonight.length - 1} more on tonight` : ""}` : "Nothing major on the calendar tonight"}
            count={tonight.length}
            href="/events"
          />
          <TodayBlock
            ink="var(--app-brand-press)"
            eyebrow="Today's deals"
            title={dealLead?.offer ?? "No deals today"}
            teaser={dealLead ? `${dealLead.name}${dealLead.town ? ` · ${dealLead.town}` : ""}${deals.length > 1 ? ` · +${deals.length - 1} more` : ""}` : "Check back tomorrow"}
            count={deals.length}
            href="/deals"
          />
          <TodayBlock
            ink="var(--app-accent)"
            eyebrow="Happy hour on now"
            title={hhLead?.name ?? "None on right now"}
            teaser={hhLead ? hhLead.schedule : "See every verified happy hour by day"}
            count={hhCount}
            href="/happy-hour"
          />
          <TodayBlock
            ink="var(--app-cool)"
            eyebrow="Overhead"
            title="Planes in range"
            teaser="Live radar of what's flying over the county"
            count={<OverheadCount />}
            href="/overhead"
          />
        </div>
      </div>
    </ProtoFrame>
  );
}
