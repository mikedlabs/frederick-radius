"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Hours } from "@/data/places";
import { getOpenStatus, formatHoursLine, type OpenStatus } from "@/lib/hours";

/**
 * TruckHomeStatus — a home-base line for a truck associated with a venue.
 *
 * The /food-trucks page is day-cached (revalidate 86400), so the open/
 * closed reading has to be computed on the visitor's clock, not baked at
 * build. Venue hours are supporting context only. They never prove that a
 * mobile vendor is serving, so this component never says "out now."
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
  hours?: Hours;
  verified: boolean;
  accent: string;
}) {
  const [status, setStatus] = useState<OpenStatus | null>(null);

  useEffect(() => {
    if (!hours) return;
    const tick = () => setStatus(getOpenStatus(hours, { verified }, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, verified]);

  const line = status ? formatHoursLine(status) : null;

  return (
    <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: accent }} />
      <span>
        Usually based at{" "}
        <Link href={`/places/${venueSlug}`} className="font-semibold underline" style={{ color: "var(--app-ink)" }}>
          {venueName}
        </Link>
      </span>
      {line && (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10.5px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Venue: {line}
        </span>
      )}
    </p>
  );
}
