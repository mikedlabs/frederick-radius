"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sun, ChevronDown, MapPin } from "lucide-react";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getHomeMuni, setHomeMuni } from "@/lib/personalize";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { isEventToday } from "@/lib/eventWhenLabel";
import type { GoldenHourEvent } from "@/lib/events/golden-pairing";

/** Word-boundary truncation so a long event name never cuts mid-word. */
function clampTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).lastIndexOf(" ");
  return `${(cut > 8 ? s.slice(0, cut) : s.slice(0, max)).trimEnd()}…`;
}

/**
 * TodayContext — a slim, self-hiding line under the SkyHero: a personal
 * salutation when a home town is set ("Evening in Brunswick.") and the
 * golden-hour cue when the light window is open. The date/time itself now
 * lives in the hero header; this carries only the contextual extras, and
 * renders nothing when there's neither (so the page stays calm). No divider.
 *
 * Client + live (golden-hour window ticks); personalization reads localStorage
 * post-mount only, so no SSR/hydration mismatch.
 */
export default function TodayContext({ goldenEvent }: { goldenEvent?: GoldenHourEvent | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount: render the client-only salutation + cue post-hydration and read the home town from localStorage (no SSR mismatch)
    setMounted(true);
    setHomeSlug(getHomeMuni());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Change the home town inline — writes the same personalization SetTownInline
  // does (localStorage + cookie), updates the line, and refreshes so the
  // town-ranked server surfaces (/category, etc.) re-rank too.
  const pickTown = (slug: string) => {
    setHomeMuni(slug || null);
    setHomeSlug(slug || null);
    router.refresh();
  };

  const homeMuni = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;

  const clock = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
  const hint = mounted ? nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng) : null;
  let golden: string | null = null;
  if (hint) {
    if (now >= hint.from && hint.to) {
      golden = `Golden hour now · best light until ${clock(hint.to)}`;
    } else {
      const mins = Math.max(1, Math.round((hint.from.getTime() - now.getTime()) / 60_000));
      // Only surface the upcoming cue when it's ACTIONABLE (within ~90 min) — a
      // golden hour four hours out is masthead noise, not a "grab the camera"
      // cue, and it duplicated the weather hero's sun info most of the day.
      if (mins <= 90) {
        golden = `Golden hour ${clock(hint.from)} · in ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`;
      }
    }
  }

  // Daylight-left moved to the weather header (TodayCard → DaylightLeftInline)
  // so it isn't printed twice with sunset. This line now carries only the
  // golden-hour cue near dusk.

  // Pair the live light window with an outdoor draw — shown ONLY while golden
  // hour is ACTIVE (now past golden start), and re-validated against the LIVE
  // client clock so the cue and the event never disagree on tense. An event
  // that's on now reads "on now: X"; one starting imminently in the window
  // reads with its time. Never shown beside the upcoming ("in 1h") cue.
  let goldenEventClause: { label: string; slug: string } | null = null;
  if (mounted && hint && goldenEvent && now >= hint.from) {
    const startMs = Date.parse(goldenEvent.starts_at);
    const sunsetMs = hint.to ? hint.to.getTime() : 0;
    if (!Number.isNaN(startMs) && isEventToday(goldenEvent.starts_at, now) && startMs <= sunsetMs) {
      const nowMs = now.getTime();
      const endMs = Date.parse(goldenEvent.ends_at);
      const onNow =
        startMs <= nowMs &&
        (goldenEvent.isAllDay || (!Number.isNaN(endMs) && endMs > nowMs) || nowMs - startMs <= 3 * 60 * 60_000);
      const title = clampTitle(goldenEvent.title, 34);
      if (onNow) {
        goldenEventClause = { label: `on now: ${title}`, slug: goldenEvent.slug };
      } else if (startMs > nowMs) {
        const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(startMs));
        goldenEventClause = { label: `${time} ${title}`, slug: goldenEvent.slug };
      }
    }
  }

  // One "sun line": the golden-hour cue near dusk. Daylight-left moved to the
  // weather header (DaylightLeftInline) so sunset isn't printed twice.
  const sunLine = golden;

  // Render nothing until mounted (the town + cues are client-only). After mount
  // the salutation always shows so the town SWITCHER is discoverable — pick a
  // town here to personalize the whole app, set or not.
  if (!mounted) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug" suppressHydrationWarning>
      {/* A plain LOCATION control, not a time-of-day greeting (the old "Morning
          in…" read oddly on a picker): a pin + the town you're browsing. */}
      <span className="inline-flex items-center gap-1" style={{ color: "var(--app-ink-3)" }}>
        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
        {!homeMuni && <span>Browsing</span>}
        <span className="tap-44 relative inline-flex items-center">
          <select
            aria-label="Choose the town you're browsing"
            value={homeSlug ?? ""}
            onChange={(e) => pickTown(e.target.value)}
            className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold focus:outline-none focus-visible:underline"
            style={{ color: "var(--app-brand)" }}
          >
            {!homeMuni && <option value="">all of Frederick County</option>}
            {MUNICIPALITIES.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-0 h-3 w-3"
            strokeWidth={2.5}
            aria-hidden
            style={{ color: "var(--app-brand)" }}
          />
        </span>
      </span>
      {sunLine && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
      {sunLine && (
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--app-ink-2)" }}>
          <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
          {sunLine}
        </span>
      )}
      {goldenEventClause && (
        <>
          <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
          <Link href={`/events/${goldenEventClause.slug}`} className="font-medium" style={{ color: "var(--app-brand)" }}>
            {goldenEventClause.label}
          </Link>
        </>
      )}
    </p>
  );
}
