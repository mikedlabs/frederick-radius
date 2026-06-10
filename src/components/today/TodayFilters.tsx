"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shuffle } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import FilterChip from "@/components/ui/FilterChip";
import type { PlaceCardData } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";

type Vibe = "all" | "date-night" | "kids-6-12" | "rainy-day" | "outdoor-seating" | "live-music" | "dog-friendly";
type TimeFilter = "now" | "next-hour" | "tonight" | "open-late";

const VIBE_LABELS: Record<Vibe, string> = {
  "all": "All",
  "date-night": "Date night",
  "kids-6-12": "Family",
  "rainy-day": "Rainy day",
  "outdoor-seating": "Outdoor",
  "live-music": "Live music",
  "dog-friendly": "Dog friendly",
};

const TIME_LABELS: Record<TimeFilter, string> = {
  "now": "Open now",
  "next-hour": "Open for an hour+",
  "tonight": "Open tonight",
  "open-late": "Open late",
};

export default function TodayFilters({ candidates }: { candidates: PlaceCardData[] }) {
  const [vibe, setVibe] = useState<Vibe>("all");
  const [time, setTime] = useState<TimeFilter>("now");

  const filtered = useMemo(() => {
    let pool = candidates.slice();

    if (vibe !== "all") {
      pool = pool.filter((p) => (p.tags ?? []).includes(vibe));
    }

    if (time === "now" || time === "next-hour") {
      pool = pool.filter((p) => isOpenNow(p.open_status));
      if (time === "next-hour") {
        pool = pool.filter((p) => p.open_status.state === "open");
      }
    } else if (time === "tonight") {
      // Anything that has an open dot OR is unverified (so user can still discover them)
      pool = pool.filter((p) => p.open_status.state !== "closed");
    } else if (time === "open-late") {
      pool = pool.filter((p) => {
        if (p.open_status.state !== "open") return false;
        const closesAt = p.open_status.state === "open" ? p.open_status.closesAt : null;
        if (!closesAt) return false;
        const [h] = closesAt.split(":").map(Number);
        return h >= 21 || h < 5;
      });
    }

    return pool.slice(0, 8);
  }, [candidates, vibe, time]);

  const surprise = () => {
    const pool = filtered.length > 0 ? filtered : candidates;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    window.location.assign(`/places/${pick.slug}`);
  };

  return (
    <div className="space-y-3">
      {/* Wrapped, fully visible — no hidden horizontal scroll. */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TIME_LABELS) as TimeFilter[]).map((t) => (
            <FilterChip
              key={t}
              label={TIME_LABELS[t]}
              active={t === time}
              onClick={() => setTime(t)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(VIBE_LABELS) as Vibe[]).map((v) => (
            <FilterChip
              key={v}
              label={VIBE_LABELS[v]}
              active={v === vibe}
              onClick={() => setVibe(v)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
        </p>
        <button
          type="button"
          onClick={surprise}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
          style={{ background: "var(--app-brand)" }}
        >
          <Shuffle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Surprise me
        </button>
      </div>

      {filtered.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Nothing matches that combination. Try a different vibe, or{" "}
          <Link href="/explore?mode=radius" className="underline" style={{ color: "var(--app-cool)" }}>set a custom radius</Link>.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li key={p.slug}><PlaceCard place={p} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
