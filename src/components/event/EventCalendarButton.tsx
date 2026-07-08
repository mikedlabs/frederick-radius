"use client";

import { Calendar } from "lucide-react";
import { buildIcs } from "@/lib/ics";
import { haptic } from "@/lib/haptics";
import { barCellClass, barCellStyle, barIconStyle } from "@/components/ui/MobileActionBar";

/**
 * "Add to calendar" cell for the event detail page, for events that have
 * no static ICS endpoint. The /api/events/[slug]/ics route is
 * force-static over the seed slugs only, so a live/aggregated event
 * cannot be served there. This builds the same ICS in the browser (the
 * proven path already used by EventActions) and keeps the seed route
 * untouched, so seed events stay byte-identical. Visually it matches the
 * seed cell's anchor exactly so the three-up grid is unchanged.
 */
type CalendarEvent = {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  description?: string;
  venue_name?: string;
  address?: string;
  is_all_day?: boolean;
};

export default function EventCalendarButton({
  event,
  barVariant,
  label = "Add to calendar",
}: {
  event: CalendarEvent;
  /**
   * Render as a MobileActionBar cell instead of the default grid cell.
   * "primary" gets the vermilion emphasis; "quiet" is a plain cell.
   */
  barVariant?: "primary" | "quiet";
  /** Override the visible label (e.g. a shorter "Calendar" in a tight bar). */
  label?: string;
}) {
  function download() {
    haptic("medium");
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://frederickradius.app";
    const ics = buildIcs({
      uid: event.slug,
      title: event.title,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      description: event.description,
      venue_name: event.venue_name,
      address: event.address,
      url: `${origin}/events/${event.slug}`,
      all_day: event.is_all_day,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${event.slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  const inBar = Boolean(barVariant);
  const primary = barVariant === "primary";
  return (
    <button
      type="button"
      onClick={download}
      aria-label="Add to calendar"
      className={
        inBar
          ? barCellClass(primary)
          : "flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
      }
      style={inBar ? barCellStyle(primary) : { borderColor: "var(--app-border)", color: "var(--app-ink)" }}
    >
      <Calendar
        className="h-5 w-5"
        strokeWidth={1.75}
        aria-hidden
        style={inBar ? barIconStyle(primary) : { color: "var(--app-brand)" }}
      />
      {label}
    </button>
  );
}
