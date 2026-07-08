import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Claim your business",
  description:
    "Owner claiming for Frederick County listings is coming soon.",
};

/**
 * Business-owner claim page. Lives outside the (app) route group, so it
 * renders chrome-free (no nav, no header) like /submit.
 *
 * The claim -> manage -> post -> push backend is built, but turning it on
 * for owners is a deferred owner decision. Until then this is an honest
 * coming-soon page in the app's vibe rather than a live intake form. A
 * `?place=<slug>` query still deep-links from a listing; we name it so the
 * promise lands on the right business. Do NOT wire the form back on without
 * an owner ask (the data model and ClaimForm stay in place for that day).
 */
export default async function ClaimBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const { place } = await searchParams;
  return (
    <div className="mx-auto max-w-screen-md px-4 py-8">
      <Link href="/" className="text-xs" style={{ color: "var(--app-cool)" }}>
        Back to Frederick Radius
      </Link>
      <header className="mt-4 space-y-2">
        <span
          className="inline-flex items-center gap-1.5"
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--app-accent-press)",
            border:
              "1px solid color-mix(in srgb, var(--app-accent) 45%, transparent)",
            borderRadius: "6px",
            padding: "3px 8px",
          }}
        >
          Coming soon
        </span>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Claim your business
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {place ? (
            <>
              Own or help run{" "}
              <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
                {place}
              </span>
              ? Owner claiming is coming soon.
            </>
          ) : (
            <>
              Own or help run a Frederick County business? Owner claiming is
              coming soon.
            </>
          )}{" "}
          When it lands you will be able to verify yourself and keep your hours,
          details, and specials accurate.
        </p>
      </header>

      <div
        className="mt-6 rounded-[var(--app-radius-md)] border p-4 text-[14px] leading-relaxed"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink-2)",
        }}
      >
        <p>
          Spot something wrong on a listing today? Email{" "}
          <a
            href="mailto:hello@frederickradius.app?subject=Business listing"
            className="underline"
            style={{ color: "var(--app-cool)" }}
          >
            hello@frederickradius.app
          </a>{" "}
          and we will fix it by hand.
        </p>
      </div>
    </div>
  );
}
