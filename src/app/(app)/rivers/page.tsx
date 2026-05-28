import type { Metadata } from "next";
import { Waves, Droplets, ExternalLink, Clock, MapPin } from "lucide-react";
import { getFrederickWaterSitesWithHistory, type WaterSite } from "@/lib/integrations/usgsWater";
import PageBloom from "@/components/ui/PageBloom";
import MetricCard from "@/components/live-data/MetricCard";

export const metadata: Metadata = {
  title: "Rivers & streams",
  description:
    "Live USGS gauges for the Monocacy, Catoctin Creek, Linganore, and the Potomac in Frederick County. Current height, flow, and 24-hour trend.",
  // Orphan-by-design until linked into nav. /pulse links here once
  // this lands so it's not invisible.
  robots: { index: true, follow: true },
};

// Gauges report every ~15 min; match that cadence so the page never
// shows older data than the user could get from USGS direct.
export const revalidate = 900;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Nr|Ab|Bl|At|Md)\b/gi, (m) => m.toUpperCase())
    .replace(/\bOf\b/g, "of");
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Pull the short location label out of the USGS site name:
 *  "MONOCACY RIVER AT JUG BRIDGE NEAR FREDERICK, MD" → "At Jug Bridge near Frederick". */
function locationOf(name: string): string {
  const m = name.match(/\s+(NEAR|AT|ABOVE|BELOW|NR|BL|AB)\s+(.+?)(?:,\s*MD)?$/i);
  if (!m) return "";
  const prefix = m[1].toLowerCase();
  const where = titleCase(m[2].trim());
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${where}`;
}

function nowClock(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

/** Group sites under the same waterway so the page reads as
 *  "Monocacy River (4 gauges)" instead of an unstructured grid. */
function groupByRiver(sites: WaterSite[]): Array<{ river: string; sites: WaterSite[] }> {
  const m = new Map<string, WaterSite[]>();
  for (const s of sites) {
    const key = s.river.toUpperCase();
    const bucket = m.get(key);
    if (bucket) bucket.push(s);
    else m.set(key, [s]);
  }
  return [...m.entries()]
    .map(([river, list]) => ({
      river: titleCase(river),
      sites: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.sites.length - a.sites.length);
}

/** Trend direction over the last 4 readings vs the previous 4 — a
 *  cheap "rising / falling / steady" indicator without needing a
 *  statistical model. Returns null when there's not enough data. */
function trendDirection(history?: Array<{ value: number; at: string }>): "rising" | "falling" | "steady" | null {
  if (!history || history.length < 8) return null;
  const recent = history.slice(-4).reduce((a, b) => a + b.value, 0) / 4;
  const prior = history.slice(-8, -4).reduce((a, b) => a + b.value, 0) / 4;
  const delta = recent - prior;
  // Threshold = 1% of recent value, or 0.05 if recent is tiny.
  const tol = Math.max(Math.abs(recent) * 0.01, 0.05);
  if (delta > tol) return "rising";
  if (delta < -tol) return "falling";
  return "steady";
}

export default async function RiversPage() {
  const sites = await getFrederickWaterSitesWithHistory("P1D");
  const groups = groupByRiver(sites);
  const totalGauges = sites.length;
  const lastObserved = sites
    .map((s) => s.observedAt ? +new Date(s.observedAt) : 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <div className="relative space-y-6 pb-4">
      <PageBloom variant="cool" />

      {/* Hero — county-wide overview. The verb in the headline is the
          read. */}
      <header
        className="relative -mx-4 overflow-hidden border-b sm:mx-0 sm:rounded-[var(--app-radius-lg)] sm:border"
        style={{
          borderColor: "var(--app-border)",
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 70%)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "var(--app-cool)" }}
        />
        <div className="space-y-2.5 px-4 py-5 sm:px-5">
          <p
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <span
              aria-hidden
              className="pulse-dot inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--app-cool)" }}
            />
            Live · USGS · Frederick County
          </p>
          <h1
            className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {totalGauges > 0
              ? `${totalGauges} ${totalGauges === 1 ? "gauge" : "gauges"} reporting across the county`
              : "Connecting to the USGS feed…"}
          </h1>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            Real-time creek and river height (feet) and streamflow (cubic
            feet per second). Each gauge reports every 15 minutes.
          </p>
          <p
            className="flex items-center gap-1.5 pt-0.5 text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
            Refreshed {nowClock()}
            {lastObserved > 0 && (
              <> · most recent reading {timeAgo(new Date(lastObserved).toISOString())}</>
            )}
          </p>
        </div>
      </header>

      {/* Honesty note — what this dashboard does NOT do. USGS-only
          readings; no flood stage / status (that's NWS AHPS work). */}
      <aside
        className="rounded-[var(--app-radius-md)] border px-4 py-3 text-[12px] leading-relaxed"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-2)",
        }}
      >
        <strong className="font-semibold" style={{ color: "var(--app-ink)" }}>
          Just the numbers.
        </strong>{" "}
        We show the USGS reading and its 24-hour trend. We don&rsquo;t
        compute flood stages — those need per-site NWS thresholds, and
        making them up would be unsafe.{" "}
        <a
          href="https://water.weather.gov/ahps/region.php?state=md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-cool)" }}
        >
          NWS flood forecasts for Maryland
        </a>{" "}
        carry the official watch / warning calls.
      </aside>

      {sites.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The USGS feed is briefly unavailable. It auto-refreshes every
          15 minutes.
        </p>
      ) : (
        groups.map(({ river, sites: list }) => (
          <section key={river} className="space-y-3">
            <header className="flex items-baseline gap-2 px-1">
              <Waves className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
              <h2
                className="font-serif text-[20px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {river}
              </h2>
              <span
                className="text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {list.length} {list.length === 1 ? "gauge" : "gauges"}
              </span>
            </header>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((site) => {
                const dir = trendDirection(site.gageHistory) ?? trendDirection(site.streamflowHistory);
                // Tone the status pill — "rising" reads as warning on
                // a water page; falling = good; steady = neutral.
                const tone =
                  dir === "rising" ? "warning" : dir === "falling" ? "good" : "neutral";
                const statusLabel =
                  dir === "rising" ? "Rising" : dir === "falling" ? "Falling" : dir === "steady" ? "Steady" : "Live";

                // Headline reading: prefer gage height (most intuitive),
                // fall back to streamflow if a gauge only reports flow.
                const hasHeight = site.gageHeightFt != null;
                const value = hasHeight
                  ? site.gageHeightFt!.toFixed(2)
                  : (site.streamflowCfs ?? 0).toLocaleString();
                const unit = hasHeight ? "ft" : "ft³/s";
                const trend = hasHeight
                  ? site.gageHistory?.map((r) => r.value)
                  : site.streamflowHistory?.map((r) => r.value);
                // Secondary stat: whichever reading isn't headlining.
                const secondary = hasHeight && site.streamflowCfs != null
                  ? `Streamflow ${site.streamflowCfs.toLocaleString()} ft³/s`
                  : !hasHeight && site.gageHeightFt != null
                    ? `Gage height ${site.gageHeightFt.toFixed(2)} ft`
                    : null;

                return (
                  <li key={site.id}>
                    <MetricCard
                      eyebrow={titleCase(site.river)}
                      title={locationOf(site.name) || titleCase(site.name)}
                      subtitle={
                        site.municipality
                          ? `${titleCase(site.municipality.replace(/-/g, " "))} · USGS ${site.id}`
                          : `USGS ${site.id}`
                      }
                      value={value}
                      unit={unit}
                      trend={trend}
                      accent="var(--app-cool)"
                      trendStroke="var(--app-cool)"
                      status={{ label: statusLabel, tone }}
                      meta={
                        <>
                          <Clock className="mr-1 inline h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                          {timeAgo(site.observedAt)}
                          {secondary && (
                            <>
                              <span className="mx-1.5 opacity-50">·</span>
                              {secondary}
                            </>
                          )}
                        </>
                      }
                      footer={
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold"
                          style={{ color: "var(--app-cool)" }}
                        >
                          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                          Open USGS gauge
                        </span>
                      }
                      href={`https://waterdata.usgs.gov/monitoring-location/${site.id}/`}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {/* Footer attribution + secondary external links. */}
      <footer
        className="space-y-2 rounded-[var(--app-radius-md)] border p-4 text-[11px]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-3)",
        }}
      >
        <p className="leading-relaxed">
          Source: U.S. Geological Survey Instantaneous Values service (
          <a
            href="https://waterservices.usgs.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            waterservices.usgs.gov
          </a>
          ). County code 24021, parameters 00065 (gage height) + 00060
          (streamflow). Refreshed every 15 minutes.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href="https://water.weather.gov/ahps/region.php?state=md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            <Droplets className="h-3 w-3" strokeWidth={2} aria-hidden />
            NWS Flood Outlook · Maryland
          </a>
          <a
            href={`https://www.google.com/maps/search/USGS+gauge+Frederick+County+MD`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
            Gauge map
          </a>
        </p>
      </footer>
    </div>
  );
}
