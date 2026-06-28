"use client";

import { useEffect, useState } from "react";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * MastheadTitle — the /today cover line, personalized to your home town.
 *
 * SSR (and every crawler / first paint) gets the brand line, "Your field guide
 * to Frederick County." — the stable identity. Post-mount, if you've set a home
 * town, the cover leads with the TOWN ("Middletown, today.") and demotes the
 * brand line to a quiet standfirst beneath it: the page now reads as YOUR corner
 * of the county, not a generic county cover. Reads localStorage post-mount only,
 * so there's no SSR/hydration mismatch; the display line is a <p>, not the page
 * heading (the real h1 is sr-only), so swapping its text changes no semantics.
 */
export default function MastheadTitle() {
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage read; SSR can't see the home town
    setHomeSlug(getHomeMuni());
  }, []);

  const muni = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;

  if (!muni) {
    return (
      <p className="display-3" style={{ color: "var(--app-ink)" }}>
        Your field guide to Frederick County.
      </p>
    );
  }

  return (
    <div>
      <p className="display-3" style={{ color: "var(--app-ink)" }}>
        {muni.name}, today.
      </p>
      <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        Your field guide to Frederick County.
      </p>
    </div>
  );
}
