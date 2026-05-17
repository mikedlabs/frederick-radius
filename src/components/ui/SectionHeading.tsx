import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * SectionHeading — the one strong category header, reused by Shelf and
 * the Radius results grid (and available to any future surface). A
 * brand tick + serif title + a quiet count, optional trailing action.
 * Extracting it keeps the editorial voice identical everywhere and is
 * the first shared primitive of the result-presentation system.
 */
export default function SectionHeading({
  title,
  count,
  href,
  cta = "See all",
  trailing,
}: {
  title: string;
  count?: number;
  href?: string;
  cta?: string;
  /** Optional control rendered on the right (e.g. a density toggle). */
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <h2
        className="flex items-center gap-2 font-serif text-[22px] font-semibold leading-none tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        <span
          aria-hidden
          className="inline-block h-4 w-1 rounded-full"
          style={{ background: "var(--app-brand)" }}
        />
        {title}
        {count !== undefined && (
          <span
            className="text-base font-normal tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {count}
          </span>
        )}
      </h2>
      {trailing ??
        (href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-xs font-semibold tracking-tight"
            style={{ color: "var(--app-brand)" }}
          >
            {cta}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        ))}
    </header>
  );
}
