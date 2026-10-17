import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Shared "go to a list page" control. A trailing arrow on Today means this
 * and only this: open the full list, never a detail card.
 */
export const TODAY_LIST_LINK_CLASS =
  "today-list-link tap-44-y inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-semibold tracking-tight";

export function TodayListArrow({ className = "" }: { className?: string }) {
  return (
    <ArrowRight
      className={`today-list-link__icon h-3.5 w-3.5 ${className}`.trim()}
      strokeWidth={2.1}
      aria-hidden
    />
  );
}

export default function TodayListLink({
  href,
  children,
  ariaLabel,
  className = "",
  iconClassName = "",
}: {
  href: string;
  children?: ReactNode;
  ariaLabel?: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={ariaLabel}
      data-today-list-link=""
      className={`${TODAY_LIST_LINK_CLASS} ${className}`.trim()}
      style={{
        color:
          "var(--app-heading-action, var(--today-section-ink, var(--app-brand-press)))",
      }}
    >
      {children}
      <TodayListArrow className={iconClassName} />
    </Link>
  );
}
