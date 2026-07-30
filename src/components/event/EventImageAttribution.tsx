import type { EventHeroImageAttribution } from "@/data/events";
import {
  GoogleContentReportLink,
  GooglePhotoAttributionLine,
} from "@/components/place/GoogleAttribution";

export default function EventImageAttribution({
  attribution,
  overlay = false,
  compact = false,
  className = "",
}: {
  attribution: EventHeroImageAttribution;
  overlay?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      data-event-photo-credit
      className={`${compact ? "text-[9px] leading-tight" : "text-xs leading-snug"} ${className}`}
      style={{ color: overlay ? "rgba(255,255,255,0.94)" : "var(--app-ink-3)" }}
    >
      <span className="block font-semibold">
        Venue · {attribution.venue_name}
      </span>
      <span className="mt-0.5 block">
        <GooglePhotoAttributionLine
          attribution={{
            photo_name: "",
            google_maps_uri: attribution.source_uri,
            flag_content_uri: attribution.flag_content_uri,
            authors: attribution.authors,
          }}
          compact={compact}
          showAvatar={!compact}
        />
        {attribution.flag_content_uri ? (
          <>
            {" · "}
            <GoogleContentReportLink
              href={attribution.flag_content_uri}
              label="Report photo"
            />
          </>
        ) : null}
      </span>
    </div>
  );
}
