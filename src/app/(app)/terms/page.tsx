import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use for Frederick Radius — covers acceptable use, copyright, anti-scraping, and the contact path for licensing requests.",
};

/**
 * /terms — public-facing terms of use.
 *
 * The user-facing companion to the repository's LICENSE file. Lays out:
 *   - who owns what
 *   - acceptable use (browsing fine, scraping/training not)
 *   - the AI-training opt-out signal (robots.txt is authoritative;
 *     this page is the human-readable equivalent)
 *   - the licensing-contact path
 *
 * Deliberately short and direct. A terms page nobody reads is the
 * point — the value is having something to point at when someone
 * asks "can I use your data?" or when a scraper gets caught.
 */
export default function TermsPage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-6 py-6">
      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Terms of use
        </p>
        <h1
          className="font-serif text-[32px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The short version.
        </h1>
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          Last updated: 2026-05-28
        </p>
      </header>

      <section className="space-y-5 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            What you can do
          </h2>
          <p>
            Browse, search, share links, save places, submit corrections, and
            tell people about it. The whole app is free to use. If anything
            here helps you decide what to do in Frederick County, that&rsquo;s
            the point.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            What we ask you not to do
          </h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Don&rsquo;t scrape the site or its APIs.</strong> The
              curated place / event / amenity data took real work to clean and
              verify. If you need bulk access for a legitimate project, email
              and ask — we&rsquo;re probably willing to share with attribution
              and rate limits.
            </li>
            <li>
              <strong>Don&rsquo;t use this content to train AI models.</strong>{" "}
              The <code>robots.txt</code> opts out the major LLM training
              crawlers; this is the human-readable version of the same signal.
              Honoring it is required.
            </li>
            <li>
              <strong>Don&rsquo;t republish photographs</strong> from the From
              Above collection without explicit permission. These are
              copyrighted drone photographs by Michael DeMattia.
            </li>
            <li>
              <strong>
                Don&rsquo;t use the Frederick Radius name or disc logo
              </strong>{" "}
              to identify a different product or service. The mark is in use.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Where the data comes from
          </h2>
          <p>
            Public sources (Frederick County GIS, National Weather Service,
            OpenStreetMap, Google Places, the City of Frederick&rsquo;s event
            feeds, and others) plus the editorial curation that turns those
            into a useful product. Each source keeps its own license; the
            curation work is ours. See{" "}
            <Link
              href="/trust"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-cool)" }}
            >
              /trust
            </Link>{" "}
            for the full provenance.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Accuracy
          </h2>
          <p>
            We work hard to keep place and event data current, but information
            does drift — businesses close, hours change, events get rescheduled.
            Always confirm time-sensitive details directly with the place or
            event organizer before showing up. If something is wrong,{" "}
            <Link
              href="/submit/place"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-cool)" }}
            >
              tell us
            </Link>{" "}
            — corrections land in the next data refresh.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Licensing & permissions
          </h2>
          <p>
            For licensing, partnership, data-sharing, or republication
            requests, email{" "}
            <a
              href="mailto:miked@madproductions.io?subject=Frederick%20Radius%20licensing"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-brand)" }}
            >
              miked@madproductions.io
            </a>
            . Most reasonable asks get a yes.
          </p>
        </div>
      </section>

      <footer
        className="border-t pt-4 text-[12px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Frederick Radius is built and operated by Michael DeMattia, a
          downtown Frederick resident. © 2025–2026. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
