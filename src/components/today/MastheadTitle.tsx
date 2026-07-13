"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin } from "lucide-react";
import { getHomeMuni, setHomeMuni } from "@/lib/personalize";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * MastheadTitle — the /today orienting line AND the town picker, in ONE control.
 *
 * It used to be two stacked elements: a static "{town}, today." line (this file)
 * plus a separate pin + <select> below it (TodayContext). Picking a town updated
 * the picker's own value but NOT the static line, so the most prominent location
 * statement never changed and the pair read as redundant and broken (owner note,
 * 2026-07-13: "you can select another location but nothing seems to change and
 * this looks kinda out of place").
 *
 * Now the town name in "{town}, today." IS the select: changing it updates the
 * line instantly, writes the home town (localStorage + cookie), and refreshes so
 * the town-ranked server surfaces re-rank. Client-only (personalization reads
 * localStorage post-mount), so there's no SSR/hydration mismatch; the page's real
 * h1 is sr-only, so this <p> carries no page-heading semantics.
 */
const ALL_LABEL = "All of Frederick County";

export default function MastheadTitle() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [townSlug, setTownSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount storage read
    setMounted(true);
    setTownSlug(getHomeMuni());
  }, []);

  const pickTown = (slug: string) => {
    const next = slug || null;
    setHomeMuni(next);
    setTownSlug(next); // update the visible line immediately, not just on refresh
    router.refresh(); // re-run the town-ranked server surfaces below
  };

  // Post-mount only (the home-town read is client-side). After mount the line
  // always shows so the picker is discoverable — pick a town to personalize.
  if (!mounted) return null;

  return (
    <p
      className="flex items-center gap-1 text-[15px] font-semibold tracking-tight"
      style={{ color: "var(--app-ink-2)" }}
      suppressHydrationWarning
    >
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
      {/* No .tap-44 wrapper: its pointer-events overlay would swallow taps on the
          native <select>. The select gets a ≥44px hit box via padding + matching
          negative margin, so the row's visual height is unchanged. */}
      <span className="relative inline-flex items-center">
        <select
          aria-label="Choose the town you're browsing"
          value={townSlug ?? ""}
          onChange={(e) => pickTown(e.target.value)}
          className="-my-[11px] min-h-[44px] cursor-pointer appearance-none bg-transparent py-[11px] pr-4 font-semibold focus:outline-none focus-visible:underline"
          style={{ color: "var(--app-brand)" }}
        >
          <option value="">{ALL_LABEL}</option>
          {MUNICIPALITIES.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-0 h-3 w-3"
          strokeWidth={2.5}
          aria-hidden
          style={{ color: "var(--app-brand)" }}
        />
      </span>
      <span>, today.</span>
    </p>
  );
}
