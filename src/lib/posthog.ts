"use client";

import posthog from "posthog-js";

/**
 * The measurement layer (Session 0, Layer 0 of
 * frederickradius-handoff/docs/04-missing-layers.md).
 *
 * Exactly ten named events and no others. Autocapture and automatic
 * pageviews are OFF so the event stream stays exactly these names;
 * session replay is enabled for mobile sessions only (the persona
 * work is mobile-first, and replay quota is finite).
 *
 * Env-gated: without NEXT_PUBLIC_POSTHOG_KEY every call is a no-op,
 * so the wiring is safe on any environment. In development each
 * capture also logs to the console so events can be verified before
 * a key exists. Coexists with the inert Plausible config in
 * lib/analytics.ts, which is out of Session 0 scope.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

/** Mobile = coarse pointer or a phone-class viewport. Decides replay. */
function isMobileSession(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768
  );
}

/** Idempotent; called once from PostHogProvider on mount. */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (!KEY) return; // wired but dormant until the key lands
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    // Replay for mobile sessions only.
    disable_session_recording: !isMobileSession(),
    session_recording: {
      maskAllInputs: true,
    },
    persistence: "localStorage+cookie",
  });
}

/** The ten event names. Closed set; adding one is a CLAUDE.md change. */
type EventName =
  | "search_submitted"
  | "chip_tapped"
  | "place_viewed"
  | "directions_tapped"
  | "save_tapped"
  | "plan_generated"
  | "plan_shuffled"
  | "event_viewed"
  | "outbound_clicked"
  | "digest_subscribed";

function capture(name: EventName, props?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    // Local verification path: visible in the console and to tests
    // even with no key configured.
    console.info(`[analytics] ${name}`, props ?? {});
  }
  if (!KEY || !initialized) return;
  posthog.capture(name, props);
}

export const track = {
  /** A query submitted: search overlay (enter or result tap), the
   *  command palette, or the Ask box. query_length, never the raw
   *  query (house privacy posture). */
  searchSubmitted: (props: {
    query_length: number;
    source: "search_overlay" | "command_palette" | "ask";
    method?: "enter" | "result_tap" | "palette_select";
    result_type?: string;
  }) => capture("search_submitted", props),
  /** Any intent / category / filter / town chip. */
  chipTapped: (props: { chip: string; surface: string }) =>
    capture("chip_tapped", props),
  /** A place detail viewed (sheet or full page). */
  placeViewed: (props: { slug: string; via: "sheet" | "page" }) =>
    capture("place_viewed", props),
  /** A directions / navigate link followed. */
  directionsTapped: (props: { slug?: string; provider: string }) =>
    capture("directions_tapped", props),
  /** The save bookmark toggled. */
  saveTapped: (props: { ref_type: string; ref_id: string; saved: boolean }) =>
    capture("save_tapped", props),
  /** A plan produced for the user. */
  planGenerated: (props: { stops: number; surface: string }) =>
    capture("plan_generated", props),
  /** A plan re-rolled. */
  planShuffled: (props: { surface: string }) =>
    capture("plan_shuffled", props),
  /** An event detail viewed. */
  eventViewed: (props: { slug: string }) => capture("event_viewed", props),
  /** Any external link followed (tickets, OpenTable, ParkMobile, news…). */
  outboundClicked: (props: { href: string; surface: string }) =>
    capture("outbound_clicked", props),
  /** Digest signup (no surface until Session 6; name reserved here). */
  digestSubscribed: (props?: { surface?: string }) =>
    capture("digest_subscribed", props),
};
