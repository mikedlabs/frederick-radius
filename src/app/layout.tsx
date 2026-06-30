import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { cn } from "@/lib/utils";
import Plausible from "@/components/analytics/Plausible";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import ExtensionNoiseFilter from "@/components/util/ExtensionNoiseFilter";

/**
 * Typography (Premium Overhaul Phase 1, the documented system).
 * Fraunces is the display face: page titles, town and place headers,
 * section heads, the field-guide editorial voice. It replaces Newsreader,
 * which resolves the documentation versus production contradiction.
 * Inter is the functional UI face: navigation, labels, buttons, body,
 * dense lists. It reads as an instrument at small sizes.
 * JetBrains Mono carries every number and code-like value (times,
 * distances, counts, coordinates), the instrument tics.
 *
 * Variable names stay generic so the downstream tokens (--font-sans /
 * --font-serif / --font-mono in globals.css) hold steady.
 */
const sans = Inter({
  variable: "--font-sans-base",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    template: "%s · Frederick Radius",
    default: "Frederick Radius: Frederick County, organized around your day",
  },
  description:
    "Frederick County, organized around your day. What's open, what's happening, and what's worth your time, across every town and community in Frederick County, Maryland.",
  applicationName: "Frederick Radius",
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
    siteName: "Frederick Radius",
    title: "Frederick Radius: Frederick County, organized around your day",
    description:
      "What's open, what's happening, and what's worth your time across every town and community in Frederick County, Maryland.",
    images: [{ url: `${BASE}/api/og`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Frederick Radius",
    // Match the OpenGraph description rather than the old generic
    // marketing line, so the share card says what the product does.
    description:
      "What's open, what's happening, and what's worth your time across every town and community in Frederick County, Maryland.",
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
    title: "Radius",
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
    { media: "(prefers-color-scheme: dark)", color: "#16140E" },
    { media: "(prefers-color-scheme: light)", color: "#EEE6D4" },
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
      data-season={season}
      style={{ "--season-accent": seasonAccent, "--season-depth": seasonAccent } as React.CSSProperties}
    >
      <head>
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
        {/* Map + image origin preconnects. Mapbox tiles + the Google
            Places photo CDN are the next-most-requested third-party
            origins after the Vercel blob CDN, and they're hit
            simultaneously on /map and any place detail page. Same
            "save 50-150ms per first asset" logic as the blob host.
            Crossorigin="anonymous" matches the actual fetch (Mapbox
            tiles and Google photos are anonymous CORS); without it
            the browser skips the warm connection. */}
        <link
          rel="preconnect"
          href="https://api.mapbox.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link
          rel="preconnect"
          href="https://events.mapbox.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://places.googleapis.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://places.googleapis.com" />
        <link
          rel="preconnect"
          href="https://lh3.googleusercontent.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        {/* Supabase project — auth + DB read/write origins. Only
            useful once the user has a session (anon route handlers
            still POST to the Supabase URL), but the cost of a
            never-used preconnect is ~zero. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link
            rel="preconnect"
            href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body
        suppressHydrationWarning
        className={cn(
          sans.variable,
          display.variable,
          mono.variable,
          "antialiased min-h-screen selection:bg-[color:var(--app-brand)] selection:text-white",
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[var(--z-skip)] focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        {/* NuqsAdapter — App Router edition. Wraps the tree so any
            client component can call useQueryState to read/write URL
            search params with a typed API. Master UI brief §16 + §20:
            filter state lives in the URL so views are shareable +
            restorable. No-op cost when no component uses nuqs. */}
        <NuqsAdapter>
          <div id="main">{children}</div>
        </NuqsAdapter>
        {/* Two complementary analytics layers:
            - Plausible (self-hosted feel; product metrics, no IP storage)
            - Vercel Analytics + Speed Insights (Pro-tier; real-user web
              vitals + traffic per route, which Plausible doesn't surface)
            Both are GDPR-safe / cookieless. */}
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
        <Analytics />
        <SpeedInsights />
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
