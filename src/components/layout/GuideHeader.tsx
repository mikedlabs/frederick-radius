import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** A fixed section link names its destination. The shell owns history Back. */
export default function GuideHeader({ title, parent, href, detail, children }: {
  title: string;
  parent: string;
  href: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="min-w-0">
      <nav aria-label="Breadcrumb">
        <Link href={href} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--app-radius-md)] px-2 text-[13px] font-semibold text-[var(--app-ink-2)] hover:underline">
          <ChevronLeft size={15} aria-hidden /> {parent}
        </Link>
      </nav>
      <h1 className="break-words font-sans text-3xl font-bold leading-tight tracking-tight text-[var(--app-ink)] sm:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-[var(--app-ink-2)]">{children}</p>}
      {detail && <p className="mt-2 text-[13px] leading-snug tabular-nums text-[var(--app-ink-3)]">{detail}</p>}
    </header>
  );
}
