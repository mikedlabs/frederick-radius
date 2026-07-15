import Link from "next/link";
import { ArrowRight, Waves } from "lucide-react";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { classifyFlood, FLOOD_STAGES, type FloodKey } from "@/lib/integrations/floodStage";

const SEVERITY: Record<FloodKey, number> = { normal: 0, action: 1, minor: 2, moderate: 3, major: 4 };

function toTitle(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTime(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

/**
 * CreekWatch — one dated line that appears ONLY when a county river/creek gauge
 * crosses its NWS flood threshold (action stage or above). Silent at normal
 * levels, which is almost always. The brand anchors itself to the Monocacy and
 * Catoctin; the first water to rise is core field-guide signal.
 *
 * Honest by construction: it surfaces the latest real USGS reading + timestamp
 * and classifies it against the gauge's published NWS thresholds (classifyFlood
 * refuses to invent a stage), never a guess. Shows the single most severe gauge.
 * Async server component, streamed in its own Suspense; taps to /rivers.
 */
export default async function CreekWatch() {
  const sites = await getFrederickWaterSites().catch(() => []);

  let worst: { river: string; label: string; tone: string; ft: number; at: string | null; sev: number } | null = null;
  for (const s of sites) {
    const cat = classifyFlood(s.gageHeightFt, FLOOD_STAGES[s.id]);
    if (!cat || cat.key === "normal") continue;
    const sev = SEVERITY[cat.key];
    if (!worst || sev > worst.sev) {
      worst = {
        river: toTitle(s.river),
        label: cat.label,
        tone: cat.tone,
        ft: s.gageHeightFt as number,
        at: fmtTime(s.observedAt),
        sev,
      };
    }
  }
  if (!worst) return null;

  const iconColor = worst.tone === "danger" ? "var(--app-brand)" : "var(--app-warning)";
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      <Waves className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: iconColor }} />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{worst.river}:</span>
      <span>
        {worst.label}, {worst.ft} ft
        {worst.at ? ` as of ${worst.at}` : ""}.
      </span>
      <Link href="/rivers" className="font-semibold whitespace-nowrap" style={{ color: "var(--app-brand-press)" }}>
        River levels <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
      </Link>
    </p>
  );
}
