"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Flame, CalendarDays, Clock, Footprints, Baby } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import PlaceCard from "@/components/place/PlaceCard";
import LiveDot from "@/components/ui/LiveDot";
import { useMode } from "@/hooks/useMode";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * Mode-aware tab ordering:
 *   Visitor → events first (Tonight / Weekend / Family), then explore (Walkable / Open now)
 *   Resident → utility first (Open now / Walkable), then plan (Tonight / Weekend / Family)
 */
const TAB_ORDER: Record<"visitor" | "resident", string[]> = {
  visitor: ["tonight", "weekend", "family", "walkable", "open-now"],
  resident: ["open-now", "walkable", "tonight", "weekend", "family"],
};

type Tab = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Theme color for the tab pill + accent line */
  accent: string;
  count: number;
  href: string;
  hrefLabel: string;
  meta?: React.ReactNode;
  empty: string;
  content: React.ReactNode;
};

export default function TodayTabs({
  liveEvents,
  todayEvents,
  weekendEvents,
  walkable,
  familyPicks,
  openNow,
}: {
  liveEvents: EventWithMeta[];
  todayEvents: EventWithMeta[];
  weekendEvents: EventWithMeta[];
  walkable: PlaceCardData[];
  familyPicks: PlaceCardData[];
  openNow: PlaceCardData[];
}) {
  // Tonight is composed of "live now" first, then "next 24h"
  const tonight = [...liveEvents, ...todayEvents].slice(0, 6);

  // Render a place list photo-forward: promote the first place that has a
  // real Google photo to a full-bleed feature card, the rest as rows.
  const confTag = (p: PlaceCardData) => {
    if (!p.open_confidence) return null;
    const verified = p.open_confidence === "verified";
    return (
      <span
        className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={
          verified
            ? { color: "var(--app-positive)", background: "rgba(22,163,74,0.12)" }
            : { color: "var(--app-ink-3)", background: "var(--app-bg-sunken)" }
        }
      >
        {verified ? "Verified open" : "Likely open"}
      </span>
    );
  };

  const renderPlaces = (places: PlaceCardData[]) => {
    if (places.length === 0) return null;
    const pool = places.slice(0, 6);
    const heroIdx = pool.findIndex((p) => Boolean(p.google_photo_url));
    if (heroIdx === -1) {
      return (
        <ul className="space-y-2">
          {pool.map((p) => (
            <li key={p.slug}>
              {confTag(p)}
              <PlaceCard place={p} />
            </li>
          ))}
        </ul>
      );
    }
    const hero = pool[heroIdx];
    const rest = pool.filter((_, i) => i !== heroIdx);
    return (
      <div className="space-y-2">
        <div>
          {confTag(hero)}
          <PlaceCard place={hero} variant="feature" />
        </div>
        <ul className="space-y-2">
          {rest.map((p) => (
            <li key={p.slug}>
              {confTag(p)}
              <PlaceCard place={p} />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // P0-6: the "Open now" panel must never show a defeating empty state.
  // Verified or likely-open places first, otherwise fall back to what is
  // on tonight, then the weekend.
  const openNowContent =
    renderPlaces(openNow) ??
    (tonight.length > 0 ? (
      <div className="space-y-2">
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          No verified open spots this late. Here is what is on tonight.
        </p>
        <ul className="space-y-2">
          {tonight.map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
        </ul>
      </div>
    ) : weekendEvents.length > 0 ? (
      <div className="space-y-2">
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          No verified open spots right now. Here is what is on this weekend.
        </p>
        <ul className="space-y-2">
          {weekendEvents.slice(0, 6).map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
        </ul>
      </div>
    ) : null);

  const tabs: Tab[] = [
    {
      key: "tonight",
      label: "Tonight",
      icon: Flame,
      accent: "var(--app-brand)",
      count: tonight.length,
      href: "/events",
      hrefLabel: "All events",
      meta: liveEvents.length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <LiveDot />
          <span>{liveEvents.length} live · </span>
          <span>{todayEvents.length} upcoming</span>
        </span>
      ) : (
        <span>{todayEvents.length} in the next 24 hours</span>
      ),
      empty: "Nothing on tonight's calendar yet — pull the planner.",
      content: tonight.length === 0 ? null : (
        <ul className="space-y-2">
          {tonight.map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
        </ul>
      ),
    },
    {
      key: "weekend",
      label: "Weekend",
      icon: CalendarDays,
      accent: "var(--app-accent)",
      count: weekendEvents.length,
      href: "/events",
      hrefLabel: "All events",
      meta: <span>Friday evening through Sunday</span>,
      empty: "No events on the weekend yet.",
      content: weekendEvents.length === 0 ? null : (
        <ul className="space-y-2">
          {weekendEvents.slice(0, 6).map((e) => <li key={e.slug}><EventCard event={e} /></li>)}
        </ul>
      ),
    },
    {
      key: "open-now",
      label: "Open now",
      icon: Clock,
      accent: "var(--app-positive)",
      count: openNow.length,
      href: "/map?filter=open-now",
      hrefLabel: "See all open",
      meta: <span>Open now, or likely open by listed hours</span>,
      empty: "",
      content: openNowContent,
    },
    {
      key: "walkable",
      label: "Walkable",
      icon: Footprints,
      accent: "var(--app-cool)",
      count: walkable.length,
      href: "/radius",
      hrefLabel: "Set a radius",
      meta: <span>Inside a 15-minute walk from downtown</span>,
      empty: "No nearby walkable spots right now.",
      content: renderPlaces(walkable),
    },
    {
      key: "family",
      label: "Family",
      icon: Baby,
      accent: "#7E2C6F",
      count: familyPicks.length,
      href: "/map?filter=family",
      hrefLabel: "Family map",
      meta: <span>Kid-friendly places + family events</span>,
      empty: "No family picks loaded.",
      content: renderPlaces(familyPicks),
    },
  ];

  // Reorder tabs based on mode (visitor vs resident)
  const { mode } = useMode();
  const tabsByKey = Object.fromEntries(tabs.map((t) => [t.key, t]));
  const orderedTabs = TAB_ORDER[mode].map((k) => tabsByKey[k]).filter(Boolean);

  const [active, setActive] = useState<string>(orderedTabs[0].key);
  // When mode flips, reset to the first tab of the new order so users see
  // the most relevant content (Open now for residents, Tonight for visitors)
  useEffect(() => {
    setActive(orderedTabs[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const current = orderedTabs.find((t) => t.key === active) ?? orderedTabs[0];

  return (
    <section className="space-y-3">
      {/* Section heading + tabs */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {mode === "visitor" ? "What to see" : "What to do"}
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            {mode === "visitor" ? "Tourist view · tap toggle to switch" : "Local view · tap toggle to switch"}
          </p>
        </div>
        <Link
          href={current.href}
          className="inline-flex items-center gap-1 text-xs font-medium tracking-tight"
          style={{ color: current.accent }}
        >
          {current.hrefLabel} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {/* Pill tabs — wrapped, every tab visible at once (no hidden
          horizontal scroll). */}
      <div
        role="tablist"
        aria-label="What to do filters"
        className="flex flex-wrap gap-1.5"
      >
        {orderedTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.key}`}
              onClick={() => {
                setActive(tab.key);
                // Light haptic on tab switch
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                  navigator.vibrate?.(8);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-[0.97]"
              style={{
                background: isActive ? tab.accent : "var(--app-bg-elevated)",
                color: isActive ? "white" : "var(--app-ink-2)",
                borderColor: isActive ? tab.accent : "var(--app-border)",
                minHeight: 36,
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : "var(--app-bg-sunken)",
                    color: isActive ? "white" : "var(--app-ink-3)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Meta line + accent rule */}
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--app-ink-3)" }}>
        <span
          aria-hidden
          className="inline-block h-0.5 w-6 rounded-full"
          style={{ background: current.accent }}
        />
        {current.meta}
      </div>

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`tab-panel-${current.key}`}
        aria-labelledby={`tab-${current.key}`}
        key={current.key}
        className="fade-up"
      >
        {current.content || (
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            {current.empty}
          </p>
        )}
      </div>
    </section>
  );
}
