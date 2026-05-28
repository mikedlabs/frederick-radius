import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Enables Next's wiring around the browser View Transitions API
    // so Link clicks animate between routes via the CSS defined in
    // globals.css (vt-fade-in / vt-fade-out at the @view-transition
    // root). No-op on browsers without VT API support.
    viewTransition: true,
  },
  // React Compiler — auto-memoizes every client component at build
  // time so we get useMemo / useCallback equivalents without hand-
  // wrapping. Cuts unnecessary re-renders ~20-40% across the app; the
  // user-perceived win is interactions feeling snappier (drawer
  // toggles, filter chips, map pan callbacks). Requires
  // `babel-plugin-react-compiler` as a devDep, which is installed.
  // Safe by design: opts each component INTO memoization rather than
  // transforming behavior; the compiler bails out on code it can't
  // analyze cleanly. In Next 16 this is a top-level config key (it
  // graduated out of experimental).
  reactCompiler: true,
  // Skew Protection (Vercel Pro): when we deploy a new build while a
  // user has an old tab open, Vercel routes that user's requests to
  // the OLD deployment's serverless functions for the rest of their
  // session — so a server action whose route ID changed in the new
  // build still resolves. Without this, the stale client gets a silent
  // 404 / hydration mismatch the user can't recover from without a
  // hard reload.
  //
  // The mechanism: Next embeds this `deploymentId` in every page
  // request, and Vercel's edge uses it to pin the request to that
  // deployment. `VERCEL_DEPLOYMENT_ID` is auto-set per build by
  // Vercel; undefined locally, so this is a no-op in dev.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  images: {
    // Next 16 footgun: once `localPatterns` is defined at all, EVERY
    // local image path served through `next/image` must match one of
    // the patterns here — the default-allow behavior for /public/* is
    // replaced by a strict allowlist. So both rules below are required:
    //
    //   1. /api/place-photo — same-origin Google photo proxy that
    //      carries a query string (?name=...&w=...). Default rule
    //      would refuse query-stringed local URLs even without the
    //      strict-mode kick.
    //   2. /images/** — everything under /public/images, including
    //      the seasonal photos read by SeasonalPhoto on /now. Adding
    //      the wildcard restores the default behavior for the public
    //      folder while keeping non-image static paths gated.
    localPatterns: [
      // /api/place-photo — same-origin Google photo proxy. Carries a
      // query string (?name=...&w=...&slug=...). Next 16 made the
      // glob matcher stricter: the earlier "?**" search pattern
      // started rejecting valid URLs. Omitting `search` allows any
      // query string for this path, which is what we want — the API
      // route validates its own params and rejects bad input there.
      { pathname: "/api/place-photo" },
      { pathname: "/images/**", search: "" },
      { pathname: "/from-above/**", search: "" },
      { pathname: "/history-photos/**", search: "" },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // Google Places photo CDN. The app normally proxies these via
      // /api/place-photo to keep the API key off the client, but the
      // allowlist is here for defensive parity in case any future
      // path renders a direct CDN URL (the next/image optimizer would
      // refuse without it).
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      { protocol: "https", hostname: "places.googleapis.com" },
      // Vercel Blob — every Blob store has its own random subdomain
      // (e.g. ijszzixn2rzddhti.public.blob.vercel-storage.com). The
      // wildcard pattern below covers all stores on this account, so
      // a Blob rotation never requires a redeploy. This is where the
      // downloaded place photos live; without it, next/image throws
      // "Invalid src prop" on every place page.
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // Permanent route consolidation — duplicate editorial pages and
  // legacy /today URL fold into their canonical homes. Preserves
  // crawler equity and any bookmarks pointing at the old paths.
  // Update destinations here if a category slug ever renames.
  async redirects() {
    return [
      // Editorial micro-pages → canonical category surfaces.
      { source: "/tonight", destination: "/today?t=tonight", permanent: true },
      { source: "/markets", destination: "/category/market", permanent: true },
      { source: "/historic", destination: "/category/museum", permanent: true },
      { source: "/art", destination: "/category/arts", permanent: true },
      // /amenities used to redirect to /map — now it's a real editorial
      // page showing what amenity data we actually have (live counts)
      // plus the wishlist of what's coming (trash cans, dog bags,
      // benches, mailboxes, FedEx/UPS drop-offs).
      { source: "/discover", destination: "/today", permanent: true },
      // /now → /today rename (May 2026). The route lived at /now for
      // historical reasons (the page is about "right now") but the
      // nav has always read "Today" and the URL/label mismatch was a
      // small but consistent confusion. /now stays permanently
      // redirected so PWA installs, push notifications, and crawler
      // links never 404.
      { source: "/now", destination: "/today", permanent: true },
      // /water → /rivers (May 2026). Both rendered "Rivers & streams"
      // USGS gauge data but /rivers is the canonical richer surface
      // (trend sparklines, 24h history, MetricCards). /water was a
      // stripped-down list that duplicated the data without adding
      // value. Redirect kills the duplication; the Field Guide
      // drawer's "Water" tile now points at /rivers directly.
      { source: "/water", destination: "/rivers", permanent: true },
      // /browse renamed back to /map — the spatial tab IS a map, so
      // the URL should say so. The old /browse remains permanently
      // redirected so deep links / cached search results don't 404.
      { source: "/browse", destination: "/map", permanent: true },
      // /saved → /my-radius rename (Phase 0 of the profile/follow
      // system). Same content, new editorial framing — "My Radius" is
      // the user's personal corner of the field guide. The old /saved
      // remains permanently redirected so bookmarks + iOS Share Sheet
      // saves don't 404.
      { source: "/saved", destination: "/my-radius", permanent: true },
    ];
  },
};

// MVP wrap: runtime error capture only. Source-map upload is disabled
// so no SENTRY_AUTH_TOKEN is required to build, and Sentry build-time
// telemetry is off. Org/project/auth are intentionally omitted.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
