import EventImageAttribution from "@/components/event/EventImageAttribution";
import type { EventCardVisual } from "@/components/event/eventVisuals";

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
      className={`${compact ? "text-[9px] leading-tight" : "text-xs leading-snug"} ${className}`}
      style={{ color: overlay ? "rgba(255,255,255,0.94)" : "var(--app-ink-3)" }}
    >
      {visual.sourceHref ? (
        <a
          href={visual.sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y inline-flex items-center font-semibold underline underline-offset-2"
        >
          {visual.caption}
        </a>
      ) : (
        <span className="font-semibold">{visual.caption}</span>
      )}
    </div>
  );
}
