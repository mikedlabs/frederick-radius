"use client";

import { useEffect, useState } from "react";
import { getHomeMuni } from "@/lib/personalize";
import { getScope, scopeTownSlug } from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * MastheadTitle — a small, optional /today orienting line.
 *
 * Identity now lives in the top bar (the disc mark + "Frederick Radius"
 * lockup), so the body no longer repeats a big "Your field guide to Frederick
 * County." cover line below the weather (owner call, 2026-07-01): a brochure
 * headline stacked under the weather hero pushed the real answer down and read
 * as redundant with the top-bar brand. What's left is warmth without weight:
 * when you've set a home town, a quiet "Middletown, today." orients the page to
 * your corner of the county; otherwise this renders nothing and the masthead is
 * just the almanac notes (weather / market / town picker) beneath. Reads
 * localStorage post-mount only, so there's no SSR/hydration mismatch; the real
 * h1 is sr-only, so this <p> carries no page-heading semantics.
 */
export default function MastheadTitle() {
  const [townSlug, setTownSlug] = useState<string | null>(null);
  useEffect(() => {
    // Post-mount only (SSR can't see localStorage). The browsing SCOPE town
    // (UX-02) orients the line first — "browsing Brunswick" should say so —
    // and the long-term home muni is the fallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount storage read
    setTownSlug(scopeTownSlug(getScope()) ?? getHomeMuni());
  }, []);

  const muni = townSlug ? MUNICIPALITY_BY_SLUG[townSlug] : null;
  if (!muni) return null;

  return (
    <p className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink-2)" }}>
      {muni.name}, today.
    </p>
  );
}
