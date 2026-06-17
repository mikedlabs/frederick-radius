import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

const REVERSED = "var(--app-ink-inverse)";

/** PROTOTYPE: one big color-block "answer" for /proto/today. Filing-ink ground,
 *  reversed-out type, a huge title, a one-line teaser, and a big mono count. */
export default function TodayBlock({
  ink,
  eyebrow,
  title,
  teaser,
  count,
  href,
}: {
  ink: string;
  eyebrow: string;
  title: string;
  teaser: string;
  count: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-lg)] px-5 py-4"
      style={{ background: ink }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: `color-mix(in srgb, ${REVERSED} 70%, transparent)` }}>{eyebrow}</p>
          <h2 className="mt-1.5 line-clamp-2 font-serif text-[26px] font-semibold leading-[1.04] tracking-[-0.01em]" style={{ color: REVERSED }}>{title}</h2>
          <p className="mt-2 text-[13px] leading-snug" style={{ color: `color-mix(in srgb, ${REVERSED} 82%, transparent)` }}>{teaser}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <div className="font-mono text-[34px] font-bold leading-none tabular-nums" style={{ color: REVERSED }}>{count}</div>
          <ArrowRight className="mt-3 h-5 w-5" strokeWidth={2.5} style={{ color: `color-mix(in srgb, ${REVERSED} 80%, transparent)` }} aria-hidden />
        </div>
      </div>
    </Link>
  );
}
