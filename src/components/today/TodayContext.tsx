"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin } from "lucide-react";
import { getHomeMuni, setHomeMuni } from "@/lib/personalize";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * TodayContext — the slim location affordance under the SkyHero: a pin + an
 * inline town picker. Picking a town writes the home town (localStorage +
 * cookie) and refreshes so the town-ranked server surfaces re-rank.
 *
 * The golden-hour cue that used to share this line was REMOVED (2026-07-12): it
 * printed the same "Golden hour now · best light until …" that the promoted
 * GoldenHourCard below already shows, so it read as a duplicate. The card is
 * the single golden-hour surface now. Client-only (personalization reads
 * localStorage post-mount), so no SSR/hydration mismatch.
 */
export default function TodayContext() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [homeSlug, setHomeSlug] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount: read the home town from localStorage client-side (no SSR mismatch)
    setMounted(true);
    setHomeSlug(getHomeMuni());
  }, []);

  const pickTown = (slug: string) => {
    setHomeMuni(slug || null);
    setHomeSlug(slug || null);
    router.refresh();
  };

  const homeMuni = homeSlug ? MUNICIPALITY_BY_SLUG[homeSlug] : null;

  // Render nothing until mounted (the town read is client-only). After mount the
  // switcher always shows so it's discoverable — pick a town to personalize the
  // whole app.
  if (!mounted) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug" suppressHydrationWarning>
      <span className="inline-flex items-center gap-1" style={{ color: "var(--app-ink-3)" }}>
        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
        {/* No .tap-44 wrapper: its pointer-events overlay would swallow taps on
            the native <select>. The select gets a ≥44px hit box via padding + a
            matching negative margin, keeping the row's visual height unchanged. */}
        <span className="relative inline-flex items-center">
          <select
            aria-label="Choose the town you're browsing"
            value={homeSlug ?? ""}
            onChange={(e) => pickTown(e.target.value)}
            className="-my-[11px] min-h-[44px] cursor-pointer appearance-none bg-transparent py-[11px] pr-4 font-semibold focus:outline-none focus-visible:underline"
            style={{ color: "var(--app-brand)" }}
          >
            {!homeMuni && <option value="">all of Frederick County</option>}
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
      </span>
    </p>
  );
}
