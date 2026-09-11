import type { Metadata } from "next";
import { Droplets, ExternalLink, Clock, MapPin } from "lucide-react";
import { getFrederickWaterSitesWithHistory, readingTrend, type WaterSite } from "@/lib/integrations/usgsWater";
import { classifyFlood, nwsGaugeUrl } from "@/lib/integrations/floodStage";
import PageBloom from "@/components/ui/PageBloom";
import MetricCard from "@/components/live-data/MetricCard";
import FloodGauge from "@/components/live-data/FloodGauge";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

export const metadata: Metadata = {
  alternates: { canonical: "/rivers" },
  title: "Rivers & streams",
  description:
    "Live USGS gauges show the current height, flow, and 24-hour trend for Frederick County waterways.",
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

/** USGS instantaneous values normally land every 15-30 min. A reading older
 *  than this no longer reads as "live" — the status pill drops its trend/Live
 *  label for a neutral "Stale" so a hours- or days-old height never sits under
 *  a confident current-status chip. Missing timestamp → treat as stale (we
 *  can't vouch for currency). The `timeAgo` meta line still shows the exact age. */
const READING_STALE_MS = 2 * 60 * 60 * 1000;
function readingIsStale(iso?: string): boolean {
  if (!iso) return true;
  const age = Date.now() - +new Date(iso);
  return !Number.isFinite(age) || age > READING_STALE_MS;
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
        <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
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
            How high is the water?
          </h1>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {totalGauges > 0
              ? `${totalGauges} live ${totalGauges === 1 ? "gauge" : "gauges"} across Frederick County, with height, flow and 24-hour direction.`
              : "Connecting to the USGS feed…"}
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

      {/* Honesty note — where the flood stages come from + their limits.
          Six county gauges are NWS forecast points (we compare the live
          USGS reading to NWS's own thresholds); the rest show reading +
          trend only. Crest forecasts + official warnings stay with NWS. */}
      <aside
        className="rounded-[var(--app-radius-md)] border px-3 py-2 text-[11.5px] leading-snug sm:px-4 sm:py-3 sm:text-[12px] sm:leading-relaxed"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-2)",
        }}
      >
        <p>
          Flood labels use official NWS thresholds where available. Forecasts,
          watches and warnings always remain with{" "}
          <a
            href="https://water.weather.gov/ahps/region.php?state=md"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            NWS&rsquo;s
          </a>
          .
        </p>
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
        groups.map(({ river, sites: list }, index) => (
          <CollapsibleSection
            key={river}
            title={river}
            count={list.length}
            countLabel={list.length === 1 ? "gauge" : "gauges"}
            headingLevel={2}
            storageKey={`fr.rivers.${river.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            defaultOpen={index === 0}
            className="space-y-3"
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((site) => {
                const dir = readingTrend(site.gageHistory) ?? readingTrend(site.streamflowHistory);
                const flood = classifyFlood(site.gageHeightFt, site.floodStages);
                // The status pill leads with the SAFETY signal: when a gauge is
                // at or above NWS action stage, that flood category IS the pill
                // (warning/danger). Otherwise the 24h trend rides there — on a
                // water page, "rising" is the thing to watch.
                const trendTone =
                  dir === "rising" ? "warning" : dir === "falling" ? "good" : "neutral";
                const trendLabel =
                  dir === "rising" ? "Rising" : dir === "falling" ? "Falling" : dir === "steady" ? "Steady" : "Live";
                // A reading we can't vouch for as current must not wear a
                // confident "Live"/trend chip. Flood category still leads when
                // present (safety-forward); otherwise a stale gauge drops to a
                // neutral "Stale" pill rather than green "Live".
                const stale = readingIsStale(site.observedAt);
                const status: { label: string; tone: "neutral" | "good" | "warning" | "danger" } =
                  flood && flood.key !== "normal"
                    ? { label: flood.label, tone: flood.tone }
                    : stale
                      ? { label: "Stale", tone: "neutral" }
                      : { label: trendLabel, tone: trendTone };

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
                      status={status}
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
                        <div className="space-y-2.5">
                          {/* The range-anchored flood gauge — only for NWS
                              forecast points (others have no thresholds). */}
                          {flood && site.floodStages && site.gageHeightFt != null && (
                            <FloodGauge
                              current={site.gageHeightFt}
                              stages={site.floodStages}
                              category={flood}
                            />
                          )}
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold"
                            style={{ color: "var(--app-cool)" }}
                          >
                            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                            {site.floodStages ? "Open NWS forecast" : "Open USGS gauge"}
                          </span>
                        </div>
                      }
                      href={
                        site.floodStages
                          ? nwsGaugeUrl(site.floodStages.nws)
                          : `https://waterdata.usgs.gov/monitoring-location/${site.id}/`
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </CollapsibleSection>
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
          Live readings from the U.S. Geological Survey (
          <a
            href="https://waterservices.usgs.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            waterservices.usgs.gov
          </a>
          ); flood thresholds from the National Weather Service. Refreshed
          every 15 minutes.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href="https://water.weather.gov/ahps/region.php?state=md"
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center gap-1 underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            <Droplets className="h-3 w-3" strokeWidth={2} aria-hidden />
            NWS Flood Outlook · Maryland
          </a>
          <a
            href={`https://www.google.com/maps/search/USGS+gauge+Frederick+County+MD`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center gap-1 underline-offset-2 hover:underline"
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
