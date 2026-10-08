import { ExternalLink, Navigation } from "lucide-react";
import VenueMiniMap from "@/components/event/VenueMiniMap";
import type { MomentVenue as MomentVenueData } from "@/data/civic-moments";
import { sourceHost } from "./momentGuide";

/**
 * MomentVenue shows where a single-venue moment happens: the venue's block
 * on the county map, its name and address, then Directions as the hub's one
 * filled action. A sourced arrival caveat (for example, no parking at the
 * venue) sits right under the button, where a driver will read it.
 */
export default function MomentVenue({
  venue,
  geom,
  directionsUrl,
}: {
  venue: MomentVenueData;
  /** The catalog coordinates, which win over the moment's own copy. */
  geom: { lng: number; lat: number };
  directionsUrl: string;
}) {
  return (
    <section aria-labelledby="moment-venue-heading" data-moment-venue={venue.placeSlug}>
      <h2 id="moment-venue-heading" className="text-title" style={{ color: "var(--app-ink)" }}>
        {venue.name}
      </h2>
      {venue.address && (
        <p className="mt-1 text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
          {venue.address}
        </p>
      )}
      <div className="mt-3">
        <VenueMiniMap geom={geom} name={venue.name} address={venue.address} />
      </div>
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-moment-directions
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-6 text-body font-semibold sm:inline-flex sm:w-auto"
        style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
      >
        <Navigation className="h-4 w-4" aria-hidden />
        Directions
      </a>
      {venue.note && venue.source_url && (
        <p className="mt-3 text-meta-lg" style={{ color: "var(--app-ink-2)" }}>
          {venue.note}{" "}
          <a
            href={venue.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            style={{ color: "var(--app-brand-press)" }}
          >
            Details on {sourceHost(venue.source_url)}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      )}
    </section>
  );
}
