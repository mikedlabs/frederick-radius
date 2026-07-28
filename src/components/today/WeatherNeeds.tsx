import Link from "next/link";
import {
  Phone, Waves, Zap, TrafficCone, Thermometer, ShieldAlert, ArrowRight,
  ExternalLink, Snowflake, Wind, CloudRain, Tornado, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { nwsDisplaySeverity } from "@/components/today/CivicAlerts";
import { prioritizeAlerts } from "@/lib/alert-priority";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";

/**
 * WeatherNeeds — the "what you need" layer that appears ONLY during an active
 * weather warning (storm, snow, flood, heat, cold). The "Heads up" CivicAlerts
 * banner above says WHAT is happening; this says WHAT TO DO: the one calm safety
 * line for the hazard, then a short set of actions that point at the app's own
 * live surfaces (river levels, the live outage/road board, the emergency
 * numbers) and the county's Emergency Management page, where shelters, warming
 * and cooling centers, and closings are posted.
 *
 * Honest by construction: it renders nothing unless the NWS feed has a
 * qualifying (non-routine) weather alert for the area, and every link is a real
 * in-app surface or a verified official page — never a fabricated shelter list.
 */

type Hazard = "flood" | "tornado" | "storm" | "winter" | "heat" | "cold" | "severe";

/** Priority order: the most action-specific hazard wins when several are active
 *  (a Flood Warning's "check the river" beats a generic Severe Weather line). */
const HAZARD_MATCHERS: { hazard: Hazard; re: RegExp }[] = [
  { hazard: "flood",   re: /flood/i },
  { hazard: "tornado", re: /tornado/i },
  { hazard: "winter",  re: /winter|snow|ice|blizzard|sleet|freezing/i },
  { hazard: "storm",   re: /thunderstorm|wind|hurricane|tropical|storm/i },
  { hazard: "heat",    re: /heat/i },
  { hazard: "cold",    re: /cold|freeze|wind chill|frost/i },
];

function classify(events: string[]): Hazard {
  for (const event of events) {
    for (const { hazard, re } of HAZARD_MATCHERS) {
      if (re.test(event)) return hazard;
    }
  }
  return "severe";
}

type Row = { label: string; sub: string; href: string; icon: LucideIcon; external?: boolean; danger?: boolean };

const EM_URL = "https://frederickcountymd.gov/2001/Emergency-Management";

/** The county Emergency Management page — where shelters, warming/cooling
 *  centers, and closings are officially posted. Shared across hazards. */
const emRow: Row = {
  label: "Official updates and closings",
  sub: "Shelters, warming and cooling centers, and government closings",
  href: EM_URL,
  icon: ShieldAlert,
  external: true,
};

const CALL_911: Row = {
  label: "Call 911",
  sub: "A threat to life, or a downed power line",
  href: "tel:911",
  icon: Phone,
  danger: true,
};

const POWER: Row = { label: "Power outages", sub: "The live county outage board", href: "/pulse", icon: Zap };
const ROADS: Row = { label: "Road closures and hazards", sub: "Live traffic and incidents", href: "/pulse", icon: TrafficCone };
const RIVERS: Row = { label: "River and creek levels", sub: "Live gauges around the county", href: "/rivers", icon: Waves };

const HAZARDS: Record<Hazard, { label: string; advice: string; icon: LucideIcon; rows: Row[] }> = {
  flood: {
    label: "Flooding",
    advice: "Move to higher ground, and never drive or walk through flood water. A foot of moving water can carry off a car.",
    icon: CloudRain,
    rows: [CALL_911, RIVERS, ROADS, emRow],
  },
  tornado: {
    label: "Tornado warning",
    advice: "Get to a small interior room on the lowest floor, away from windows, and stay there until the warning ends.",
    icon: Tornado,
    rows: [CALL_911, POWER, emRow],
  },
  storm: {
    label: "Severe storms",
    advice: "Stay indoors and away from windows. Treat any downed power line as live, and call 911 to report it.",
    icon: Wind,
    rows: [CALL_911, POWER, ROADS, emRow],
  },
  winter: {
    label: "Snow and ice",
    advice: "Stay off the roads if you can. Keep a phone charged and check on older neighbors in case the power drops.",
    icon: Snowflake,
    rows: [CALL_911, ROADS, POWER, emRow],
  },
  heat: {
    label: "Extreme heat",
    advice: "Drink water, find air conditioning, and check on older neighbors and anyone without cooling.",
    icon: Thermometer,
    rows: [CALL_911, emRow],
  },
  cold: {
    label: "Dangerous cold",
    advice: "Limit time outside and cover exposed skin. Check on neighbors, and bring pets indoors.",
    icon: Snowflake,
    rows: [CALL_911, POWER, emRow],
  },
  severe: {
    label: "Severe weather",
    advice: "Keep an eye on official updates and hold off on nonessential trips until it passes.",
    icon: Wind,
    rows: [CALL_911, POWER, ROADS, emRow],
  },
};

export default async function WeatherNeeds() {
  let snapshot: Awaited<ReturnType<typeof getCurrentSituationSnapshot>>;
  try {
    snapshot = await getCurrentSituationSnapshot();
  } catch {
    return null; // analytics/feed failure must never break Today
  }
  const weather = snapshot.sources.weather;
  if (
    weather.availability !== "available" ||
    weather.freshness !== "fresh"
  ) {
    return null;
  }
  // Qualifying = a real, non-routine weather warning/advisory (same bar as the
  // Heads-up banner). Info-level and empty feeds render nothing.
  const active = prioritizeAlerts(
    weather.data.filter((alert) => nwsDisplaySeverity(alert) !== "info"),
  );
  if (active.length === 0) return null;

  const hazard = classify(active.map((a) => a.event));
  const h = HAZARDS[hazard];
  const HazardIcon = h.icon;

  return (
    <section
      aria-label={`${h.label}: what you need`}
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      {/* Header — calm, not a second alarm. The banner above is the alarm. */}
      <div className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-warning) 20%, transparent)" }}>
          <HazardIcon className="h-4 w-4" strokeWidth={2.1} style={{ color: "var(--app-warning-press)" }} />
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {h.label}: what you need
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {h.advice}
          </p>
        </div>
      </div>

      <ul className="px-2 pb-2">
        {h.rows.map((r) => {
          const Icon = r.icon;
          const tint = r.danger ? "var(--app-danger)" : "var(--app-ink-2)";
          const inner = (
            <>
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: r.danger ? "color-mix(in srgb, var(--app-danger) 13%, transparent)" : "color-mix(in srgb, var(--app-ink) 7%, transparent)" }}>
                <Icon className="h-4 w-4" strokeWidth={2.1} style={{ color: tint }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: r.danger ? "var(--app-danger)" : "var(--app-ink)" }}>{r.label}</span>
                <span className="mt-0.5 block truncate text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{r.sub}</span>
              </span>
              {r.external
                ? <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                : <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
            </>
          );
          const cls = "flex min-h-[52px] items-center gap-3 rounded-[var(--app-radius-md)] px-2 py-1.5 transition active:scale-[0.99]";
          return (
            <li key={`${r.label}-${r.href}`}>
              {r.external ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
              ) : (
                <Link href={r.href} className={cls}>{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* All the numbers, one tap away. */}
      <Link
        href="/contacts"
        className="flex min-h-11 items-center gap-1.5 border-t px-3.5 py-2.5 text-[12px] font-semibold"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
      >
        All emergency and county numbers
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </Link>
    </section>
  );
}
