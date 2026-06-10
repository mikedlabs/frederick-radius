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
  eyebrow,
  plateNo,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  cta?: string;
  meta?: React.ReactNode;
  /** Field-guide eyebrow — a small tracked plate label above the title
   *  (e.g. "WHAT'S ON"). Opt-in; omit for the plain header. */
  eyebrow?: string;
  /** Field-guide plate index (e.g. "No. 03"), shown at the far right of
   *  the header rule. Opt-in. */
  plateNo?: string;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const hidden = useIsHidden(id);
  const hide = useHide(id);

  if (mounted && hidden) return null;

  return (
    <section
      className={`relative rounded-[var(--app-radius-lg)] border p-4${eyebrow || plateNo ? " fg-plate" : ""}`}
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
      }}
    >
      {/* Card-bounded section per the brief: "areas need to be
          defined more." The hairline + inner-shadow treatment marks
          each section as a discrete room a visitor can walk into,
          not another stack on a long page. When a field-guide eyebrow
          is set, the header reads like a plate caption — tracked label,
          serif title, a hairline rule, and an optional plate index. */}
      <header className={eyebrow ? "mb-3" : "mb-3 flex items-baseline justify-between gap-3"}>
        {eyebrow ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="fg-eyebrow">{eyebrow}</span>
                <h2
                  className="mt-1 font-serif text-xl font-semibold tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {href && (
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-xs font-medium tracking-tight"
                    style={{ color: "var(--app-brand-press)" }}
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
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="fg-rule flex-1" />
              {plateNo && <span className="fg-plate-no shrink-0">{plateNo}</span>}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {title}
            </h2>
            <div className="flex shrink-0 items-center gap-3">
              {href && (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-xs font-medium tracking-tight"
                  style={{ color: "var(--app-brand-press)" }}
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
          </>
        )}
      </header>
      {meta && (
        <p className="-mt-2 mb-3 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {meta}
        </p>
      )}
      {children}
    </section>
  );
}
