"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Beer, CalendarDays, ChevronRight, Radio, Truck } from "lucide-react";
import { BREWERIES } from "@/data/beers";
import { FOOD_TRUCKS } from "@/data/food-trucks";
import {
  todayFoodTruckStopDetail,
  type TodayFoodTruckStopSummary,
} from "@/lib/food-trucks/today-summary";
import BREWERY_MARKS from "@/data/brewery-marks.json";
import FOOD_TRUCK_MARKS from "@/data/food-truck-marks.json";

type Mark = {
  file: string;
  plate?: string;
};

const FOOD_TRUCK_PREVIEW = [
  FOOD_TRUCK_MARKS["blendabowl"],
  FOOD_TRUCK_MARKS["blues-bbq"],
  FOOD_TRUCK_MARKS["dop-pizza"],
] satisfies Mark[];

const BREWERY_PREVIEW = [
  BREWERY_MARKS["attaboy-beer-frederick"],
  BREWERY_MARKS["brewers-alley-frederick"],
  BREWERY_MARKS["rockwell-brewery-frederick"],
] satisfies Mark[];

function MarkStack({ marks, label }: { marks: Mark[]; label: string }) {
  return (
    <span className="flex w-[72px] shrink-0 items-center pl-1" aria-label={label}>
      {marks.map((mark, index) => (
        <span
          key={mark.file}
          className="-ml-1 grid h-9 w-9 place-items-center overflow-hidden rounded-full border bg-white first:ml-0"
          style={{
            borderColor: "var(--app-bg-elevated)",
            background:
              mark.plate === "dark"
                ? "var(--app-ink)"
                : mark.plate === "light"
                  ? "#fffdf8"
                  : "var(--app-bg-sunken)",
            boxShadow: "0 2px 8px color-mix(in srgb, var(--app-ink) 10%, transparent)",
            zIndex: marks.length - index,
          }}
        >
          <span className="relative h-7 w-7">
            <Image src={mark.file} alt="" fill sizes="28px" className="object-contain" />
          </span>
        </span>
      ))}
    </span>
  );
}

export function foodTruckGuideCopy(
  liveTruckCount: number,
  nextStop: TodayFoodTruckStopSummary | null,
  asOf?: string,
): { href: string; detail: string; state: "live" | "scheduled" | "roster" } {
  if (liveTruckCount > 0) {
    return {
      href: "/food-trucks#near-me",
      detail: `${liveTruckCount} ${liveTruckCount === 1 ? "truck is" : "trucks are"} sharing a live location.`,
      state: "live",
    };
  }
  if (nextStop && asOf && Number.isFinite(Date.parse(asOf))) {
    return {
      href: "/food-trucks#this-week",
      detail: todayFoodTruckStopDetail(nextStop, new Date(asOf)),
      state: "scheduled",
    };
  }
  return {
    href: "/food-trucks",
    detail: `See published stops and browse ${FOOD_TRUCKS.length} local vendors.`,
    state: "roster",
  };
}

/**
 * One compact secondary shelf for Frederick's specialty guides.
 *
 * These are useful doors, but they should never compete with the actual
 * headline of the day. Verified business marks provide recognition without
 * turning the Today page into two more promotional cards.
 */
export default function TodayLocalGuides({
  nextFoodTruckStop = null,
  asOf,
}: {
  nextFoodTruckStop?: TodayFoodTruckStopSummary | null;
  asOf?: string;
} = {}) {
  const [liveTruckCount, setLiveTruckCount] = useState(0);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/food-trucks/live", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { pins?: unknown[] };
        if (active) setLiveTruckCount(Array.isArray(body.pins) ? body.pins.length : 0);
      } catch {
        // The published schedule and local roster remain available.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const foodTruck = foodTruckGuideCopy(
    liveTruckCount,
    nextFoodTruckStop,
    asOf,
  );
  const rows = [
    {
      href: foodTruck.href,
      title: "Food trucks",
      detail: foodTruck.detail,
      marks: FOOD_TRUCK_PREVIEW,
      Icon:
        foodTruck.state === "live"
          ? Radio
          : foodTruck.state === "scheduled"
            ? CalendarDays
            : Truck,
    },
    {
      href: "/beer",
      title: "Frederick beer",
      detail: `Browse ${BREWERIES.length} breweries and current taproom listings.`,
      marks: BREWERY_PREVIEW,
      Icon: Beer,
    },
  ];

  return (
    <section className="mt-6" aria-labelledby="today-local-guides">
      <h2
        id="today-local-guides"
        className="px-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Local guides
      </h2>
      <div
        className="mt-2 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
      >
        {rows.map(({ href, title, detail, marks, Icon }, index) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="tap-44 group flex min-h-[68px] items-center gap-3 px-3 py-2.5"
            style={{
              borderTop: index === 0 ? undefined : "1px solid var(--app-border)",
            }}
          >
            <MarkStack marks={marks} label={`${title} business marks`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
                {title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                {detail}
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="h-4 w-4 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5 group-hover:opacity-70"
              strokeWidth={2.25}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
