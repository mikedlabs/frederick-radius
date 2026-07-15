import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import BetaEmailField from "@/components/beta/BetaEmailField";
import { getBetaPulse } from "@/lib/loaders/betaPulse";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: early-access beta",
  description:
    "Your field guide to Frederick County. Find what's open, what's on, and what matters before you head out.",
  openGraph: {
    title: "Your field guide to Frederick County",
    description:
      "Find what's open, what's on, and what matters before you head out. Early-access beta.",
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
      <BetaBackdrop />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[68rem] flex-col px-5 sm:px-8">
        <section className="grid flex-1 items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:py-16">
          <div className="mx-auto w-full max-w-[36rem] text-center lg:mx-0 lg:text-left">
            <RadiusMark />

            <p
              className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Early-access beta
            </p>

            <h1
              className="mt-3 font-serif font-semibold leading-[1.02] tracking-tight"
              style={{
                color: "var(--app-ink)",
                fontSize: "clamp(38px, 7vw, 64px)",
              }}
            >
              Your field guide to Frederick County.
            </h1>

            <p
              className="mx-auto mt-5 max-w-[32rem] text-[17px] leading-relaxed lg:mx-0"
              style={{ color: "var(--app-ink-2)" }}
            >
              Find what&rsquo;s open, what&rsquo;s on today, and what matters
              before you head out.
            </p>

            <Suspense fallback={<ProofLineShell />}>
              <ProofLine />
            </Suspense>

            <p
              className="mt-5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Open now&nbsp; · &nbsp;Today&rsquo;s events&nbsp; · &nbsp;Live local conditions
            </p>
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
              We&rsquo;ll email you a personal code right away.
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
          <p>Made locally in Frederick, Maryland. An independent project.</p>
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

function RadiusMark() {
  return (
    <div
      aria-hidden
      className="relative mx-auto grid h-[72px] w-[72px] place-items-center rounded-full lg:mx-0"
      style={{ border: "1.5px solid var(--app-brand)" }}
    >
      <span
        className="absolute inset-[13px] rounded-full"
        style={{
          border:
            "1px solid color-mix(in srgb, var(--app-brand) 45%, transparent)",
        }}
      />
      <span
        className="h-5 w-5 rounded-full"
        style={{
          background: "var(--app-brand)",
          boxShadow:
            "0 4px 14px -4px color-mix(in srgb, var(--app-brand) 70%, transparent)",
        }}
      />
    </div>
  );
}

function BetaBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -left-[24rem] -top-[25rem] h-[58rem] w-[58rem]"
      viewBox="0 0 800 800"
      fill="none"
    >
      {[120, 220, 320].map((radius) => (
        <circle
          key={radius}
          cx="400"
          cy="400"
          r={radius}
          stroke="var(--app-brand)"
          strokeOpacity={0.055}
          strokeWidth={1.5}
        />
      ))}
    </svg>
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

  return (
    <p
      className="mt-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        color: "var(--app-ink-2)",
        boxShadow: "var(--app-hi)",
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--app-positive)" }}
      />
      {facts.join(" · ")}
    </p>
  );
}

function ProofLineShell() {
  return (
    <span
      aria-hidden
      className="mt-6 inline-block h-[38px] w-[16rem] max-w-full rounded-full border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
      }}
    />
  );
}
