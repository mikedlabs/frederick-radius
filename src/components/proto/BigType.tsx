import { ArrowRight } from "lucide-react";

const REVERSED = "var(--app-ink-inverse)";

/**
 * PROTOTYPE: type-as-hierarchy + color-as-structure. A confident front door —
 * a big almanac masthead, then each section as a bold filing-ink color block
 * with a giant serif title, a one-line teaser, and a big mono count. No new
 * interaction; the leap is scale + color blocking.
 */
const BLOCKS = [
  { ink: "var(--app-brand-2)", eyebrow: "Tonight", title: "Alive @ Five", teaser: "Carroll Creek · 5 PM, plus 2 more on", n: "3" },
  { ink: "var(--app-brand-press)", eyebrow: "Today's deals", title: "½ price wine bottles", teaser: "Hootch & Banter · 5 more verified specials", n: "6" },
  { ink: "var(--app-cool)", eyebrow: "Overhead", title: "8 planes in range", teaser: "A 767 inbound, low over the county", n: "8" },
  { ink: "var(--app-accent)", eyebrow: "Happy hour", title: "$8 Old Fashioneds", teaser: "Tenth Ward Distilling · 4 to 7 PM", n: "4" },
];

export default function BigType() {
  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>Wednesday · June 17</p>
        <h1 className="mt-1 font-serif text-[46px] font-semibold leading-[0.92] tracking-[-0.03em]" style={{ color: "var(--app-ink)" }}>Tonight in Frederick</h1>
        <p className="mt-2.5 text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>Warm and clear, golden hour at 8:24. Here&rsquo;s what&rsquo;s worth it.</p>
      </header>
      <div className="space-y-2.5">
        {BLOCKS.map((b, i) => (
          <div key={i} className="tactile-interactive relative overflow-hidden rounded-[var(--app-radius-lg)] px-5 py-4" style={{ background: b.ink }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: `color-mix(in srgb, ${REVERSED} 70%, transparent)` }}>{b.eyebrow}</p>
                <h2 className="mt-1.5 font-serif text-[27px] font-semibold leading-[1.0] tracking-[-0.01em]" style={{ color: REVERSED }}>{b.title}</h2>
                <p className="mt-2 text-[13px] leading-snug" style={{ color: `color-mix(in srgb, ${REVERSED} 82%, transparent)` }}>{b.teaser}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <div className="font-mono text-[36px] font-bold leading-none tabular-nums" style={{ color: REVERSED }}>{b.n}</div>
                <ArrowRight className="mt-3 h-5 w-5" strokeWidth={2.5} style={{ color: `color-mix(in srgb, ${REVERSED} 80%, transparent)` }} aria-hidden />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
