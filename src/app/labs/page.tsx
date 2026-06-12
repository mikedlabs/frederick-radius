import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Labs",
  robots: { index: false, follow: false },
};

/**
 * The labs index. Each direction is a live prototype route, judged by feel
 * on a phone (the directive's rule: no static mocks). Directions B and C
 * land here as they are built.
 */
const DIRECTIONS = [
  { slug: "a", name: "Field Guide, Executed", note: "The existing identity, taken seriously.", ready: true },
  { slug: "b", name: "The Living Atlas", note: "The map as the brand. Daylight and evening.", ready: false },
  { slug: "c", name: "Clustered Spires", note: "Derived from the Frederick skyline.", ready: false },
];

export default function LabsIndex() {
  return (
    <main style={{ background: "#15110c", color: "#f3ece0", minHeight: "100dvh", fontFamily: "var(--font-sans-base, system-ui)" }}>
      <div className="mx-auto max-w-[440px] px-6 py-16">
        <p style={{ fontFamily: "var(--font-mono-base, monospace)", fontSize: 12, letterSpacing: "0.2em", opacity: 0.6 }}>
          FREDERICK RADIUS / DESIGN LABS
        </p>
        <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: 40, lineHeight: 1.05, marginTop: 16 }}>
          Three directions, live.
        </h1>
        <p style={{ fontSize: 15, opacity: 0.7, marginTop: 12, lineHeight: 1.5 }}>
          Each is a working prototype on real data. Open one on your phone and
          judge it by feel.
        </p>
        <div style={{ marginTop: 40 }}>
          {DIRECTIONS.map((d) => (
            <div key={d.slug} style={{ borderTop: "1px solid rgba(243,236,224,0.16)", padding: "20px 0" }}>
              {d.ready ? (
                <Link href={`/labs/${d.slug}`} style={{ display: "block" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-display, serif)", fontSize: 24 }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--font-mono-base, monospace)", fontSize: 12, color: "#e8a33d" }}>OPEN →</span>
                  </div>
                  <p style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>{d.note}</p>
                </Link>
              ) : (
                <div style={{ opacity: 0.4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-display, serif)", fontSize: 24 }}>{d.name}</span>
                    <span style={{ fontFamily: "var(--font-mono-base, monospace)", fontSize: 12 }}>SOON</span>
                  </div>
                  <p style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{d.note}</p>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(243,236,224,0.16)" }} />
        </div>
      </div>
    </main>
  );
}
