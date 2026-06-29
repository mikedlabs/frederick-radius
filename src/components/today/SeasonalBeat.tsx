import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { pickSeasonalNote } from "@/lib/seasonal-notes";

/**
 * SeasonalBeat — one dated, sourced, self-hiding local-rhythm line for the
 * /today masthead (sits with HolidayNote / the community notes). Surfaces the single most
 * relevant active almanac note: a computed rhythm like "First Saturday is today"
 * or a curated, sourced range like leaf season. Renders nothing on an ordinary
 * day, so it costs the common day nothing. Honest: every claim is dated, and
 * curated claims show their source. Synchronous server component (no fetch), so
 * it is part of the instant masthead chrome and never blocks the I-want grid.
 */
export default function SeasonalBeat({ now }: { now: Date }) {
  const note = pickSeasonalNote(now);
  if (!note) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{note.lead}.</span>
      <span>{note.detail}</span>
      {note.href && note.hrefLabel && (
        <Link href={note.href} className="font-semibold whitespace-nowrap" style={{ color: "var(--app-brand-press)" }}>
          {note.hrefLabel} →
        </Link>
      )}
      {note.source && (
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {note.source}
        </span>
      )}
    </p>
  );
}
