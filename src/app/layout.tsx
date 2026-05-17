import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Plausible from "@/components/analytics/Plausible";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    "Find what's nearby, happening, open, and worth your time across all 12 Frederick County, Maryland municipalities. Places, events, parks, parking, civic services — one app.",
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
      "Find what's nearby, happening, open, and worth your time across all 12 Frederick County, Maryland municipalities.",
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // System Black brand: the browser chrome / status bar matches the
  // app's dark identity in both schemes (validated premium direction).
  themeColor: "#0A0A0A",
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
          plexSerif.variable,
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
      </body>
    </html>
  );
}
