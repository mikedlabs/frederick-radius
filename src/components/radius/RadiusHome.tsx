"use client";

import type { Place } from "@/data/places";
import type { EventWithMeta } from "@/lib/loaders/events";
import { RadiusProvider } from "@/components/radius/RadiusContext";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import RadiusEventStrip from "@/components/radius/RadiusEventStrip";
import FadeUp from "@/components/ui/FadeUp";

/**
 * The provider and every useRadius consumer must live in the same
 * client subtree. A server component cannot slot client children into a
 * client provider and have context reach them reliably across the
 * RSC boundary, so the hero and the radius-coupled strips are composed
 * here, inside one client component. The server still does the event
 * time/trust filtering and passes the results in as plain props.
 */
export default function RadiusHome({
  places,
  rightNow,
  weekend,
}: {
  places: Place[];
  rightNow: EventWithMeta[];
  weekend: EventWithMeta[];
}) {
  return (
    <RadiusProvider>
      <div className="space-y-7">
        <FadeUp>
          <RadiusBuilder places={places} />
        </FadeUp>
        <FadeUp>
          <RadiusEventStrip
            title="Right now"
            events={rightNow}
            emptyText="Nothing verified in the next few hours inside this radius. Widen it or move the center."
          />
        </FadeUp>
        <FadeUp>
          <RadiusEventStrip
            title="Tonight or this weekend"
            events={weekend}
            emptyText="No verified weekend events inside this radius yet. Try a wider radius."
          />
        </FadeUp>
      </div>
    </RadiusProvider>
  );
}
