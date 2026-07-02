import type { Metadata } from "next";
import BetaEmailField from "@/components/beta/BetaEmailField";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: private beta",
  description: "Frederick Radius is in early access.",
};

/**
 * /beta — the shared-password unlock screen, reimagined as a bold FIELD-GUIDE
 * launch cover. Lives OUTSIDE the (app) route group (root layout only, no app
 * nav). The middleware redirects un-unlocked visitors here with a `next` param;
 * the form posts to /api/beta, which sets the unlock cookie and returns them.
 *
 * The look: the brand concept ("Radius") made the hero — a breathing vermilion
 * center with rings rippling outward across a faint topographic field of
 * concentric rings, a big serif cover line, and a mono county-canon plate. All
 * motion reuses the app's own reduced-motion-safe keyframes.
 *
 * Form logic is unchanged from the plain version — only the shell is new.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";

  // Faint topographic field: concentric rings radiating from center, the
  // radius motif turned into a trail-map texture behind everything.
  const rings = [70, 130, 195, 265, 340, 420, 505];

  return (
    <main
      className="relative overflow-hidden"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--app-bg)",
        backgroundImage: "var(--app-paper-light)",
        padding: "24px",
      }}
    >
      {/* ── Topographic radius field (behind everything) ── */}
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{ width: "min(140vmax, 1400px)", height: "min(140vmax, 1400px)", transform: "translate(-50%, -50%)" }}
        viewBox="0 0 1000 1000"
        fill="none"
      >
        {rings.map((r) => (
          <circle
            key={r}
            cx="500"
            cy="500"
            r={r}
            stroke="var(--app-ink)"
            strokeOpacity={0.05}
            strokeWidth={1.25}
          />
        ))}
      </svg>
      {/* Warm vermilion glow pooled behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%]"
        style={{
          width: "70vmin",
          height: "70vmin",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, color-mix(in srgb, var(--app-brand) 16%, transparent) 0%, transparent 62%)",
        }}
      />

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-[26rem] text-center">
        {/* Radius hero mark: rippling rings + breathing vermilion center. */}
        <div className="relative mx-auto grid h-24 w-24 place-items-center">
          <span
            aria-hidden
            className="radius-ripple absolute inset-0 rounded-full"
            style={{ border: "2px solid var(--app-brand)" }}
          />
          <span
            aria-hidden
            className="radius-ripple absolute inset-0 rounded-full"
            style={{ border: "2px solid var(--app-brand)", animationDelay: "1400ms" }}
          />
          <span
            aria-hidden
            className="absolute inset-[18px] rounded-full"
            style={{ border: "1.5px solid color-mix(in srgb, var(--app-brand) 38%, transparent)" }}
          />
          <span
            aria-hidden
            className="radius-breathe h-7 w-7 rounded-full"
            style={{ background: "var(--app-brand)", boxShadow: "0 4px 16px -4px color-mix(in srgb, var(--app-brand) 70%, transparent)" }}
          />
        </div>

        <p className="mt-7 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-press)" }}>
          <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
          Private beta
        </p>

        <h1
          className="mt-3 font-serif font-semibold leading-[0.98] tracking-tight"
          style={{ color: "var(--app-ink)", fontSize: "clamp(44px, 12vw, 60px)" }}
        >
          You&rsquo;re early.
        </h1>

        <p className="mx-auto mt-4 max-w-[22rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A living field guide to Frederick County: what&rsquo;s open, what&rsquo;s
          on, and what&rsquo;s worth your time. Enter the password you were given
          to come in.
        </p>

        <form action="/api/beta" method="post" className="mx-auto mt-6 max-w-[20rem] space-y-2.5">
          <input type="hidden" name="next" value={safeNext} />
          <input
            type="password"
            name="password"
            required
            autoComplete="off"
            aria-label="Beta password"
            placeholder="Password"
            className="w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-center text-[16px] tracking-wide focus:outline-none"
            style={{
              borderColor: error ? "var(--app-brand)" : "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink)",
              boxShadow: "var(--app-hi)",
            }}
          />
          {error && (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              That password did not match. Try again.
            </p>
          )}
          <button
            type="submit"
            className="tactile-interactive w-full rounded-[var(--app-radius-md)] px-4 py-3 text-[15px] font-semibold tracking-tight active:scale-[0.99]"
            style={{
              background: "var(--app-brand)",
              color: "var(--app-on-brand)",
              boxShadow: "0 10px 24px -10px color-mix(in srgb, var(--app-brand) 70%, transparent), var(--app-hi)",
            }}
          >
            Come in &rarr;
          </button>
        </form>

        {/* Optional launch-news signup — the owned announcement channel for
            people the wall turns away. See BetaEmailField. */}
        <BetaEmailField />

        {/* County-canon plate: the field-guide detail line. */}
        <div
          className="mx-auto mt-8 flex max-w-[22rem] items-center justify-center gap-2.5 border-t pt-3 font-mono text-[10.5px] uppercase tracking-[0.12em]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <span>12 towns</span>
          <span aria-hidden style={{ color: "var(--app-brand)" }}>·</span>
          <span>663 sq mi</span>
          <span aria-hidden style={{ color: "var(--app-brand)" }}>·</span>
          <span>est. 1748</span>
        </div>
      </div>
    </main>
  );
}
