import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: private beta",
  description: "Frederick Radius is in early access.",
};

/**
 * /beta — the shared-password unlock screen. Lives OUTSIDE the (app) route group
 * so it renders on the root layout only (no app nav): a calm, on-brand wall, not
 * a dead end. The middleware redirects un-unlocked visitors here with a `next`
 * param; the form posts to /api/beta, which sets the unlock cookie and returns
 * them to where they were headed.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";

  return (
    <main
      style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--app-bg)", padding: "24px" }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--app-radius-lg)] border p-6"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-2), var(--app-hi)",
        }}
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-ink-3)" }}>
          Frederick Radius
        </p>
        <h1 className="mt-2 font-serif text-[25px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          A private beta.
        </h1>
        <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          This field guide to Frederick County is in early access. Enter the password you were given to come in.
        </p>

        <form action="/api/beta" method="post" className="mt-4 space-y-2.5">
          <input type="hidden" name="next" value={safeNext} />
          <input
            type="password"
            name="password"
            required
            autoComplete="off"
            aria-label="Beta password"
            placeholder="Password"
            className="w-full rounded-[var(--app-radius-md)] border px-3 py-2.5 text-[15px] focus:outline-none"
            style={{
              borderColor: error ? "var(--app-brand)" : "var(--app-border)",
              background: "var(--app-bg-elevated-solid)",
              color: "var(--app-ink)",
            }}
          />
          {error && (
            <p className="text-[12px] font-medium" style={{ color: "var(--app-brand-press)" }}>
              That password did not match. Try again.
            </p>
          )}
          <button
            type="submit"
            className="tactile tactile-interactive w-full rounded-[var(--app-radius-md)] px-3 py-2.5 text-[14px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
          >
            Enter
          </button>
        </form>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Frederick County, Maryland
        </p>
      </div>
    </main>
  );
}
