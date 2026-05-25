import type { Metadata } from "next";
import Link from "next/link";
import { BEVERAGE_TRAIL, trailByKind, type TrailStop } from "@/data/beverage-trail";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { ExternalLink, MapPin, Wine, Beer, Sparkles, Apple } from "lucide-react";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Frederick Beverage Trail",
  description: "26 wineries, breweries, distilleries, cideries, and meaderies across Frederick County, MD — Maryland's craft beverage capital.",
  openGraph: {
    title: "The Frederick Beverage Trail",
    description: "Maryland's leading craft beverage region — wineries, breweries, distilleries, cideries and meaderies across Frederick County.",
    images: [{ url: "/api/og?type=category&slug=brewery", width: 1200, height: 630 }],
  },
};

const KINDS: { kind: TrailStop["kind"]; label: string; icon: typeof Wine; color: string }[] = [
  { kind: "winery", label: "Wineries", icon: Wine, color: "#7E2C6F" },
  { kind: "brewery", label: "Breweries", icon: Beer, color: "#D9A441" },
  { kind: "distillery", label: "Distilleries", icon: Sparkles, color: "#C4451C" },
  { kind: "cidery", label: "Cideries", icon: Apple, color: "#1E6B3A" },
  { kind: "meadery", label: "Meaderies", icon: Wine, color: "#B26B00" },
];

export default function TrailPage() {
  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {BEVERAGE_TRAIL.length} stops · picked by hand · awaiting Google-Places verification
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          The Frederick Beverage Trail
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Frederick County is Maryland&apos;s undisputed craft-beverage capital — wineries on the Linganore
          ridge, breweries downtown, distilleries on Carroll Creek, ciders made from heirloom apples,
          honey wines from local hives. Pick a kind, plot a route.
        </p>
        <div
          className="inline-flex items-start gap-2 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12px] leading-snug"
          style={{ borderColor: "var(--app-warning)", background: `${"#B26B00"}10`, color: "var(--app-warning)" }}
          role="status"
        >
          <span aria-hidden>⚠</span>
          <span>
            Operational status not yet verified. Always call ahead or check the venue&apos;s website
            before driving out. These entries flip to verified the moment{" "}
            <code className="rounded bg-white/40 px-1">GOOGLE_PLACES_API_KEY</code> is configured.
          </span>
        </div>
      </header>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          By kind
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {KINDS.map(({ kind, label, icon: Icon, color }) => {
            const n = trailByKind(kind).length;
            if (n === 0) return null;
            return (
              <a
                key={kind}
                href={`#${kind}`}
                className="flex flex-col items-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-center transition hover:bg-[var(--app-bg-sunken)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} style={{ color }} aria-hidden />
                <span className="text-xs font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span>
                <span className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>{n}</span>
              </a>
            );
          })}
        </div>
      </section>

      {KINDS.map(({ kind, label, icon: Icon, color }) => {
        const stops = trailByKind(kind);
        if (stops.length === 0) return null;
        return (
          <section key={kind} id={kind} className="space-y-3">
            <header className="flex items-baseline gap-2">
              <Icon className="h-4 w-4 self-center" strokeWidth={1.75} style={{ color }} aria-hidden />
              <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {label}
              </h2>
              <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{stops.length}</span>
            </header>
            <ul className="space-y-2">
              {stops.map((s) => (
                <li key={s.slug}>
                  <Stop stop={s} accent={color} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <footer className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-4 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        Trails are drawn from our directory by hand. Spot a closure or a missing stop? <a href="/submit/place" style={{ color: "var(--app-cool)" }} className="underline">Send us the fix</a>.
      </footer>
    </div>
  );
}

function Stop({ stop, accent }: { stop: TrailStop; accent: string }) {
  const muni = MUNICIPALITY_BY_SLUG[stop.municipality];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.geom.lat},${stop.geom.lng}`;
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--app-radius-md)]"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <span className="text-lg font-serif font-semibold">{stop.name.charAt(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {stop.name}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
            <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
            {stop.address} · <Link href={`/m/${stop.municipality}`} className="hover:underline">{muni?.name ?? stop.municipality}</Link>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {stop.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stop.website && (
              <a href={stop.website} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--app-cool)" }}>
                Website <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--app-cool)" }}>
              Directions <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
