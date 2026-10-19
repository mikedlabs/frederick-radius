import EventImageAttribution from "@/components/event/EventImageAttribution";
import type { EventCardVisual } from "@/components/event/eventVisuals";

export default function EventVisualCredit({
  visual,
  overlay = false,
  compact = false,
  className = "",
  inlineLicensed = false,
}: {
  visual: EventCardVisual;
  overlay?: boolean;
  compact?: boolean;
  className?: string;
  /** Discovery cards keep complete license facts in naturally wrapping copy. */
  inlineLicensed?: boolean;
}) {
  if (visual.licensedCredit) {
    const credit = visual.licensedCredit;
    return <div data-event-photo-credit data-event-licensed-credit
      className={`break-words text-xs leading-snug [&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center ${className}`}
      style={{ color: overlay ? "rgba(255,255,255,0.94)" : "var(--app-ink-3)" }}
    >
      <span className="block font-semibold">{visual.caption}</span>
      {inlineLicensed ? <span className="mt-1 block">Photo by {credit.creator}. {credit.modifications}</span> : <>
        <span className="mt-1 block">Photo by {credit.creator}.</span>
        <span className="block">{credit.modifications}</span>
      </>}
      <span className="flex flex-wrap gap-x-3">
        <a href={credit.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Wikimedia Commons</a>
        <a href={credit.license.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{credit.license.label}</a>
        {credit.original_source_url && <a href={credit.original_source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Original photograph</a>}
      </span>
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
      className={`${compact ? "text-[9px] leading-tight" : "text-xs leading-snug"} ${className}`}
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
