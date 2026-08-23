"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import GoogleHours from "@/components/place/GoogleHours";
import HoursBlock from "@/components/place/HoursBlock";
import {
  loadLivePlaceHours,
  type LivePlaceHoursData,
} from "@/components/place/livePlaceHours";

export default function LiveHoursBlock({
  slug,
  hours,
  googleHours,
  verified,
  provenance,
}: {
  slug: string;
  hours?: Hours;
  googleHours?: string[];
  verified: boolean;
  provenance?: string;
}) {
  const [live, setLive] = useState<LivePlaceHoursData | null>(null);

  useEffect(() => {
    if (verified) return;
    let cancelled = false;
    loadLivePlaceHours(slug)
      .then((value) => {
        if (!cancelled && value.structured_hours && value.hours?.length) {
          setLive(value);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug, verified]);

  if (live?.structured_hours) {
    return (
      <HoursBlock
        hours={live.structured_hours}
        verified
        provenance="Hours from Google Maps, checked just now."
      />
    );
  }
  if (hours) {
    return <HoursBlock hours={hours} verified={verified} provenance={provenance} />;
  }
  if (googleHours?.length) return <GoogleHours lines={googleHours} />;
  return null;
}
