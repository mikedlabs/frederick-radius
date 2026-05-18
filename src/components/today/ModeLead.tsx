"use client";

import Link from "next/link";
import { Home, Compass, Activity, Navigation, Map as MapIcon, CalendarDays, Mountain, Utensils, Sprout, ChevronRight } from "lucide-react";
import { useMode } from "@/hooks/useMode";
import { useMounted } from "@/hooks/useSaved";
import ModeToggle from "./ModeToggle";

/**
 * Mode-aware lead — makes the Resident/Visitor choice actually change
 * what the app foregrounds (the review's valid point: today it only
 * swapped a CTA word). Residents get civic/now/near-me; visitors get
 * plan/events/see. Real routes only — nothing fabricated.
 *
 * SSR-safe: before mount it renders the resident set (the default),
 * so server and first client render match — no hydration mismatch,
 * fully crawlable. After mount it follows the stored mode.
 */
const LINKS = {
  resident: {
    eyebrow: "Living in Frederick",
    title: "Your county, right now",
    tiles: [
      { href: "/pulse", label: "Live pulse", sub: "Traffic, power, schools, 311", Icon: Activity, c: "var(--app-cool)" },
      { href: "/radius", label: "Open near me", sub: "What's open around you", Icon: Navigation, c: "var(--app-brand)" },
      { href: "/map", label: "On the map", sub: "Parking, amenities, trash", Icon: MapIcon, c: "var(--app-positive, #1E6B3A)" },
      { href: "/events", label: "What's on", sub: "Meetings & local events", Icon: CalendarDays, c: "var(--app-accent, #B07A1E)" },
    ],
  },
  visitor: {
    eyebrow: "Visiting Frederick",
    title: "Plan your visit",
    tiles: [
      { href: "/plan", label: "Plan a visit", sub: "Build a day or evening", Icon: Compass, c: "var(--app-cool)" },
      { href: "/events", label: "Events", sub: "What's happening", Icon: CalendarDays, c: "var(--app-brand)" },
      { href: "/trails", label: "Trails & parks", sub: "Get outside", Icon: Mountain, c: "var(--app-positive, #1E6B3A)" },
      { href: "/category/food", label: "Eat & drink", sub: "Restaurants, breweries", Icon: Utensils, c: "var(--app-accent, #B07A1E)" },
    ],
  },
} as const;

export default function ModeLead() {
  const { mode } = useMode();
  const mounted = useMounted();
  // Pre-mount: always the resident default (matches the hook's SSR
  // value) so there is never a hydration mismatch.
  const set = LINKS[mounted ? mode : "resident"];

  return (
    <section
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Quick start"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
            {(mounted ? mode : "resident") === "visitor" ? (
              <Compass className="mr-1 inline h-3 w-3" strokeWidth={2} aria-hidden />
            ) : (
              <Home className="mr-1 inline h-3 w-3" strokeWidth={2} aria-hidden />
            )}
            {set.eyebrow}
          </p>
          <h2 className="truncate font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {set.title}
          </h2>
        </div>
        <ModeToggle />
      </div>

      <div className="grid grid-cols-2 gap-px p-3" style={{ background: "transparent" }}>
        {set.tiles.map((t) => (
          <Link
            key={t.href + t.label}
            href={t.href}
            className="hover-lift group flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] px-3 py-2.5 transition active:scale-[0.99]"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ background: `color-mix(in srgb, ${t.c} 16%, transparent)` }}
              aria-hidden
            >
              <t.Icon className="h-4 w-4" strokeWidth={2} style={{ color: t.c }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {t.label}
              </span>
              <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {t.sub}
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2.5} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
