import type { Metadata } from "next";
import GuideHeader from "@/components/layout/GuideHeader";
import Link from "next/link";
import { placesWithFieldHappyHour, fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour } from "@/lib/happyHour";
import HappyHourGuide from "@/components/happy/HappyHourGuide";
import { type HHRow } from "@/components/happy/HappyHourBrowser";

export const metadata: Metadata = {
  alternates: { canonical: "/happy-hour" },
  title: "Happy hour in Frederick County",
  description:
    "What's on for happy hour around Frederick County right now. Source-checked schedules with the deal and where to park.",
};

export const revalidate = 600;

/** Eastern weekday (0=Sun) + minutes-since-midnight, for "today" + "on now". */
function easternNowParts(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** A Date as Eastern minutes-since-midnight (for the golden-hour gauge). */
/**
 * /happy-hour — the Field Notes flagship. Every spot is agent-VERIFIED at the
 * source (the moat). The page hands the verified set to HappyHourGuide ("The
 * Last Pour"): a live city-magazine bar guide that opens on a "Pour of the
 * Moment" cover (the most time-sensitive on-now spot, its deal amount set huge
 * in gold) then a leader-dotted priced index of the county (venue name … gold
 * hook). A "Now / All week" toggle flips to the day-by-day planner. Server
 * side shapes the data and parses each schedule into day/time windows; it
 * never claims a false "on now".
 */
export default function HappyHourPage() {
  const now = new Date();
  const { day: today, min: nowMin } = easternNowParts(now);
  const townName = (slug?: string) => (slug ? (MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ")) : undefined);

  const verified = placesWithFieldHappyHour();
  const rows: HHRow[] = [];
  for (const v of verified) {
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    const fn = fieldNotesFor(v.slug);
    rows.push({
      slug: v.slug,
      name: p.name,
      town: townName(p.municipality),
      photo: p.google_photo_url,
      deal: v.happy_hour.details || undefined,
      parking: fn?.parking?.text,
      note: fn?.insider?.[0]?.text,
      sourceUrl: v.happy_hour.source_url,
      verified: verifiedLabel(v.happy_hour.last_verified),
      schedule: v.happy_hour.schedule,
      windows: parseHappyHour(v.happy_hour.schedule),
      // Ship the venue's structured hours so the client guide can suppress a
      // live "on now" pour at a provably-closed venue (DQ-019).
      hours: p.hours,
      hoursVerified: p.hours_verified ?? false,
    });
  }
  // VERIFIED ONLY — the legacy unverified business-info happy hours were
  // dropped (stale-name / duplicate problems). Everything here is confirmed at
  // the source; the Field Notes pipeline grows it.

  return (
    <div className="relative space-y-5">

      <GuideHeader title="Happy hour" href="/today" parent="Today">
        Check the hours, offer and parking at each venue.
      </GuideHeader>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No current happy hours are on file. Do you know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <HappyHourGuide rows={rows} today={today} nowMin={nowMin} />
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        <a href="mailto:hello@frederickradius.app?subject=Frederick%20Radius%20correction" className="inline-flex min-h-11 items-center font-semibold underline" style={{ color: "var(--app-link)" }}>Email a correction</a>
      </p>
    </div>
  );
}
