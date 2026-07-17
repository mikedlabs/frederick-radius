import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { liveMusicTonight } from "@/lib/events/live-music";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /tonight — who is on stage tonight, soonest first.
 *
 * The wedge answer the place directory can't give: live music is an EVENT, not
 * a venue. This windows the one unified event set to tonight (17:00 -> 02:30
 * ET) and keeps only the live-music shows (category music/concert OR a verified
 * live-music venue). It renders ONLY real dated shows; a stage with nothing on
 * tonight does not appear, and an empty night gets an honest empty state that
 * names the Facebook-only gap and points at the venue list instead.
 *
 * ISR (revalidate 300): the heavy assembly is the SAME 5-minute-cached set
 * /today + /events share, so there is no freshness to gain from a per-request
 * render — force-dynamic only added uncached renders and opted the route out of
 * the client router cache. The per-show "live now" badge is computed against the
 * render-time clock and is therefore accurate to within the 5-minute bucket,
 * which matches /today's ISR posture.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/live-music" },
  title: "Live music tonight",
  description:
    "Who's on stage tonight around Frederick County: brewery, winery, and bar lineups plus ticketed shows, soonest first.",
};

export const revalidate = 300;

export default async function LiveMusicPage() {
  const now = new Date();
  const nowMs = now.getTime();
  const { publicEvents } = await assembleUnifiedEvents(now);
  const shows = liveMusicTonight(publicEvents, now);

  const dl = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(now);
  const part = (t: string) => dl.find((p) => p.type === t)?.value ?? "";
  const dateline = `${part("weekday")} · ${part("month")} ${part("day")}`;

  return (
    <div className="relative mx-auto max-w-md space-y-5 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="tap-44-y inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      {/* Almanac masthead — typography carries it: dateline, serif title
          dropping into an italic continuation, the count as a quiet mono
          datum (never the headline). */}
      <header>
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {dateline}
          </span>
        </div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          On stage tonight{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            around Frederick
          </span>
        </h1>
        {shows.length > 0 && (
          <p className="mt-2 font-mono text-[11px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
            {shows.length} {shows.length === 1 ? "show" : "shows"} · soonest first
          </p>
        )}
      </header>

      {shows.length > 0 ? (
        <section className="space-y-2.5" aria-labelledby="tonight-lineup">
          <h2 id="tonight-lineup" className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Tonight&rsquo;s lineup
          </h2>
          <ul className="space-y-2.5">
            {shows.map((e) => {
              const s = Date.parse(e.starts_at);
              const en = e.ends_at ? Date.parse(e.ends_at) : NaN;
              const live = s <= nowMs && Number.isFinite(en) && nowMs <= en;
              return (
                <li key={e.slug}>
                  <EventCard event={e} variant="glance" live={live} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div
          className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="font-serif text-[19px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            No live music on the wire for tonight.
          </p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            We track verified venue calendars and ticketed listings. Some
            neighborhood spots post only to Facebook, so a quiet wire here
            doesn&rsquo;t always mean a quiet night.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] font-semibold">
            <Link href="/nearby?c=music" className="tap-44-y inline-flex items-center" style={{ color: "var(--app-brand-press)" }}>
              See where the stages are <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
            <Link href="/events" className="tap-44-y inline-flex items-center" style={{ color: "var(--app-ink-3)" }}>
              The full board
            </Link>
          </div>
        </div>
      )}

      {shows.length > 0 && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          From verified venue calendars and ticketed listings. Some neighborhood
          spots post only to Facebook, so this can run short of the full night.
          Times are the venue&rsquo;s own.
        </p>
      )}
    </div>
  );
}
