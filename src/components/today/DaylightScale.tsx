"use client";

import { useEffect, useState } from "react";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import styles from "./DaylightScale.module.css";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
});

function duration(milliseconds: number) {
  const minutes = Math.ceil(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes}m`;
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

/** The dot tracks elapsed daylight time. The arc is schematic, not an elevation measurement. */
export default function DaylightScale({ initialNow }: { initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  const { sunrise, sunset } = sunTimes(new Date(now), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  if (!sunrise || !sunset) return null;
  const start = sunrise.getTime();
  const end = sunset.getTime();
  const isDay = now >= start && now < end;
  const fraction = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const x = 6 + 116 * fraction;
  const y = 22 - 72 * fraction * (1 - fraction);
  const label = now < start ? `Sunrise in ${duration(start - now)}` : isDay ? `${duration(end - now)} of daylight left` : "After sunset";

  return (
    <span className={styles.scale} data-daylight-scale role="group" aria-label="Daylight in Frederick">
      <span data-weather-fact className={styles.endpoint}>Sunrise <time dateTime={sunrise.toISOString()}>{clock.format(sunrise)}</time></span>
      <span className={styles.middle}>
        <svg viewBox="0 0 128 26" width="128" height="26" aria-hidden="true" focusable="false">
          <path className={styles.horizon} d="M2 22H126" />
          <path className={styles.arc} d="M6 22Q64 -14 122 22" />
          {isDay && <circle data-daylight-now className={styles.sun} cx={x} cy={y} r="3.6" />}
        </svg>
        <span className={styles.status}>{label}</span>
      </span>
      <span data-weather-fact className={styles.endpoint}>Sunset <time dateTime={sunset.toISOString()}>{clock.format(sunset)}</time></span>
    </span>
  );
}
