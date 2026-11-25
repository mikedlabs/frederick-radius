"use client";

import { useSyncExternalStore } from "react";
import { COUNTY_TRANSIT_BULLETIN_URL, MARC_HOLIDAY_URL, transitBulletinForDisplay } from "@/lib/transit-service-calendar";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";

function getDay() {
  return easternDayKey(new Date());
}

function subscribeToDayChange(update: () => void) {
  let timer: number;
  function refresh() {
    window.clearTimeout(timer);
    update();
    if (getDay() > "2026-11-28") return;
    const { year, month, day } = easternParts(new Date());
    const midnight = Date.parse(easternWallToUtcISO(year, month, day + 1, 0, 0));
    timer = window.setTimeout(refresh, midnight - Date.now());
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", refresh);
  };
}

export default function TransitHolidayNotice({ now }: { now: Date }) {
  const day = useSyncExternalStore(subscribeToDayChange, getDay, () => easternDayKey(now));
  const bulletin = transitBulletinForDisplay(day);
  if (!bulletin) return null;
  return (
    <aside aria-label="Thanksgiving transit schedules" className="space-y-1 rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-sm" style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-bg-elevated-solid)" }}>
      <h2 className="font-semibold">Thanksgiving transit schedules</h2>
      {bulletin.county.map((line) => <p key={line}>{line}</p>)}
      {bulletin.rail && <p>{bulletin.rail}</p>}
      <div className="flex flex-wrap gap-x-4">
        <a className="tap-44-y inline-flex items-center underline" href={COUNTY_TRANSIT_BULLETIN_URL}>County transit bulletin (PDF)</a>
        {bulletin.rail && <a className="tap-44-y inline-flex items-center underline" href={MARC_HOLIDAY_URL}>MARC holiday schedule</a>}
      </div>
    </aside>
  );
}
