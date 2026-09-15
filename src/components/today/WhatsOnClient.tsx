"use client";

import { useSyncExternalStore } from "react";
import { getScope, subscribeScopeChange, scopeTownSlug } from "@/lib/scope";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { easternParts } from "@/lib/tz";
import ProgramRow from "./ProgramRow";
import EventCard from "@/components/event/EventCard";

export type WhatsOnClientProps = {
  program: { e: EventWithMeta; quiet: boolean }[];
  remainingEarlierToday: EventWithMeta[];
  nowIso: string;
};

export default function WhatsOnClient({
  program,
  remainingEarlierToday,
  nowIso,
}: WhatsOnClientProps) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const townSlug = scopeTownSlug(scope);
  const now = new Date(nowIso);

  const filteredProgram = townSlug 
    ? program.filter(row => row.e.municipality === townSlug)
    : program;
    
  const filteredEarlier = townSlug
    ? remainingEarlierToday.filter(e => e.municipality === townSlug)
    : remainingEarlierToday;

  const PROGRAM_MAX = 3;
  const shown = filteredProgram.slice(0, PROGRAM_MAX);
  const programOverflow = filteredProgram.length - shown.length;

  const partOf = (row: typeof program[number]): string => {
    if (row.e.is_all_day) return "All day";
    const h = easternParts(new Date(row.e.starts_at)).hour;
    return h < 12 ? "This morning" : h < 17 ? "This afternoon" : "Tonight";
  };

  const programGroups: { label: string; rows: typeof program }[] = [];
  for (const row of shown) {
    const label = partOf(row);
    const last = programGroups[programGroups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else programGroups.push({ label, rows: [row] });
  }

  return (
    <>
      {programGroups.length > 0 && (
        <div className="reveal-up">
          {programGroups.map((group) => (
            <div key={group.label}>
              <p className="px-0.5 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                {group.label}
              </p>
              <ul>
                {group.rows.map(({ e, quiet }) => (
                  <ProgramRow key={`${e.slug}-${e.starts_at}`} event={e} quiet={quiet} now={now} />
                ))}
              </ul>
            </div>
          ))}
          {programOverflow > 0 && (
            <Link
              href="/events"
              className="tap-44-y flex items-center justify-between px-0.5 py-2.5 text-[13px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              +{programOverflow} more today
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
            </Link>
          )}
        </div>
      )}
      {filteredEarlier.length > 0 && (
        <details className="group">
          <summary className="tap-44-y flex cursor-pointer list-none items-center gap-1.5 px-0.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-ink-3)" }}>
            <ChevronRight aria-hidden className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2.5} />
            Earlier today · {filteredEarlier.length} wrapped up
          </summary>
          <ul className="mt-1">
            {filteredEarlier.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}>
                <EventCard event={e} variant="utility" hideDate />
              </li>
            ))}
          </ul>
        </details>
      )}
      
      {filteredProgram.length === 0 && filteredEarlier.length === 0 && townSlug && (
         <p className="px-0.5 pt-1 text-[13.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
           Looks like there are no more events in this town today.
         </p>
      )}
    </>
  );
}
