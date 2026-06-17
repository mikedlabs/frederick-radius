import Link from "next/link";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/proto/today", label: "Today (real data)" },
  { href: "/proto/week", label: "Peelable week" },
  { href: "/proto/bigtype", label: "Big type" },
  { href: "/proto/folders", label: "Folder tabs" },
];

/** Shared header + switcher for the throwaway /proto/* design prototypes. */
export default function ProtoFrame({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-press)" }}>Prototype · not live</p>
        <h1 className="mt-0.5 font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{title}</h1>
        <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{blurb}</p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div aria-hidden className="h-px" style={{ background: "var(--app-border)" }} />
      <div className="pt-1">{children}</div>
    </div>
  );
}
