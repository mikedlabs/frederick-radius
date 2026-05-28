import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";

/**
 * /about — the 30-second pitch.
 *
 * Rewritten from a 342-line thesis essay (multiple sections, dashboard,
 * map embed, stat blocks) down to a four-paragraph pitch with a single
 * primary CTA. The job of this page is to convert a curious link-tapper
 * into a user, not to defend the product to itself.
 *
 * What this page is for:
 *   - A first-time stranger from a press link or share URL who needs
 *     to know what this is in 30 seconds.
 *   - A partner / funder who wants to confirm the bet is real before
 *     reading the data-trust commitments (linked at the bottom).
 *
 * What this page is NOT:
 *   - A magazine front. The other surfaces show the data; this one
 *     says why.
 *   - A dashboard. Live stats and embedded maps are noise here —
 *     they belong on the surfaces that actually do that job.
 *   - An onboarding sequence. /welcome handles persona-pick + cookie.
 */

export const metadata: Metadata = {
  title: "About",
  description:
    "Frederick Radius is the pocket compass for Frederick County, Maryland. What's open, what's happening, where, and how to get there.",
};

export default async function AboutPage() {
  return (
    <div className="relative mx-auto max-w-md space-y-7 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/now"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Now
        </Link>
      </nav>

      {/* Seasonal hero photograph — a real photo of Frederick from the
          owner's seasons collection, picked by current season with
          daily rotation. Frames "the pocket compass for Frederick
          County" line with a real sense of place before the pitch. */}
      <div
        className="relative -mx-4 overflow-hidden rounded-[var(--app-radius-lg)] sm:mx-0"
        style={{ aspectRatio: "16/9" }}
      >
        <SeasonalPhoto
          season="auto"
          alt="Frederick County"
          priority={true}
          sizes="(max-width: 768px) 100vw, 640px"
          className="absolute inset-0"
        />
        {/* Soft bottom gradient so the eyebrow + H1 below stay readable
            against a busy photo without darkening it heavily. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.18), transparent)",
          }}
        />
      </div>

      <header className="space-y-3">
        <p
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          About Frederick Radius
        </p>
        <h1
          className="font-serif text-[36px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The pocket compass for{" "}
          <span style={{ color: "var(--app-brand)" }}>Frederick County.</span>
        </h1>
      </header>

      {/* The pitch — four paragraphs, no more. Read top to bottom in
          about 30 seconds. The italic tagline uses Newsreader's
          italic (the display serif) on Public Sans body — Instrument
          Serif was dropped in the May 2026 audit. */}
      <section className="space-y-4 text-[16px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <p>
          <span className="font-serif italic text-[18px]" style={{ color: "var(--app-ink)" }}>
            What&apos;s open, what&apos;s happening, where, and how to get there
          </span>
          {" "}— across every town and community in Frederick County, Maryland. One app.
        </p>
        <p>
          Built around five questions a real person actually asks:
          {" "}<em>Is anything open near me right now?</em>{" "}
          <em>What&apos;s happening tonight?</em>{" "}
          <em>What&apos;s worth a Saturday?</em>{" "}
          <em>What&apos;s that town like?</em>{" "}
          <em>How do I get there?</em>
        </p>
        <p>
          Not a tourism brochure. Not a generic directory. Not a civic dashboard. A daily-use tool that turns this county&apos;s data into actual decisions — what to do, where to go, when to leave.
        </p>
        <p>
          Made in Frederick, MD by{" "}
          <span
            className="font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Michael DeMattia
          </span>
          , a downtown Frederick resident.
        </p>
      </section>

      {/* The CTA — single primary button. The whole point of this
          page is to push the visitor to actually use the app. */}
      <div className="pt-2">
        <Link
          href="/now"
          className="tactile tactile-lift tactile-glow-brand inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold text-white"
          style={{ background: "var(--app-brand)" }}
        >
          See what&apos;s useful right now
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {/* Trust footer — the data-source commitments and the photography
          book sit here as quiet, single-line links. Partners and
          funders click through; daily users ignore them, which is the
          right behavior for both audiences. */}
      <footer
        className="space-y-3 border-t pt-5 text-[13px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p className="inline-flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-cool)" }} />
          <Link href="/trust" className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--app-cool)" }}>
            How we verify everything we publish →
          </Link>
        </p>
        <p>
          Companion: a photo book of Frederick County from above.{" "}
          <Link
            href="/from-above"
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-brand)" }}
          >
            From Above →
          </Link>
        </p>
      </footer>
    </div>
  );
}
