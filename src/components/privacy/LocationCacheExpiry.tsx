"use client";

import { useEffect } from "react";
import { recheckLocationExpiry } from "@/lib/device-location-cache";

export default function LocationCacheExpiry() {
  useEffect(() => {
    recheckLocationExpiry();
    window.addEventListener("pageshow", recheckLocationExpiry);
    document.addEventListener("visibilitychange", recheckLocationExpiry);
    return () => {
      window.removeEventListener("pageshow", recheckLocationExpiry);
      document.removeEventListener("visibilitychange", recheckLocationExpiry);
    };
  }, []);
  return null;
}
