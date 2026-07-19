import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import BetaEmailField from "@/components/beta/BetaEmailField";
import CoverFlight from "@/components/beta/CoverFlight";
import { buildFlightSlides } from "@/lib/beta-flight";
import { getBetaPulse } from "@/lib/loaders/betaPulse";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: early-access beta",
  description: "Early access to a local guide for deciding where to go across Frederick County.",
  openGraph: {
    title: "Plan your day in Frederick County",
    description: "Check open places and local events before you head out.",
    images: [{ url: "/api/og?type=beta", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * /beta is an access page, not a product tour. It makes one promise, offers
 * one primary path in, and keeps the returning-tester path close at hand.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const { next, error, code } = await searchParams;
  const safeNext = safeRedirectPath(next, "/today");
  const prefillCode =
    code && /^[a-z0-9-]{1,40}$/.test(code) ? code : undefined;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: "var(--app-bg)",
        backgroundImage: "var(--app-paper-light)",
      }}
    >
      {/* A quiet warm wash behind the masthead — the same atmosphere the
          app's sky hero gives /today, at a whisper. Ends well above the
          access card so the forms sit on plain paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[19rem]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--app-brand) 9%, transparent), color-mix(in srgb, var(--app-accent, #B8860B) 4%, transparent) 55%, transparent)",
        }}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col px-5 sm:px-0 lg:max-w-[60rem] lg:px-8">
        <section className="flex-1 py-9 sm:py-12 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="stagger-children">
          {/* The gate wears the APP's own identity — the exact TopBar
              lockup (red disc, serif Frederick over tracked RADIUS), the
              app's masthead typography, the app's calm cream. No book
              cosplay, no marketing chrome (owner, 2026-07-19: earlier
              cover drafts felt off-brand). */}
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full shadow-[var(--app-shadow-1)]"
              style={{ background: "var(--app-brand)" }}
              aria-hidden
            >
              <Disc />
            </span>
            <span className="font-serif text-[17px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              Frederick
              <span className="-mt-0.5 block text-[10.5px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                Radius
              </span>
            </span>
          </div>

          <h1
            className="mt-5 font-serif font-semibold leading-[1.05] tracking-tight [text-wrap:balance]"
            style={{ color: "var(--app-ink)", fontSize: "clamp(28px, 7vw, 38px)" }}
          >
            Plan your day in Frederick County.
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Check what is open and what is happening before you head out. The beta is open by
            personal code.
          </p>

          {/* ACCESS — the one job of this page, right under the promise.
              The code path comes FIRST and stays OPEN (owner ask: easier
              code entry — most testers arrive with a code in hand); the
              email path follows under one rule. */}
          <section
            aria-labelledby="beta-access-heading"
            className="mt-6 rounded-[var(--app-radius-lg)] border p-5"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow: "var(--app-elev-1), var(--app-hi)",
            }}
          >
            <h2 id="beta-access-heading" className="sr-only">
              Beta access
            </h2>
            <form action="/api/beta" method="post" className="space-y-2.5">
              <input type="hidden" name="next" value={safeNext} />
              <label
                htmlFor="beta-code"
                className="block text-[13px] font-semibold"
                style={{ color: "var(--app-ink)" }}
              >
                Have a code? Enter it here.
              </label>
              <input
                id="beta-code"
                type="text"
                name="password"
                required
                defaultValue={prefillCode}
                // A wrong code or a shared ?code= link means the user's
                // very next act is this field — put the cursor there.
                autoFocus={Boolean(error || prefillCode)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="frederick-…"
                className="w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-center font-mono text-[16px] tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-1"
                style={{
                  borderColor: error ? "var(--app-brand)" : "var(--app-border-strong)",
                  background: "var(--app-bg)",
                  color: "var(--app-ink)",
                  boxShadow: "var(--app-hi)",
                }}
              />
              {error ? (
                <p role="alert" className="text-[12.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                  That code did not match. Try again.
                </p>
              ) : null}
              <button
                type="submit"
                className="tactile-interactive tap-44 w-full rounded-[var(--app-radius-md)] px-4 py-3 text-[14.5px] font-semibold text-white active:scale-[0.99]"
                style={{ background: "var(--app-brand-press)" }}
              >
                Enter Radius <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
              </button>
            </form>

            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                No code yet? Get one by email right away.
              </p>
              <BetaEmailField />
            </div>
          </section>
          </div>

          {/* Below the gate (beside it on wide screens), the proof: the
              county from the guide's own drone, each frame stating what
              Radius knows about the ground in it. The product,
              demonstrating itself. */}
          <div className="stagger-children mt-9 lg:mt-1">
            <p
              className="flex items-baseline gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              <span
                aria-hidden
                className="block h-[3px] w-7 translate-y-[-2px] rounded-full"
                style={{ background: "var(--app-brand)" }}
              />
              The county, right now
            </p>
            <FlightOrPlate />
            <div className="mt-3 text-center">
              <Suspense fallback={<ProofLineShell />}>
                <ProofLine />
              </Suspense>
            </div>
          </div>
        </section>

        <footer
          className="flex flex-col items-center justify-between gap-2 border-t py-5 text-center text-[11.5px] sm:flex-row sm:text-left"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <p>An independent project made in Frederick, Maryland.</p>
          <p className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="tap-44 inline-flex items-center font-semibold underline-offset-2 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="tap-44 inline-flex items-center font-semibold underline-offset-2 hover:underline"
            >
              Terms
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

/** The TopBar's disc mark, duplicated here because /beta renders outside
 *  the app shell (no TopBar) but must wear the same identity. */
function Disc() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="white" />
    </svg>
  );
}

/**
 * The plate slot: the drone-library cover flight when the aerial
 * manifest yields slides (the normal case — see lib/beta-flight), the
 * static Carroll Creek plate as the fail-soft fallback.
 */
function FlightOrPlate() {
  const slides = buildFlightSlides(new Date());
  return slides.length > 0 ? <CoverFlight slides={slides} /> : <CoverPhoto />;
}

/**
 * The static cover plate — Carroll Creek in downtown Frederick,
 * mid-festival, framed in a hairline rule with the caption set beneath
 * in italic serif, the way a printed guide captions its plates. Kept as
 * the cover-flight's fail-soft fallback.
 */
function CoverPhoto() {
  return (
    <figure className="mx-auto mt-6 w-full">
      <div
        className="relative overflow-hidden border"
        style={{ borderColor: "var(--app-ink-tint-12, rgba(22,20,14,.25))", aspectRatio: "16 / 10" }}
      >
        <Image
          src="/images/seasons/summer/084.jpg"
          alt="Carroll Creek promenade in downtown Frederick during a festival, seen from above"
          fill
          priority
          sizes="(min-width: 640px) 28rem, 100vw"
          className="object-cover"
        />
      </div>
      <figcaption
        className="mt-2 text-center font-serif text-[13.5px] italic"
        style={{ color: "var(--app-ink-2)" }}
      >
        Carroll Creek, downtown Frederick.
      </figcaption>
    </figure>
  );
}

async function ProofLine() {
  const pulse = await getBetaPulse(new Date());
  const facts: string[] = [];

  if (pulse.openNow && pulse.openNow.count > 0) {
    facts.push(`${pulse.openNow.count.toLocaleString()} open now`);
  } else if (pulse.places > 0) {
    facts.push(`${pulse.places.toLocaleString()} places mapped`);
  }
  if (pulse.eventsToday != null && pulse.eventsToday > 0) {
    facts.push(
      `${pulse.eventsToday.toLocaleString()} ${pulse.eventsToday === 1 ? "event" : "events"} today`,
    );
  }

  if (facts.length === 0) return null;

  // A live ledger line, not a marketing pill: mono digits, the green dot
  // as the only ornament. The counts are the page's proof it is a real,
  // current read on the county.
  return (
    <p
      className="mt-5 inline-flex items-center gap-2 font-mono text-[12.5px] font-semibold tabular-nums"
      style={{ color: "var(--app-ink-2)" }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--app-positive)" }}
      />
      {facts.join("  ·  ")}
    </p>
  );
}

function ProofLineShell() {
  return (
    <span
      aria-hidden
      className="mt-5 inline-block h-[19px] w-[15rem] max-w-full rounded-[4px]"
      style={{ background: "var(--app-bg-sunken)" }}
    />
  );
}
