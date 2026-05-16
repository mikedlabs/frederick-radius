"use client";

import { useState } from "react";
import { CalendarPlus, Share2, Check } from "lucide-react";
import { buildIcs } from "@/lib/ics";
import { haptic } from "@/lib/haptics";

/** Structural subset of EventWithMeta — callers pass the event directly. */
type EventActionsEvent = {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  description?: string;
  venue_name?: string;
  address?: string;
  is_all_day?: boolean;
};

const ICON = "grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)]";

export default function EventActions({
  event,
  actions = ["calendar", "share"],
  className = "",
}: {
  event: EventActionsEvent;
  actions?: Array<"calendar" | "share">;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function addToCalendar(e: React.MouseEvent) {
    stop(e);
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

  async function share(e: React.MouseEvent) {
    stop(e);
    haptic("light");
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://frederickradius.app";
    const url = `${origin}/events/${event.slug}`;
    const text = event.venue_name ? `${event.title} · ${event.venue_name}` : event.title;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: event.title, text, url });
      } catch {
        // User dismissed the share sheet — not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / permission) — no-op.
    }
  }

  return (
    <div className={`flex items-center ${className}`}>
      {actions.includes("calendar") && (
        <button
          type="button"
          onClick={addToCalendar}
          aria-label={`Add ${event.title} to calendar`}
          title="Add to calendar"
          className={ICON}
          style={{ color: "var(--app-ink-3)" }}
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {actions.includes("share") && (
        <button
          type="button"
          onClick={share}
          aria-label={copied ? "Link copied" : `Share ${event.title}`}
          title={copied ? "Link copied" : "Share"}
          className={ICON}
          style={{ color: copied ? "var(--app-positive)" : "var(--app-ink-3)" }}
        >
          {copied ? (
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          ) : (
            <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
