/**
 * Today Conditions Line — compact current conditions + unusual Pulse signals.
 *
 * One row: current weather, high, sunset.
 * Below: at most 2 chips for unusual items (NWS alert, school closure, power outage,
 * MARC change, road closure). Anything beyond 2 collapses to "+N more" → /pulse.
 *
 * Chip labels are short, lead with source, ~32 chars max:
 * - "NWS: Frost advisory tonight"
 * - "FCPS: 2-hr delay"
 * - "MARC: Brunswick schedule change"
 * - "MD 75 N closed"
 *
 * No chips on a normal day.
 */

import Link from "next/link";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { currentFcpsOperationsNotices } from "@/lib/integrations/fcps";
import { getMarcAlerts } from "@/lib/integrations/marcTrains";
import { getPowerOutages } from "@/lib/integrations/potomac-edison";
import { SIGNIFICANT_POWER_OUTAGE_CUSTOMERS } from "@/lib/pulse/signal-priority";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import { ChevronRight } from "lucide-react";

type PulseChip = {
  id: string;
  label: string;
  severity: number; // Lower = more severe
};

function fmtTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Shorten alert event to ~20 chars for chip. */
function shortAlertLabel(event: string): string {
  const short = event
    .replace(/\b(Warning|Advisory|Watch|Statement)\b/gi, "")
    .trim();
  if (short.length <= 20) return short;
  return `${short.slice(0, 17)}…`;
}

export default async function TodayConditionsLine() {
  const now = new Date();

  // Fetch weather, sun, and pulse signals in parallel
  const [forecast, situation, fcpsNotices, marcAlerts, roadSnapshot] =
    await Promise.all([
      getNwsForecast(FREDERICK_CENTER).catch(() => null),
      getCurrentSituationSnapshot().catch(() => null),
      currentFcpsOperationsNotices().catch(() => []),
      getMarcAlerts().catch(() => ({ alerts: [] })),
      getRoadIntelligenceSnapshot().catch(() => ({ attention: [] })),
    ]);

  // Current weather
  const cur = forecast?.hourly?.[0] ?? null;
  const tempNow = cur?.temperature ?? null;
  const condition = cur?.shortForecast ?? null;
  const high = forecast?.daily?.find((p) => p.isDaytime)?.temperature ?? null;

  // Sunset
  const st = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  const sunset =
    st.sunset && now < st.sunset ? fmtTime(st.sunset) : null;

  // Build pulse chips (severity sorted)
  const chips: PulseChip[] = [];

  // 1. NWS alerts (severity 1)
  if (situation?.sources.weather.availability === "available") {
    const alerts = situation.sources.weather.data ?? [];
    for (const alert of alerts.slice(0, 1)) {
      // Just the top alert
      const label = `NWS: ${shortAlertLabel(alert.event)}`;
      chips.push({ id: `nws-${alert.id}`, label, severity: 1 });
    }
  }

  // 2. School closures/delays (severity 2)
  const schoolNotice = fcpsNotices.find(
    (n) => n.type === "Closed" || n.type === "Delay",
  );
  if (schoolNotice) {
    const label =
      schoolNotice.type === "Closed"
        ? "FCPS: Closed"
        : schoolNotice.detail
          ? `FCPS: ${schoolNotice.detail}`
          : "FCPS: Delay";
    chips.push({ id: "fcps", label: label.slice(0, 32), severity: 2 });
  }

  // 3. Major power outages (severity 3)
  try {
    const outages = await getPowerOutages();
    if (
      outages.totalOut >= SIGNIFICANT_POWER_OUTAGE_CUSTOMERS &&
      outages.available
    ) {
      const label =
        outages.totalOut >= 1000
          ? `Power: ${Math.round(outages.totalOut / 100) / 10}k out`
          : `Power: ${outages.totalOut} out`;
      chips.push({ id: "power", label, severity: 3 });
    }
  } catch {
    // Power feed is optional
  }

  // 4. MARC alerts (severity 4)
  if (marcAlerts.alerts.length > 0) {
    const alert = marcAlerts.alerts[0];
    const label = `MARC: ${alert.headerText || "Schedule change"}`.slice(
      0,
      32,
    );
    chips.push({ id: "marc", label, severity: 4 });
  }

  // 5. Major road closures (severity 5)
  const roadSignal = roadSnapshot?.attention?.[0];
  if (roadSignal && roadSignal.severity === "warning") {
    const label = roadSignal.title.slice(0, 32);
    chips.push({ id: roadSignal.id, label, severity: 5 });
  }

  // Sort by severity, cap at 2
  chips.sort((a, b) => a.severity - b.severity);
  const shown = chips.slice(0, 2);
  const overflow = chips.length - shown.length;

  // Render
  return (
    <section
      aria-label="Current conditions"
      className="space-y-2 border-b pb-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Main conditions row */}
      <div className="flex items-baseline gap-2 text-[14px] leading-snug">
        {tempNow != null && (
          <span
            className="font-sans text-[28px] font-light tabular-nums"
            style={{ color: "var(--app-ink)" }}
          >
            {tempNow}&deg;
          </span>
        )}
        {condition && (
          <span
            className="font-medium"
            style={{ color: "var(--app-ink-2)" }}
          >
            {condition}
          </span>
        )}
        <span className="ml-auto flex gap-2 text-[12.5px] tabular-nums"  style={{ color: "var(--app-ink-3)" }}>
          {high != null && <span>High {high}°</span>}
          {sunset && <span>Sunset {sunset}</span>}
        </span>
      </div>

      {/* Pulse chips (only when unusual) */}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((chip) => (
            <Link
              key={chip.id}
              href="/pulse"
              prefetch={false}
              className="tap-44-y inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-snug transition-colors"
              style={{
                background: "var(--app-bg-sunken)",
                color: "var(--app-ink)",
              }}
            >
              {chip.label}
            </Link>
          ))}
          {overflow > 0 && (
            <Link
              href="/pulse"
              prefetch={false}
              className="tap-44-y inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-snug transition-colors"
              style={{
                background: "var(--app-bg-sunken)",
                color: "var(--app-ink-2)",
              }}
            >
              +{overflow} more
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
