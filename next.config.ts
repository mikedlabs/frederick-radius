import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

// Enforcing baseline CSP. Next currently needs inline boot scripts and the app
// uses inline style props, so those two allowances remain explicit. Every
// other executable/network origin is constrained to the services the product
// actually uses. A nonce-based policy can tighten the inline allowances later,
// but would force dynamic rendering across otherwise cacheable pages.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://plausible.io`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  [
    "connect-src 'self'",
    ...(!isProduction ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.tiles.mapbox.com",
    // RainViewer weather radar (the map's Radar layer): the frame index
    // lives on api., the tiles on tilecache. — and Mapbox GL fetches
    // raster tiles via XHR, so they need connect-src, not img-src.
    "https://api.rainviewer.com",
    "https://tilecache.rainviewer.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://plausible.io",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://vitals.vercel-insights.com",
  ].join(" "),
  // Keep production subresources on HTTPS. Omitting this in local development
  // matters: otherwise Chromium upgrades relative localhost CSS/font requests
  // to HTTPS and the app appears completely unstyled during browser QA.
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Browser QA commonly opens the local app through 127.0.0.1 while Next
  // advertises localhost. Treat both as the same trusted development origin
  // so HMR and client hydration are testable without weakening production.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Enables Next's wiring around the browser View Transitions API
    // so Link clicks animate between routes via the CSS defined in
    // globals.css (vt-fade-in / vt-fade-out at the @view-transition
    // root). No-op on browsers without VT API support.
    viewTransition: true,
    // Client Router Cache lifetimes. Next 15+ defaults `dynamic` to 0,
    // which means a dynamic page (our tabs all read searchParams /
    // cookies, so they're dynamic) is dropped from the client cache
    // the instant you navigate away — so re-tapping a tab you JUST
    // visited refetches the whole RSC payload from the server. That's
    // the "going between tabs feels slow" symptom. Holding dynamic
    // pages for 30s makes back-and-forth tab switching feel instant
    // (the page is already in the client cache); 30s is short enough
    // that open-now / event freshness never goes meaningfully stale,
    // and the routes are ISR-cached (revalidate) on the server anyway.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Tree-shake barrel-export packages so a single named import doesn't
    // pull the whole library into a route's first-load JS. lucide-react
    // (icons imported across ~every component) and framer-motion (heavy,
    // used by the marketing scenes) are the big wins; Next rewrites the
    // imports to deep paths at build time.
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns"],
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
    // Serve AVIF first, then WebP, then the original. AVIF runs about 20
    // to 30 percent smaller than WebP at the same quality for photographs,
    // and the hero image is the LCP element on every photo led route
    // (guide, today, place, town, category). Next defaults to WebP only,
    // so this is a global byte cut with no visual change and no page edits.
    // The optimizer encodes once and caches, so the extra encode cost is
    // paid a single time per source and size.
    formats: ["image/avif", "image/webp"],
    // Next 16 rejects any next/image `quality` value not in this allowlist
    // with a runtime 400. The app emits q=70 (the sizedImage() default in
    // src/lib/format/img.ts — map pins, aerial cards, event-marker art) plus
    // the implicit next/image default of 75, so BOTH must be listed. Do not
    // drop 70: it is the value actually shipped on photo-led surfaces.
    qualities: [70, 75],
    // Optimized images carry an immutable content hash, so a long cache
    // floor is safe and keeps repeat visits from re-fetching the same hero.
    minimumCacheTTL: 2678400,
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
      // Brewery logo marks (the breweries' own site icons, committed with
      // provenance in src/data/brewery-marks.json) — the /beer passport.
      { pathname: "/brewery-marks/**", search: "" },
      // Curated food-truck identity marks sourced from each vendor's official
      // site. Photography remains separately permission-gated.
      { pathname: "/food-truck-marks/**", search: "" },
      // Dear Frederick letter scans (public/dear-frederick/*.jpg).
      { pathname: "/dear-frederick/**", search: "" },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Mapbox Static Images API — the event page's venue mini-map. Publishable
      // pk token in the URL by design (same token the GL map ships).
      { protocol: "https", hostname: "api.mapbox.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Ticketmaster + SeatGeek promo/artist imagery — the ticketed
      // live-music cards' hero images (2026-07-17 unused-data audit).
      // The adapters only emit hero_image for these exact hosts
      // (EVENT_IMAGE_HOSTS), so an off-list CDN URL drops the image
      // instead of crashing the card (the /beer localPatterns lesson,
      // remote edition). Keep this list and EVENT_IMAGE_HOSTS in sync.
      { protocol: "https", hostname: "s1.ticketm.net" },
      { protocol: "https", hostname: "seatgeek.com" },
      // planespotters.net spotter-photo thumbnail CDN (/overhead aircraft photos)
      { protocol: "https", hostname: "t.plnspttrs.net" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // Library of Congress curated archive imagery. The app stores only
      // reviewed item metadata locally, then requests an explicit, pre-sized
      // IIIF/JPEG rendition from LOC's image CDN. No user request triggers a
      // search of the LOC catalog at runtime.
      { protocol: "https", hostname: "tile.loc.gov" },
      { protocol: "https", hostname: "www.loc.gov" },
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
  // Browser security headers applied to every response. CSP constrains scripts,
  // frames, workers, forms, and network calls; the remaining headers cover
  // transport, MIME sniffing, referrers, legacy framing, and browser features.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Force HTTPS for two years; reversible (no `preload`, so we
          // never get pinned on a browser preload list we can't undo).
          ...(isProduction
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
          // Stop MIME sniffing (defends against content-type confusion).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs (which can carry query params) to other sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Clickjacking: refuse to be framed by other origins.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Lock down powerful browser features. Geolocation is allowed
          // for our own origin only — the Radius / "near me" features
          // need it; everything else is denied to every origin. This is
          // now the SINGLE source for Permissions-Policy (the weaker
          // duplicate in vercel.json was removed); `browsing-topics=()`
          // (modern) + `interest-cohort=()` (legacy) carry the FLoC/Topics
          // opt-out that vercel.json used to own.
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), browsing-topics=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  // Older iOS and a few link-preview crawlers still probe these historical
  // root names. Rewrite both to the one canonical App Router metadata icon so
  // a future brand rebuild updates every caller without duplicated PNG files.
  async rewrites() {
    return [
      {
        source: "/apple-touch-icon.png",
        destination: "/apple-icon.png",
      },
      {
        source: "/apple-touch-icon-precomposed.png",
        destination: "/apple-icon.png",
      },
    ];
  },
  // Permanent route consolidation — duplicate editorial pages and
  // legacy /today URL fold into their canonical homes. Preserves
  // crawler equity and any bookmarks pointing at the old paths.
  // Update destinations here if a category slug ever renames.
  async redirects() {
    return [
      // Canonical host: force www → apex so there is ONE origin. Two
      // origins meant two separate PWA/service-worker caches and split
      // SEO; a returning visitor on www could see a different cached
      // build than one on the apex. (Owner: also confirm both domains
      // alias the SAME production deployment in the Vercel dashboard —
      // this redirect only takes effect once www serves this build.)
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.frederickradius.app" }],
        destination: "https://frederickradius.app/:path*",
        permanent: true,
      },
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
      // /radius → /map?mode=radius (May 2026 Radius-first /map). The
      // brand review's Option A: Radius is the signature mode INSIDE
      // /map, not a separate route. /map now defaults to radius mode
      // (downtown pin + 10-min walk + immediate results); /radius
      // stays as a redirect so existing deep links + shared URLs
      // keep working but the canonical experience lives at /map.
      { source: "/radius", destination: "/map?mode=radius", permanent: true },
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
      // Civic-hub aliases (QW-9). Neither /services nor /civic has ever
      // been a real route here, but both are natural guesses (and appear
      // in older notes) for the county-services hub that lives at
      // /contacts. Fold them permanently so a typed or linked guess lands
      // on the real page instead of a 404.
      { source: "/services", destination: "/contacts", permanent: true },
      { source: "/civic", destination: "/contacts", permanent: true },
      // The old /guide discovery funnel is now the focused Ask Radius
      // workspace. Keep bookmarks and indexed links useful without restoring
      // a redundant fifth bottom-navigation tab.
      { source: "/guide", destination: "/ask", permanent: true },
      // Submit/business hub paths 404'd (only the leaf routes existed),
      // which reads as broken to community submitters + business owners
      // (external audit ship-blocker #2). Point the bare paths at the
      // real flows. Not permanent — these may become real hubs later.
      { source: "/submit", destination: "/submit/place", permanent: false },
      { source: "/business", destination: "/business/claim", permanent: false },
      { source: "/business/manage", destination: "/business/claim", permanent: false },
      // First Friday was mis-keyed "may-2026" while its real date is
      // June 5 (slug/date mismatch the audit caught). Slug corrected to
      // june-2026; redirect the old URL so shared/cached links resolve.
      {
        source: "/events/first-friday-may-2026-frederick",
        destination: "/events/first-friday-june-2026-frederick",
        permanent: true,
      },
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
