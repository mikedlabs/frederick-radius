"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import GoogleHours from "@/components/place/GoogleHours";
import HoursBlock from "@/components/place/HoursBlock";
import {
  loadLivePlaceHours,
  subscribeLivePlaceHours,
  type LivePlaceHoursData,
} from "@/components/place/livePlaceHours";

export default function LiveHoursBlock({
  slug,
  hours,
  googleHours,
  verified,
  provenance,
  canCheckCurrentHours = false,
}: {
  slug: string;
  hours?: Hours;
  googleHours?: string[];
  verified: boolean;
  provenance?: string;
  canCheckCurrentHours?: boolean;
}) {
  const [live, setLive] = useState<LivePlaceHoursData | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "unavailable"
  >("idle");

  useEffect(
    () => subscribeLivePlaceHours(slug, (value) => {
      if (!value.structured_hours || !value.hours?.length) return;
      setLive(value);
      setStatus("idle");
    }),
    [slug],
  );

  const checkCurrentHours = () => {
    if (status === "loading") return;
    setStatus("loading");
    loadLivePlaceHours(slug)
      .then((value) => {
        if (value.structured_hours && value.hours?.length) {
          setLive(value);
          setStatus("idle");
        } else {
          setStatus("unavailable");
        }
      })
      .catch(() => setStatus("unavailable"));
  };

  if (live?.structured_hours) {
    return (
      <HoursBlock
        hours={live.structured_hours}
        verified
        provenance="Hours from Google Maps, checked just now."
      />
    );
  }

  const schedule = hours ? (
    <HoursBlock hours={hours} verified={verified} provenance={provenance} />
  ) : googleHours?.length ? (
    <GoogleHours lines={googleHours} />
  ) : null;

  if (verified || !canCheckCurrentHours) return schedule;

  return (
    <div className="space-y-2">
      {schedule}
      <button
        type="button"
        disabled={status === "loading"}
        onClick={checkCurrentHours}
        className="tap-44-y inline-flex items-center text-sm font-semibold disabled:opacity-60"
        style={{ color: "var(--app-brand-press)" }}
      >
        {status === "loading" ? "Checking current hours…" : "Check current hours"}
      </button>
      {status === "unavailable" ? (
        <p className="text-xs" role="status" style={{ color: "var(--app-ink-3)" }}>
          Current hours are unavailable. Check the official listing before you go.
        </p>
      ) : null}
    </div>
  );
}
