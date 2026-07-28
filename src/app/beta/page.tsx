import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import BetaEmailField from "@/components/beta/BetaEmailField";
import CoverFlight from "@/components/beta/CoverFlight";
import LiveEasternTime from "@/components/beta/LiveEasternTime";
import { GuideContents, GuideContentsLive } from "@/components/beta/GuideContents";
import { buildFlightSlides } from "@/lib/beta-flight";
import { formatEasternClock } from "@/lib/format/easternClock";
import { safeRedirectPath } from "@/lib/safe-redirect";
import RippleMark from "@/components/brand/RippleMark";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: early-access beta",
  description: "A local guide to Frederick, kept live to the minute. The beta is open by personal code.",
  openGraph: {
    title: "Frederick, the way a local knows it",
    description: "A local guide to Frederick, kept live to the minute. The beta is open by personal code.",
    images: [{ url: "/api/og?type=beta", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * /beta — the legacy invite page, framed as the guide's own table of contents
 * rendered live. The public site no longer redirects visitors here; the page
 * remains for existing personal-code, email-invite, and beta-feedback flows.
 *
 * Owner calls, 2026-07: the code and the email sit at the top so the way in
 * is never buried; the title leads with what the guide is before the proof.
 *
 * This route must STAY dynamic (it already awaits searchParams): the
 * dateline, the briefing minute, and every live figure are honest only
 * because they render per request. Do not add ISR here.
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
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(now);
  const part = (t: string) => dateParts.find((p) => p.type === t)?.value ?? "";
  const dateline = `${part("weekday")} · ${part("month")} ${part("day")} · Frederick, MD`.toUpperCase();
  const dateISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const briefingWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);
  // The minute is honest per request (this route stays dynamic, no ISR);
  // LiveEasternTime keeps it honest while the tab sits open. Same formatter
  // both places so the SSR seed and the first client tick never disagree.
  const briefingTime = formatEasternClock(now);

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
          app's sky hero gives /today, at a whisper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[19rem]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--app-brand) 9%, transparent), color-mix(in srgb, var(--app-accent) 4%, transparent) 55%, transparent)",
        }}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col px-5 lg:max-w-[64rem] lg:px-8">
        {/* Masthead: the app's own identity left, today's dateline right. */}
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden>
              <RippleMark size={34} />
            </span>
            <span className="font-brand text-[18px] leading-none tracking-[-0.015em]" style={{ color: "var(--app-ink)" }}>
              Frederick Radius
            </span>
          </div>
          <time
            dateTime={dateISO}
            className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {dateline}
          </time>
        </div>

        <section className="flex-1 pb-6 lg:grid lg:grid-cols-[minmax(0,25rem)_1px_minmax(0,1fr)] lg:items-start lg:gap-x-12">
          {/* Left column: the title and the way in (code, then email). Sticky
              on desktop so the way in stays on screen while the proof scrolls. */}
          <div className="stagger-children lg:sticky lg:top-10 lg:self-start">
            <h1
              className="mt-2 font-serif font-semibold leading-[1.08] tracking-tight [text-wrap:balance]"
              style={{ color: "var(--app-ink)", fontSize: "clamp(30px, 6.5vw, 42px)" }}
            >
              Frederick, the way a local knows it.
            </h1>
            <p className="mt-2.5 max-w-[34rem] text-[15px] leading-[1.6]" style={{ color: "var(--app-ink-2)" }}>
              A local guide to Frederick, kept live to the minute.
            </p>

            <section
              id="beta-access"
              aria-labelledby="beta-access-heading"
              className="mt-5 scroll-mt-6 rounded-[var(--app-radius-lg)] border p-5"
              style={{
                borderColor: "var(--app-border-strong)",
                background: "var(--app-bg-elevated-solid)",
                boxShadow: "var(--app-elev-1), var(--app-hi)",
              }}
            >
              <h2 id="beta-access-heading" className="sr-only">
                The way in
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
                  No code yet? Leave your email and one comes right back.
                </p>
                <BetaEmailField next={safeNext} />
              </div>
            </section>
          </div>

          {/* Plain editorial column rule between the way in and the proof. */}
          <div aria-hidden className="hidden lg:block lg:w-px" style={{ background: "var(--app-border)" }} />

          {/* Right column: the county proving itself, then the contents. */}
          <div className="stagger-children lg:min-w-0">
            <section aria-labelledby="beta-now-heading" className="mt-9 lg:mt-1">
              <Eyebrow id="beta-now-heading">Frederick, right now</Eyebrow>
              <p className="mt-3 font-serif text-[19px] font-semibold [text-wrap:balance]" style={{ color: "var(--app-ink)" }}>
                It is {briefingWeekday} at <LiveEasternTime initial={briefingTime} iso={now.toISOString()} /> in Frederick.
              </p>
              <FlightOrPlate now={now} />
            </section>

            <Suspense fallback={<GuideContents pulse={null} pending now={now} />}>
              <GuideContentsLive now={now} />
            </Suspense>

            {/* Mobile only: after the whole proof, the way back up to the gate. */}
            <div className="mt-8 lg:hidden">
              <p className="text-[13.5px]" style={{ color: "var(--app-ink-2)" }}>
                Your code goes in the box at the top of the page.
              </p>
              <a
                href="#beta-access"
                className="tactile-interactive tap-44 mt-2.5 flex w-full items-center justify-center rounded-[var(--app-radius-md)] border px-4 py-3 text-[14px] font-semibold"
                style={{
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-ink)",
                  borderColor: "var(--app-border-strong)",
                  boxShadow: "var(--app-hi)",
                }}
              >
                Back to access code
              </a>
            </div>

            {/* Maker note closes the proof column at every width. */}
            <p className="mt-8 text-[13px] leading-[1.6]" style={{ color: "var(--app-ink-2)" }}>
              One person in Frederick makes this guide, and every aerial photo is his own. Reach him
              with a question or a code request at{" "}
              <a
                href="mailto:hello@frederickradius.app"
                className="tap-44-y inline-flex items-center font-mono text-[12px] underline underline-offset-2"
                style={{ color: "var(--app-ink-2)" }}
              >
                hello@frederickradius.app
              </a>
              .
            </p>
          </div>
        </section>

        <div className="border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-center font-sans text-[16px] font-medium" style={{ color: "var(--app-ink-2)" }}>
            Frederick County starts where you are.
          </p>
        </div>

        <footer
          className="flex flex-col items-center justify-between gap-2 py-5 text-center text-[11.5px] sm:flex-row sm:text-left"
          style={{ color: "var(--app-ink-3)" }}
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

/** The section eyebrow shared by "The county, right now" and any other
 *  labelled section: a short vermilion rule and an uppercase mono label.
 *  Rendered as the labelled heading for its section (pass the id its
 *  aria-labelledby wants). */
function Eyebrow({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="flex items-baseline gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--app-brand-press)" }}
    >
      <span aria-hidden className="block h-[3px] w-7 translate-y-[-2px] rounded-full" style={{ background: "var(--app-brand)" }} />
      {children}
    </h2>
  );
}

/**
 * The plate slot: the drone-library cover flight when the aerial
 * manifest yields slides (the normal case — see lib/beta-flight), the
 * static Carroll Creek plate as the fail-soft fallback.
 */
function FlightOrPlate({ now }: { now: Date }) {
  const slides = buildFlightSlides(now);
  return slides.length > 0 ? <CoverFlight slides={slides} /> : <CoverPhoto />;
}

/**
 * The static cover plate — Carroll Creek in downtown Frederick,
 * mid-festival, framed in a hairline rule with the caption set beneath
 * in italic serif. Kept as the cover-flight's fail-soft fallback.
 */
function CoverPhoto() {
  return (
    <figure className="mx-auto mt-3 w-full">
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
