"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Music2 } from "lucide-react";
import type { LiveShow } from "@/lib/guide/live-downtown";
import { eventDateParts } from "@/lib/format/eventTime";
import { haptic } from "@/lib/haptics";
import { track } from "@vercel/analytics";

/**
 * LiveDowntown — the front-door music marquee.
 *
 * The three flagship downtown stage programs (Alive @ Five, the Weinberg,
 * SilverVox) as a horizontal snap-rail of sunset cards. The palette is
 * lifted from the Alive @ Five poster — dusk purple washing through
 * magenta into sunset coral and gold, "the sky as you walk over to the
 * creek after work". It is the one deliberately warm, saturated beat on
 * an otherwise calm paper front door, so the live-music plan reads as an
 * occasion, not another list row.
 *
 * Dates render against the viewer's real clock (gated on mount) so an
 * ISR-cached page never mislabels "Tonight". Reduced-motion aware.
 */

// The Alive @ Five sunset — dusk → magenta → coral → gold.
const SUNSET = "linear-gradient(135deg, #3A2A6E 0%, #B4316E 38%, #FF5E45 70%, #FFB23E 100%)";

function whenLabel(startsAt: string, endsAt: string | undefined, now: Date): string {
  const start = eventDateParts(startsAt);
  // Multi-day run (SilverVox) → a month/day range, no clock time.
  if (endsAt) {
    const end = eventDateParts(endsAt);
    return start.monthShort === end.monthShort
      ? `${start.monthShortUpper} ${start.day}–${end.day}`
      : `${start.monthShortUpper} ${start.day} – ${end.monthShortUpper} ${end.day}`;
  }
  // Calendar-day delta in the viewer's locale → Tonight / Tomorrow / weekday.
  const dayMs = 86_400_000;
  const floor = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / dayMs);
  const delta = floor(new Date(startsAt)) - floor(now);
  const lead = delta <= 0 ? "Tonight" : delta === 1 ? "Tomorrow" : start.weekdayShort;
  return `${lead} · ${start.time}`;
}

function Card({ show, lead, now }: { show: LiveShow; lead: boolean; now: Date }) {
  const reduce = useReducedMotion();
  const when = whenLabel(show.startsAt, show.endsAt, now);
  const inner = (
    <>
      {/* Soft "sun" glow in the top-right, the poster's light source. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full opacity-70 blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(255,214,140,0.9) 0%, rgba(255,120,80,0.2) 55%, transparent 72%)" }}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">
            {show.external ? (
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            ) : (
              <Music2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            )}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">
            {show.series}
          </span>
          <span className="ml-auto rounded-full bg-black/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white">
            {when}
          </span>
        </div>
        <p
          className="mt-2 font-semibold leading-tight tracking-tight text-white text-pretty"
          style={{ fontSize: lead ? 20 : 17 }}
        >
          {show.act}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-white/75">{show.venue}</p>
        <div className="mt-auto flex items-center gap-1 pt-2.5">
          {show.note && (
            <span className="truncate text-[11.5px] text-white/80">{show.note}</span>
          )}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/90 transition-transform group-active:translate-x-0.5" strokeWidth={2.5} aria-hidden />
        </div>
      </div>
    </>
  );

  const className =
    "group relative flex snap-start overflow-hidden rounded-[var(--app-radius-lg)] p-3.5 text-left " +
    (lead ? "min-h-[124px] basis-[78%]" : "min-h-[124px] basis-[64%]");
  const style = {
    background: SUNSET,
    boxShadow: "0 14px 30px -16px rgba(180,49,110,0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
  } as const;
  const onTap = () => { haptic("light"); track("live_downtown_tap", { series: show.key }); };

  const motionProps = reduce
    ? {}
    : { whileTap: { scale: 0.985 }, transition: { type: "spring" as const, stiffness: 400, damping: 28 } };

  return show.external ? (
    <motion.a href={show.href} target="_blank" rel="noopener noreferrer" onClick={onTap} className={`${className} shrink-0`} style={style} {...motionProps}>
      {inner}
    </motion.a>
  ) : (
    <motion.div className={`${className} shrink-0`} style={style} {...motionProps}>
      <Link href={show.href} onClick={onTap} className="absolute inset-0 z-[1]" aria-label={`${show.series}: ${show.act}`} />
      {inner}
    </motion.div>
  );
}

export default function LiveDowntown({ shows }: { shows: LiveShow[] }) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState<Date | null>(null);
  // Resolve the real clock post-mount so SSR and first paint agree, then
  // the date chips read against the viewer's actual day.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the date labels must differ between SSR (none) and client (real now)
  useEffect(() => setNow(new Date()), []);
  if (!shows.length) return null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.34, 1.4, 0.5, 1] }}
      className="mt-3.5"
      aria-label="Live music downtown"
    >
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
          Live downtown
        </p>
        <span className="text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
          on stage this week
        </span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shows.map((s, i) => (
          <Card key={s.key} show={s} lead={i === 0} now={now ?? new Date()} />
        ))}
      </div>
    </motion.section>
  );
}
