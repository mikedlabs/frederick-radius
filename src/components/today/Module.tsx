import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Module({
  title,
  href,
  cta = "See all",
  children,
  meta,
}: {
  title: string;
  href?: string;
  cta?: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium tracking-tight"
            style={{ color: "var(--app-brand)" }}
          >
            {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        )}
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
