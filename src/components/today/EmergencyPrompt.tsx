import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";

/**
 * EmergencyPrompt — a calm "good to have" door to /emergency on /today.
 *
 * Beta-tester safety request (Jul 2026): a reviewer asked for an
 * emergency-services entry "available for out of towners." The full page
 * lives at /emergency; this is its quiet home on the surface a first-time
 * visitor actually lands on. Deliberately not a red alarm block — a
 * standing utility you notice before you need it, not one that shouts.
 */
export default function EmergencyPrompt() {
  return (
    <Link
      href="/emergency"
      className="tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-md)] border p-3.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--app-brand-tint-14)", color: "var(--app-brand-press)" }}
        aria-hidden
      >
        <Activity className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          Emergency &amp; urgent care
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          911, the ER, urgent care, and the poison and crisis lines. Good to
          know before you need it.
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-70"
        strokeWidth={2.25}
        aria-hidden
      />
    </Link>
  );
}
