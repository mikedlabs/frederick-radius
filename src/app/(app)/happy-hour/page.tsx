import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Martini } from "lucide-react";
import { placesWithFieldHappyHour, fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour } from "@/lib/happyHour";
import PageBloom from "@/components/ui/PageBloom";
import FieldStamp from "@/components/ui/FieldStamp";
import HappyHourGuide from "@/components/happy/HappyHourGuide";
import { type HHRow } from "@/components/happy/HappyHourBrowser";

export const metadata: Metadata = {
  alternates: { canonical: "/happy-hour" },
  title: "Happy hour in Frederick County",
  description:
    "What's on for happy hour around Frederick County right now. Source-checked schedules, with the deal, where to park, and the fine print locals know.",
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
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header className="pt-0.5">
        <div aria-hidden className="h-px" style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }} />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>Frederick County</span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>{rows.length} spot{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
              <Martini className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-accent)" }} aria-hidden />
              Happy hour
            </h1>
            <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              The deal, where to park, and what locals know. Each schedule was checked at its source.
            </p>
            <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-accent)" }} />
          </div>
          <FieldStamp id="hh" top="CHECKED AT SOURCE" bottom="FIELD NOTES" size={80} className="mt-0.5" />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No current happy hours are on file. Know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <HappyHourGuide rows={rows} today={today} nowMin={nowMin} />
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Times change. Each spot links to its source so you can double-check before you go. Spot something wrong?{" "}
        <Link href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>Tell us</Link>.
      </p>
    </div>
  );
}
