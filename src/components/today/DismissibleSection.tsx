"use client";

import Link from "next/link";
import { ArrowRight, EyeOff } from "lucide-react";
import { useMounted } from "@/hooks/useSaved";
import { useIsHidden, useHide } from "@/hooks/useHiddenSections";

/**
 * A Today section the user can hide. Server-rendered children are
 * passed through, so the data work stays on the server; only the hide
 * affordance and the visibility decision are client side.
 *
 * Before mount it renders fully (no hydration flash, and the content is
 * always present for crawlers). After mount, a hidden section collapses
 * to nothing; HiddenSectionsBar offers a one tap restore.
 */
export default function DismissibleSection({
  id,
  title,
  href,
  cta = "See all",
  meta,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  cta?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const hidden = useIsHidden(id);
  const hide = useHide(id);

  if (mounted && hidden) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {href && (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs font-medium tracking-tight"
              style={{ color: "var(--app-brand)" }}
            >
              {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={hide}
            aria-label={`Hide ${title}`}
            className="inline-flex items-center gap-1 text-xs font-medium tracking-tight transition-colors"
            style={{ color: "var(--app-ink-3)" }}
          >
            <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Hide
          </button>
        </div>
      </header>
      {meta && (
        <p className="-mt-1.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {meta}
        </p>
      )}
      {children}
    </section>
  );
}
