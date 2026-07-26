"use client";

import { useState } from "react";
import { CalendarPlus, Share2, Check } from "lucide-react";
import { buildIcs } from "@/lib/ics";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";

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

const ICON = "grid h-11 w-11 place-items-center rounded-[var(--app-radius-sm)] transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-95";
const LABELED =
  "tap-44-y inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[12px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]";

export default function EventActions({
  event,
  actions = ["calendar", "share"],
  labeled = false,
  className = "",
}: {
  event: EventActionsEvent;
  actions?: Array<"calendar" | "share">;
  labeled?: boolean;
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
    track("calendar_add");
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

    // Share the generated Story card as an image file when the platform
    // supports it — this is what surfaces Instagram (Stories/feed),
    // Facebook, etc. on the mobile share sheet. Falls through to a URL
    // share, then clipboard.
    if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
      try {
        const res = await fetch(`/api/og?type=event&slug=${event.slug}&format=story`);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], `${event.slug}.png`, { type: blob.type || "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: event.title, text, url });
            return;
          }
        }
      } catch {
        // fall through to the URL share below
      }
    }

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
    <div className={`flex items-center ${labeled ? "gap-2" : "gap-1"} ${className}`}>
      {actions.includes("calendar") && (
        <button
          type="button"
          onClick={addToCalendar}
          aria-label={`Add ${event.title} to calendar`}
          title="Add to calendar"
          className={labeled ? LABELED : ICON}
          style={{
            color: labeled ? "var(--app-ink-2)" : "var(--app-ink-3)",
            borderColor: labeled ? "var(--app-border)" : undefined,
          }}
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {labeled ? <span>Add to calendar</span> : null}
        </button>
      )}
      {actions.includes("share") && (
        <button
          type="button"
          onClick={share}
          aria-label={copied ? "Link copied" : `Share ${event.title}`}
          title={copied ? "Link copied" : "Share"}
          className={labeled ? LABELED : ICON}
          style={{
            color: copied
              ? "var(--app-positive)"
              : labeled
                ? "var(--app-ink-2)"
                : "var(--app-ink-3)",
            borderColor: labeled ? "var(--app-border)" : undefined,
          }}
        >
          {copied ? (
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          ) : (
            <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
          {labeled ? <span>{copied ? "Link copied" : "Share"}</span> : null}
        </button>
      )}
    </div>
  );
}
