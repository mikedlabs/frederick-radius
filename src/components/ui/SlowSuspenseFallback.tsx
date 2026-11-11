"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

/**
 * A Suspense fallback with an escape hatch.
 *
 * It shows its skeleton immediately (identical to before), but if the boundary
 * is STILL suspended after `afterMs`, it reveals a calm "taking longer" panel
 * with a reload + an always-works alternative — so a cold-cache / slow-feed
 * load can never become an infinite shimmer with no way out (the launch-review
 * "stuck skeleton"). The moment the real content streams in, the whole fallback
 * (timer included) unmounts, so a fast load never sees any of this.
 *
 * `afterMs` defaults past the data layer's own worst case (per-feed timeout is
 * ~8s) so the escape only appears when something is genuinely wrong, not on a
 * merely-cold load that's about to resolve.
 */
export default function SlowSuspenseFallback({
  children,
  afterMs = 9000,
  label = "This is taking longer than usual.",
  altHref,
  altLabel,
}: {
  children: ReactNode;
  afterMs?: number;
  label?: string;
  altHref?: string;
  altLabel?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);

  return (
    <div className="relative">
      {children}
      {slow && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex flex-col items-start gap-2 border-t py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {label}
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="min-h-11 rounded-[var(--app-radius-md)] px-4 text-[13px] font-semibold"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
            >
              Reload
            </button>
            {altHref && (
              <Link
                href={altHref}
                className="inline-flex min-h-11 items-center rounded-[var(--app-radius-md)] border px-4 text-[13px] font-semibold"
                style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
              >
                {altLabel ?? "Browse instead"}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
