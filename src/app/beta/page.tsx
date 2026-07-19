import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import BetaEmailField from "@/components/beta/BetaEmailField";
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
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[68rem] flex-col px-5 sm:px-8">
        <section className="grid flex-1 items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:py-16">
          {/* The COVER, set like a printed field guide (owner ask,
              2026-07-19: "make it look like a real field guide"): a
              double-ruled cover plate, the series band across the top, the
              title block in the display serif, one photographic plate with
              an italic caption, and the edition line at the foot. */}
          <div
            className="mx-auto w-full max-w-[30rem] overflow-hidden rounded-[10px] border text-center"
            style={{
              borderColor: "var(--app-ink)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow:
                "inset 0 0 0 3px var(--app-bg-elevated-solid), inset 0 0 0 4px color-mix(in srgb, var(--app-ink) 35%, transparent), 0 24px 60px -40px color-mix(in srgb, var(--app-ink) 50%, transparent)",
            }}
          >
            {/* series band — the colored strap a printed series wears */}
            <p
              className="px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.26em] text-white"
              style={{ background: "var(--app-brand-press)" }}
            >
              Frederick Radius
            </p>

            <div className="px-6 pb-7 pt-6 sm:px-9 sm:pb-8">
              <p
                className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--app-brand-press)" }}
              >
                A field guide, updated through the day
              </p>

              <h1
                className="mt-3 font-serif font-semibold leading-[1.04] tracking-tight [text-wrap:balance]"
                style={{
                  color: "var(--app-ink)",
                  fontSize: "clamp(32px, 6vw, 46px)",
                }}
              >
                Plan your day in Frederick County.
              </h1>

              <p
                className="mx-auto mt-3.5 max-w-[28rem] text-[15.5px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                Check what is open and what is happening before you head out.
              </p>

              <CoverPhoto />

              {/* foot matter: the live contents line + the edition line,
                  separated from the plate by one hairline rule */}
              <div
                className="mt-6 border-t pt-4"
                style={{ borderColor: "var(--app-border-strong)" }}
              >
                <Suspense fallback={<ProofLineShell />}>
                  <ProofLine />
                </Suspense>
                <p
                  className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Early-access edition · {editionSeason()}
                </p>
              </div>
            </div>
          </div>

          <section
            aria-labelledby="beta-access-heading"
            className="mx-auto w-full max-w-[26rem] rounded-[var(--app-radius-lg)] border p-5 sm:p-6"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow:
                "0 24px 60px -34px color-mix(in srgb, var(--app-ink) 55%, transparent), var(--app-hi)",
            }}
          >
            <h2
              id="beta-access-heading"
              className="font-serif text-[26px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Get beta access
            </h2>
            <p
              className="mt-1.5 text-[14px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              You will receive a personal code by email right away.
            </p>

            <BetaEmailField />

            <details
              open={Boolean(prefillCode || error)}
              className="group mt-6 border-t pt-5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <summary
                className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden"
                style={{ color: "var(--app-ink-2)" }}
              >
                Already have a code?
                <span
                  aria-hidden
                  className="text-[18px] font-normal transition-transform group-open:rotate-45"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  +
                </span>
              </summary>

              <form action="/api/beta" method="post" className="mt-3 space-y-2.5">
                <input type="hidden" name="next" value={safeNext} />
                <label
                  htmlFor="beta-code"
                  className="block text-[12px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Access code
                </label>
                <input
                  id="beta-code"
                  type="text"
                  name="password"
                  required
                  defaultValue={prefillCode}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="frederick-…"
                  className="w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-center text-[16px] tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-1"
                  style={{
                    borderColor: error
                      ? "var(--app-brand)"
                      : "var(--app-border-strong)",
                    background: "var(--app-bg)",
                    color: "var(--app-ink)",
                    boxShadow: "var(--app-hi)",
                  }}
                />
                {error ? (
                  <p
                    role="alert"
                    className="text-[12.5px] font-semibold"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    That code did not match. Try again.
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="tactile-interactive tap-44 w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-[14px] font-semibold active:scale-[0.99]"
                  style={{
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink)",
                    borderColor: "var(--app-border-strong)",
                    boxShadow: "var(--app-hi)",
                  }}
                >
                  Enter Radius <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
                </button>
              </form>
            </details>
          </section>
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

/** Current season + year for the cover's edition line, Eastern time. */
function editionSeason(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const season =
    month >= 3 && month <= 5 ? "Spring" :
    month >= 6 && month <= 8 ? "Summer" :
    month >= 9 && month <= 11 ? "Fall" : "Winter";
  return `${season} ${year}`;
}

/**
 * The cover plate — Carroll Creek in downtown Frederick, mid-festival,
 * framed in a hairline rule with the caption set beneath in italic serif,
 * the way a printed guide captions its plates. The cover shows the real
 * PLACE, full of people, not an abstract mark or a drawing. (Replaced a
 * generic bullseye + radar-ring backdrop, then a line-art pass the owner
 * also turned down; owner asks, 2026-07-19.)
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
