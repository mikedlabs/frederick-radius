import EventImageAttribution from "@/components/event/EventImageAttribution";
import type { EventCardVisual } from "@/components/event/eventVisuals";
import PhotoCreditLine from "@/components/place/PhotoCreditLine";
import { eventPhotoCredit } from "@/lib/curated-photo-source";

export default function EventVisualCredit({
  visual,
  overlay = false,
  compact = false,
  className = "",
}: {
  visual: EventCardVisual;
  overlay?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (visual.licensedCredit) {
    return <div data-event-photo-credit data-event-licensed-credit
      className={`break-words text-xs leading-snug ${className}`}
      style={{ color: overlay ? "rgba(255,255,255,0.94)" : "var(--app-ink-3)" }}
    >
      <span className="block font-semibold">{visual.caption}</span>
      <PhotoCreditLine credit={eventPhotoCredit(visual.licensedCredit)} />
    </div>;
  }
  if (visual.attribution) {
    return (
      <EventImageAttribution
        attribution={visual.attribution}
        overlay={overlay}
        compact={compact}
        className={className}
      />
    );
  }

  return (
    <div
      data-event-photo-credit
      className={`${compact ? "text-[0.6875rem] leading-snug" : "text-xs leading-snug"} ${className}`}
      style={{ color: overlay ? "rgba(255,255,255,0.94)" : "var(--app-ink-3)" }}
    >
      {visual.sourceHref ? (
        <a
          href={visual.sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={0}
          className="tap-44-y inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
        >
          {visual.caption}
        </a>
      ) : (
        <span className="font-semibold">{visual.caption}</span>
      )}
    </div>
  );
}
