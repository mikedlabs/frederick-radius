"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  todayFoodTruckStopDetail,
  type TodayFoodTruckStopSummary,
} from "@/lib/food-trucks/today-summary";
import BREWERY_MARKS from "@/data/brewery-marks.json";
import FOOD_TRUCK_MARKS from "@/data/food-truck-marks.json";
import styles from "./TodayGuideIndex.module.css";

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

function MarkStack({ marks }: { marks: Mark[] }) {
  return (
    <span className={styles.marks} aria-hidden="true">
      {marks.map((mark) => (
        <span
          key={mark.file}
          className={styles.mark}
          data-plate={mark.plate}
        >
          <Image src={mark.file} alt="" fill sizes="54px" className="object-contain" />
        </span>
      ))}
    </span>
  );
}

export function LocalGuideMarks() {
  return <MarkStack marks={[FOOD_TRUCK_PREVIEW[1], BREWERY_PREVIEW[0]]} />;
}

export function foodTruckGuideCopy(
  liveTruckCount: number,
  nextStop: TodayFoodTruckStopSummary | null,
  asOf?: string,
  rosterCount = 0,
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
    detail: rosterCount > 0
      ? `See published stops and browse ${rosterCount} local vendors.`
      : "See published stops and browse local vendors.",
    state: "roster",
  };
}

function GuideRow({
  href,
  title,
  detail,
  marks,
  kind,
}: {
  href: string;
  title: string;
  detail: string;
  marks: Mark[];
  kind: "food" | "beer";
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={styles.guide}
      data-guide-kind={kind}
    >
      <span className={styles.art}><MarkStack marks={marks} /></span>
      <span className={styles.copy}>
        <span className={styles.title}>{title}<ArrowUpRight size={18} aria-hidden /></span>
        <span className={styles.detail}>{detail}</span>
      </span>
    </Link>
  );
}

/** The food-truck row owns only the lightweight live-pin read. A server
 * schedule can upgrade its copy through props, but an unavailable schedule
 * never delays this useful roster door. */
export type TodayFoodTruckGuideProps = {
  nextFoodTruckStop?: TodayFoodTruckStopSummary | null;
  asOf?: string;
  foodTruckCount?: number;
};

export function TodayFoodTruckGuide({
  nextFoodTruckStop = null,
  asOf,
  foodTruckCount = 0,
}: TodayFoodTruckGuideProps = {}) {
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

  const foodTruck = foodTruckGuideCopy(liveTruckCount, nextFoodTruckStop, asOf, foodTruckCount);
  return (
    <GuideRow
      href={foodTruck.href}
      title="Food trucks"
      detail={foodTruck.detail}
      marks={FOOD_TRUCK_PREVIEW}
      kind="food"
    />
  );
}

/**
 * One compact secondary shelf for Frederick's specialty guides.
 *
 * These are useful doors, but they should never compete with the actual
 * headline of the day. Verified business marks provide recognition without
 * turning the Today page into two more promotional cards.
 */
export type TodayLocalGuidesProps = {
  foodTruckGuide?: ReactNode;
  breweryCount?: number;
  foodTruckCount?: number;
};

export default function TodayLocalGuides({
  foodTruckGuide,
  breweryCount = 0,
  foodTruckCount = 0,
}: TodayLocalGuidesProps = {}) {
  return (
    <section className="mt-6" aria-label="Local guides">
      <div className={styles.index}>
        {foodTruckGuide ?? <TodayFoodTruckGuide foodTruckCount={foodTruckCount} />}
        <GuideRow
          href="/beer"
          title="Frederick beer"
          detail={breweryCount > 0
            ? `Browse ${breweryCount} breweries and current taproom listings.`
            : "Browse local breweries and current taproom listings."}
          marks={BREWERY_PREVIEW}
          kind="beer"
        />
      </div>
    </section>
  );
}
