import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { libreCaslonDisplay, publicSans } from "./fonts";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { cn } from "@/lib/utils";
import Plausible from "@/components/analytics/Plausible";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import ExtensionNoiseFilter from "@/components/util/ExtensionNoiseFilter";
import { PLATFORM_BRAND } from "@/lib/platform-brand";

/**
 * Brand typography is self-hosted through next/font (see ./fonts.ts) so
 * production never depends on a live Google Fonts request AND the fallback
 * carries the real font's metrics, which is what stops the swap from
 * reflowing the page. Libre Caslon Display is the wordmark and rare
 * editorial moments; Public Sans carries product titles, UI, body copy,
 * labels, and tabular data. Keeping the product to these two faces is part
 * of the Frederick Radius brand contract.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

/**
 * Common iPhone screens for iOS launch (splash) images. Each entry is the
 * device's CSS width/height and device-pixel-ratio; the href renders the
 * /apple-splash route at the matching PIXEL size. Ordered newest-first so the
 * current lineup is covered; add rows (or iPad sizes) as a follow-up.
 */
const APPLE_LAUNCH_IMAGES: ReadonlyArray<{ w: number; h: number; dpr: number }> = [
  { w: 430, h: 932, dpr: 3 }, // 14/15/16 Pro Max, 15/16 Plus
  { w: 428, h: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro, 15/16, 15/16 Pro
  { w: 390, h: 844, dpr: 3 }, // 12/13/14, 13/14 Pro
  { w: 414, h: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // XR, 11
  { w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro, 12/13 mini
  { w: 375, h: 667, dpr: 2 }, // SE (2nd/3rd gen), 8
];

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    template: "%s · Frederick Radius",
    default: PLATFORM_BRAND.title,
  },
  description: PLATFORM_BRAND.description,
  applicationName: PLATFORM_BRAND.name,
  // Single author across all routes: the product is a MAD Productions
  // tool. The personal maker credit lives in the /about body, not the
  // metadata.
  authors: [{ name: "MAD Productions" }],
  creator: "MAD Productions",
  publisher: "MAD Productions",
  generator: "Next.js",
  keywords: [
    "Frederick County", "Frederick MD", "Downtown Frederick",
    "things to do Frederick", "events Frederick MD", "restaurants Frederick",
    "Brunswick MD", "Thurmont MD", "Middletown MD",
    "Catoctin", "Carroll Creek", "civic technology",
  ],
  // No site-wide canonical (T1): a fixed root canonical here made EVERY
  // route claim the homepage as its canonical, collapsing indexing onto
  // "/". Each indexable route now sets its own self-canonical via
  // `alternates.canonical` (static metadata or generateMetadata). Keep
  // `metadataBase` so those relative canonicals resolve to absolute URLs.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE,
    siteName: PLATFORM_BRAND.name,
    title: PLATFORM_BRAND.title,
    description: PLATFORM_BRAND.description,
    images: [{ url: `${BASE}/api/og`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: PLATFORM_BRAND.name,
    // Match the OpenGraph description rather than the old generic
    // marketing line, so the share card says what the product does.
    description: PLATFORM_BRAND.description,
    images: [`${BASE}/api/og`],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "default" = dark status-bar text on the themed cream bar. "black-translucent"
    // rendered WHITE text over the light paper ground, hiding the clock/battery.
    statusBarStyle: "default",
    title: PLATFORM_BRAND.shortName,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Keep fixed-bottom UI (BottomNav, sheets, the search overlay) above the
  // on-screen keyboard on Android Chrome instead of being shoved/covered.
  interactiveWidget: "resizes-content",
  // Brand Book No. 01: paper-cream is the canonical ground, so the status bar
  // tints warm-paper in light mode. The marketing/dark surfaces (and iOS
  // dark-mode users) get the ink ground so the bar doesn't clash.
  themeColor: [
    // The product has no dark theme. Keep installed-app chrome on Cream even
    // when the device prefers dark mode so it never frames a light page with
    // an unrelated dark bar.
    { media: "(prefers-color-scheme: dark)", color: PLATFORM_BRAND.themeColor },
    // Must match the canonical paper ground (--app-bg = #F4EEE2) or installed
    // PWAs show a status-bar/page seam.
    // Viewport metadata can't read CSS vars, so this literal is kept in sync.
    { media: "(prefers-color-scheme: light)", color: PLATFORM_BRAND.themeColor },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Seasonal token spine — coarse (changes 4x/year, so baking at build/ISR is
  // fine; a deploy happens far more often than a solstice). Sets the accent
  // TONE and a shadow-tint hue the app-wide seasonal wash (PR3) reads from.
  // spring -> green, summer -> gold, autumn -> sienna, winter -> slate.
  const seasonMonth = new Date().getMonth();
  const season =
    seasonMonth >= 2 && seasonMonth <= 4 ? "spring"
    : seasonMonth >= 5 && seasonMonth <= 7 ? "summer"
    : seasonMonth >= 8 && seasonMonth <= 10 ? "autumn"
    : "winter";
  const seasonAccent =
    season === "spring" ? "var(--app-positive)"
    : season === "summer" ? "var(--app-accent)"
    : season === "autumn" ? "var(--app-warning)"
    : "var(--app-cool)";
  return (
    // suppressHydrationWarning on <html> + <body> is the Next.js-
    // recommended fix for the "Hydration failed because the server
    // rendered HTML didn't match the client" error caused by browser
    // extensions that inject attributes or stray DOM nodes into the
    // top of the document (1Password, Grammarly, Dark Reader, the
    // "iki" automation extension, etc.). It scopes the suppression to
    // the two elements extensions typically touch — it does NOT
    // disable hydration checking for the rest of the tree, so a real
    // SSR/client mismatch inside one of our components still surfaces.
    // Ref: https://nextjs.org/docs/messages/react-hydration-error
    <html
      lang="en"
      suppressHydrationWarning
      // The two font variables are declared on <html> so globals.css can point
      // its type tokens at them; every surface reads the tokens, not these.
      className={`${publicSans.variable} ${libreCaslonDisplay.variable}`}
      data-season={season}
      style={{ "--season-accent": seasonAccent, "--season-depth": seasonAccent } as React.CSSProperties}
    >
      <head>
        {/* Capture Chromium's one-shot install event before React hydrates.
            The visible prompt still owns when to ask; this only prevents a
            fast browser event from disappearing before the app can use it. */}
        <Script id="fr-install-event-capture" strategy="beforeInteractive">
          {`(function () {
            window.addEventListener("beforeinstallprompt", function (event) {
              event.preventDefault();
              window.__frBeforeInstallPrompt = event;
              window.dispatchEvent(new Event("fr:beforeinstallprompt-ready"));
            });
          })();`}
        </Script>
        {/* Preconnect to the Vercel Blob CDN where the downloaded
            place photos live. A blank preconnect lets the browser
            start the TLS handshake AND DNS lookup the moment the
            HTML lands, instead of waiting for the first <img> tag
            to be parsed. Saves ~50-150ms on the first photo per
            page; compounds on /browse where 8+ photos can request
            simultaneously when the in-view drawer opens.
            dns-prefetch is the cheaper fallback for browsers /
            cases where preconnect is skipped (e.g. when too many
            preconnects are in use). */}
        <link
          rel="preconnect"
          href="https://ijszzixn2rzddhti.public.blob.vercel-storage.com"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://ijszzixn2rzddhti.public.blob.vercel-storage.com"
        />
        {/* Third-party origins beyond the blob CDN get dns-prefetch ONLY.
            They used to be full global preconnects, but eager preconnects
            compete for the connection pool the LCP asset needs, and none
            of these is used on most routes: Mapbox only matters on the map
            surfaces (which add their own preconnect, see map/page.tsx);
            the Google photo origins are proxied through /_next/image or
            /api/place-photo (same-origin) for nearly every render; and
            Supabase only ever sees authenticated traffic. dns-prefetch
            keeps the cheap DNS head start without holding sockets open. */}
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
        <link rel="dns-prefetch" href="https://places.googleapis.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link
            rel="dns-prefetch"
            href={process.env.NEXT_PUBLIC_SUPABASE_URL}
          />
        )}
        {/* iOS launch images. Unlike Android (which composits its own splash
            from the manifest), iOS only paints an apple-touch-startup-image
            whose media query matches the device EXACTLY — so we emit one per
            common iPhone, each pointing at the /apple-splash route rendered at
            that device's pixel size. Without these the installed app opens on a
            blank (background_color) flash instead of the branded mark. iPad and
            less-common phones are a follow-up; the route already renders any
            requested size. */}
        {APPLE_LAUNCH_IMAGES.map(({ w, h, dpr }) => (
          <link
            key={`${w}x${h}@${dpr}`}
            rel="apple-touch-startup-image"
            media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
            href={`/apple-splash?w=${w * dpr}&h=${h * dpr}`}
          />
        ))}
      </head>
      <body
        suppressHydrationWarning
        className={cn(
          "antialiased min-h-screen selection:bg-[color:var(--app-brand)] selection:text-white",
        )}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-skip)] focus:rounded-[var(--app-radius-sm)] focus:bg-[var(--app-ink)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--app-on-brand)]"
        >
          Skip to content
        </a>
        {/* NuqsAdapter — App Router edition. Wraps the tree so any
            client component can call useQueryState to read/write URL
            search params with a typed API. Master UI brief §16 + §20:
            filter state lives in the URL so views are shareable +
            restorable. No-op cost when no component uses nuqs. */}
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        {/* Two complementary analytics layers:
            - Plausible (self-hosted feel; product metrics, no IP storage)
            - Vercel Analytics + Speed Insights (Pro-tier; real-user web
              vitals + traffic per route, which Plausible doesn't surface)
            Both run without advertising cookies in this configuration. */}
        {/* Brand-aligned toaster — paper-cream surface, warm-dark
            ink, sits just above the bottom nav so toasts don't
            overlap the tab bar. Sonner handles enter/exit physics +
            queueing; this is the single instance per app shell. */}
        <Toaster
          position="bottom-center"
          offset="calc(env(safe-area-inset-bottom, 0px) + 80px)"
          toastOptions={{
            style: {
              background: "var(--app-bg-elevated)",
              border: "1px solid var(--app-border)",
              color: "var(--app-ink)",
              boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              borderRadius: "var(--app-radius-md)",
            },
            className: "fr-toast",
          }}
          duration={3000}
        />
        <Plausible />
        {/* Gate real-user telemetry to PRODUCTION so preview and local traffic
            do not pollute the product and Core Web Vitals data used to judge
            the live site. VERCEL_ENV is production, preview, or development. */}
        {process.env.VERCEL_ENV === "production" && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
        <ServiceWorkerRegister />
        {/* Swallows clipboard NotAllowedError rejections that browser
            extensions throw inside our window context, so the dev
            overlay doesn't render them as red Console Errors. Our own
            clipboard call sites have their own try/catch. */}
        <ExtensionNoiseFilter />
      </body>
    </html>
  );
}
