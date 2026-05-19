import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cn } from "@/lib/utils";
import Plausible from "@/components/analytics/Plausible";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// The editorial display face. Fraunces is a variable old-style serif
// with an optical-size axis: at headline sizes it gets characterful
// and confident, at small sizes it stays readable. This is the single
// biggest lever in the new "Field Guide" identity. The CSS var name is
// kept as --font-plex-serif so every existing serif consumer (display
// classes, .font-serif, map popups) inherits the new face with no
// churn — rename nothing, revalue everything.
const display = Fraunces({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  // opsz drives the optical-size character (the reason to pick
  // Fraunces); SOFT warms the terminals a touch. Kept tasteful — WONK
  // is intentionally left at default so it never reads gimmicky.
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    template: "%s · Frederick Radius",
    default: "Frederick Radius — A smarter way to experience Frederick County",
  },
  description:
    "Find what's nearby, happening, open, and worth your time across every town and community in Frederick County, Maryland. Places, events, parks, parking, civic services — one app.",
  applicationName: "Frederick Radius",
  authors: [{ name: "MAD Productions" }],
  generator: "Next.js",
  keywords: [
    "Frederick County", "Frederick MD", "Downtown Frederick",
    "things to do Frederick", "events Frederick MD", "restaurants Frederick",
    "Brunswick MD", "Thurmont MD", "Middletown MD",
    "Catoctin", "Carroll Creek", "civic technology",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE,
    siteName: "Frederick Radius",
    title: "Frederick Radius — A smarter way to experience Frederick County",
    description:
      "Find what's nearby, happening, open, and worth your time across every town and community in Frederick County, Maryland.",
    images: [{ url: `${BASE}/api/og`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Frederick Radius",
    description: "A smarter way to experience Frederick County.",
    images: [`${BASE}/api/og`],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Radius",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Field Guide identity: browser chrome / status bar matches the
  // warm editorial ink so the app frame reads as one piece.
  themeColor: "#211C18",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          inter.variable,
          display.variable,
          plexMono.variable,
          "antialiased min-h-screen selection:bg-[color:var(--app-brand)] selection:text-white",
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <div id="main">{children}</div>
        <Plausible />
        <SpeedInsights />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
