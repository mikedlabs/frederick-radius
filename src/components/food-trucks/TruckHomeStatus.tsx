"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Hours } from "@/data/places";
import { getOpenStatus, formatHoursLine, type OpenStatus } from "@/lib/hours";

/**
 * TruckHomeStatus — the live "is this truck out right now?" line for a
 * truck that parks permanently at a brewery.
 *
 * The /food-trucks page is day-cached (revalidate 86400), so the open/
 * closed reading has to be computed on the visitor's clock, not baked at
 * build. Same posture as LiveOpenStatus on place pages: recompute from the
 * venue's hours on mount and on a minute tick. The claim stays honest, it
 * reads "at <venue>, open till X" only when the venue is actually open, and
 * "usually at <venue>" (with the venue's next-open) otherwise.
 */
export default function TruckHomeStatus({
  venueName,
  venueSlug,
  hours,
  verified,
  accent,
}: {
  venueName: string;
  venueSlug: string;
  hours: Hours;
  verified: boolean;
  accent: string;
}) {
  const [status, setStatus] = useState<OpenStatus | null>(null);

  useEffect(() => {
    const tick = () => setStatus(getOpenStatus(hours, { verified }, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, verified]);

  const open = status?.state === "open" || status?.state === "closing-soon";
  const line = status ? formatHoursLine(status) : null;

  return (
    <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: accent }} />
      <span>
        {open ? "Out now at" : "Usually at"}{" "}
        <Link href={`/places/${venueSlug}`} className="font-semibold underline" style={{ color: "var(--app-ink)" }}>
          {venueName}
        </Link>
      </span>
      {line && (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10.5px]"
          style={{ color: open ? "var(--app-positive)" : "var(--app-ink-3)" }}
        >
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: open ? "var(--app-positive)" : "var(--app-ink-3)" }} />
          {line}
        </span>
      )}
    </p>
  );
}
