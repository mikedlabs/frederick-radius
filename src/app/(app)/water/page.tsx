import type { Metadata } from "next";
import { Waves, Gauge, Activity, MapPin, ExternalLink, AlertTriangle } from "lucide-react";
import { getFrederickWaterSites, type WaterSite } from "@/lib/integrations/usgsWater";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Rivers & streams",
  description:
    "Live USGS gauge readings for Frederick County rivers and streams — gage height and streamflow, updated every 15 minutes.",
};

// Gauges report every ~15 min; the integration revalidates to match.
export const revalidate = 900;

// USGS site names are ALL-CAPS; title-case for display without
// mangling the underlying data.
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Md|Rd|Us|Nr)\b/g, (m) => m.toUpperCase());
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SiteRow({ s }: { s: WaterSite }) {
  // The part of the full name after the river label = the location.
  const where = s.name.length > s.river.length
    ? titleCase(s.name.slice(s.river.length).replace(/^[\s,]+/, ""))
    : "";
  const ago = timeAgo(s.observedAt);
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "var(--app-border)" }}>
      <a
        href={`/map?focus=${s.lat},${s.lng}`}
        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--app-bg-sunken)]"
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-cool) 16%, transparent)" }}
          aria-hidden
        >
          <Waves className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {titleCase(s.river)}
          </span>
          {where && (
            <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              {where}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {s.gageHeightFt != null && (
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3" strokeWidth={2} aria-hidden />
                {s.gageHeightFt.toLocaleString()} ft
              </span>
            )}
            {s.streamflowCfs != null && (
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" strokeWidth={2} aria-hidden />
                {s.streamflowCfs.toLocaleString()} ft³/s
              </span>
            )}
            {ago && <span>{ago}</span>}
          </span>
        </span>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </a>
    </li>
  );
}

export default async function WaterPage() {
  const sites = await getFrederickWaterSites();

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">
          USGS · real-time
        </p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Rivers &amp; streams
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Live gauge readings for Frederick County waterways — current
          gage height and streamflow, refreshed every 15 minutes. Tap a
          gauge to see it on the map.
        </p>
      </header>

      {/* Honest, safety-critical caveat: this is observation, not a
          forecast. Flood watches/warnings are the National Weather
          Service's call — we link out and say so plainly. */}
      <div
        className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-warning)" }} aria-hidden />
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          These are raw real-time observations, not a flood forecast. For
          flood watches and warnings, see the{" "}
          <a
            href="https://www.weather.gov/lwx/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
            style={{ color: "var(--app-cool)" }}
          >
            National Weather Service
          </a>
          . In an emergency, call 911.
        </p>
      </div>

      {sites.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          USGS gauge readings are briefly unavailable. They refresh
          automatically — check back shortly.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-cool)" }}>
              {sites.length}
            </strong>{" "}
            active {sites.length === 1 ? "gauge" : "gauges"} county-wide
          </p>
          <ul
            className="overflow-hidden rounded-[var(--app-radius-lg)] tactile bg-[var(--app-bg-elevated)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            {sites.map((s) => (
              <SiteRow key={s.id} s={s} />
            ))}
          </ul>
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            <a
              href="https://waterdata.usgs.gov/md/nwis/rt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Data: USGS Water Services
              <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
            </a>{" "}
            · refreshed every 15 minutes.
          </p>
        </>
      )}
    </div>
  );
}
