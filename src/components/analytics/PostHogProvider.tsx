"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/posthog";

/**
 * Mounts the measurement layer (Session 0). Renders nothing and
 * changes no UI: a single idempotent init on first client mount.
 * Lives in the root layout so every route is covered; the init
 * itself is env-gated (see lib/posthog.ts), so this is inert until
 * NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export default function PostHogProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
