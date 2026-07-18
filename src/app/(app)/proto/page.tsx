import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Design prototypes" };

const PROTOS = [
  { href: "/proto/today", title: "Today, color-blocked (real data)", blurb: "Direction #2 on the live today data: deals, happy hour, tonight, overhead. What the front door could be." },
  { href: "/proto/week", title: "Peelable field-folder week", blurb: "Days as colored folders you pull open to reveal what's on. The Peek interaction in our material." },
  { href: "/proto/bigtype", title: "Big type + color blocks", blurb: "Type-as-hierarchy. Giant masthead + bold filing-ink section blocks." },
  { href: "/proto/folders", title: "Tabbed manila folders", blurb: "This prototype uses file-folder tabs and a numbered field-guide table of contents." },
  { href: "/proto/almanac", title: "The Almanac (live conditions)", blurb: "One calm screen revealing the county's living state: sky, light, moon, weather, water, air, rail, and the season's own calendar. Many data points already wired, one composition." },
  { href: "/proto/time-lens", title: "The Time Lens (day scrubber)", blurb: "Drag through the day; the sky, golden hour, and what's on all re-reveal for that hour. The temporal reveal over real sun math + today's unified events." },
];

export default function ProtoIndex() {
  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-press)" }}>Prototypes · not live</p>
        <h1 className="mt-0.5 font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Thinking differently</h1>
        <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>These prototypes explore the app as a tactile field guide instead of a scroll of cards.</p>
      </header>
      <ul className="space-y-2.5">
        {PROTOS.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge), var(--app-hi)" }}>
              <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{p.title}</h2>
              <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{p.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
