import { AlertTriangle, Info, AlertCircle, Clock } from "lucide-react";
import { getNwsAlerts, type NwsAlert } from "@/lib/integrations/nws-alerts";
import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";
import { getAirQuality, pickWorstAqi } from "@/lib/integrations/airnow";
import { FREDERICK_CENTER } from "@/lib/geo";

type UnifiedAlert = {
  source: "NWS" | "NPS" | "EPA";
  severity: "info" | "advisory" | "warning" | "emergency";
  title: string;
  /** Short one-line tail under the title (e.g. "Until 8:00 PM" or
   *  the first sentence of the description). Never a wall of text. */
  tail: string;
  /** Affected-area summary as a short chip ("Frederick + 23 counties").
   *  Replaces the old raw `areaDesc` semicolon dump. */
  scope: string;
  url?: string;
};

/** Pull "Until 8:00 PM" out of an ISO expiry. The single most
 *  useful bit of info on a weather alert — "is it over yet?". */
function untilLabel(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(t);
  const sameDay =
    new Date().toDateString() === t.toDateString();
  return sameDay ? `Until ${time}` : `Until ${time} ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(t)}`;
}

/** Take the raw NWS `areaDesc` (a giant semicolon list of counties)
 *  and turn it into "Frederick + 23 counties" — the right level of
 *  detail for a tile-sized card. Frederick always leads if present. */
function summarizeArea(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const fredIdx = parts.findIndex((p) => /Frederick/i.test(p));
  const lead = fredIdx >= 0 ? "Frederick County" : parts[0].replace(/, [A-Z]{2}$/, "");
  const rest = parts.length - 1;
  return `${lead} + ${rest} ${rest === 1 ? "area" : "areas"}`;
}

/** Pull the first sentence (or first 120 chars) out of a long NWS
 *  description so the card never overflows. */
function firstSentence(body: string): string {
  if (!body) return "";
  const s = body.replace(/\s+/g, " ").trim();
  const m = s.match(/^[^.!?]{20,160}[.!?]/);
  return (m?.[0] ?? s.slice(0, 140)).trim();
}

function normalize(nws: NwsAlert[], nps: NpsAlert[]): UnifiedAlert[] {
  const out: UnifiedAlert[] = [];
  for (const a of nws) {
    const severity =
      a.severity === "Extreme" ? "emergency" :
      a.severity === "Severe" ? "warning" :
      a.severity === "Moderate" ? "advisory" : "info";
    // WeatherHero's inline alert chip was removed — the top
    // CivicAlerts banner is now the single source of truth for the
    // alert. Show every active NWS alert here with the full title +
    // "Until 8 PM" tail + scope chip.
    const until = untilLabel(a.ends_at);
    out.push({
      source: "NWS",
      severity,
      title: a.event,
      tail: until || firstSentence(a.headline || a.description),
      scope: summarizeArea(a.area),
      url: a.url,
    });
  }
  for (const a of nps) {
    const severity =
      a.category === "Danger" ? "emergency" :
      a.category === "Park Closure" ? "warning" :
      a.category === "Caution" ? "advisory" : "info";
    out.push({
      source: "NPS",
      severity,
      title: a.title,
      tail: firstSentence(a.description),
      scope: a.parkName,
      url: a.url,
    });
  }
  const order = { emergency: 0, warning: 1, advisory: 2, info: 3 } as const;
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out.slice(0, 4);
}

const STYLES = {
  emergency: { bg: "var(--app-danger)", icon: AlertCircle, fg: "#fff" },
  warning:   { bg: "var(--app-warning)", icon: AlertTriangle, fg: "#fff" },
  advisory:  { bg: "var(--app-warning)", icon: AlertTriangle, fg: "#fff" },
  info:      { bg: "var(--app-info)", icon: Info, fg: "#fff" },
} as const;

/**
 * CivicAlerts — the topmost card on Today when something is active.
 *
 * Layout: one-line bold title, a short tail (preferring "Until 8 PM"
 * over the description dump), and a single scope chip ("Frederick +
 * 23 areas"). The previous version inlined NWS's raw `areaDesc` which
 * is a semicolon-separated wall of every affected county — making the
 * card balloon to half the viewport. This is the fix.
 */
export default async function CivicAlerts() {
  const aqiObs = await getAirQuality(FREDERICK_CENTER).catch(() => null);
  const worstAqi = aqiObs ? pickWorstAqi(aqiObs) : null;

  const [nws, nps] = await Promise.all([getNwsAlerts(), getNpsAlerts()]);
  const alerts = normalize(nws, nps);
  
  if (worstAqi && worstAqi.category.id >= 3) {
    alerts.unshift({
      source: "EPA",
      severity: worstAqi.category.id >= 4 ? "warning" : "advisory",
      title: `Air Quality: ${worstAqi.category.name}`,
      tail: `AQI is ${worstAqi.aqi}. Limit prolonged outdoor exertion.`,
      scope: "Frederick Area",
      url: "https://www.airnow.gov/"
    });
  }
  if (alerts.length === 0) return null;

  return (
    <ul className="space-y-1.5" aria-label="Active civic alerts">
      {alerts.map((a, i) => {
        const s = STYLES[a.severity];
        const Icon = s.icon;
        const isClock = a.tail.startsWith("Until");
        const TailIcon = isClock ? Clock : null;
        return (
          <li key={i}>
            <a
              href={a.url ?? "#"}
              target={a.url ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="block rounded-[var(--app-radius-md)] px-3 py-2.5 shadow-[var(--app-shadow-1)] transition active:scale-[0.985]"
              style={{ background: s.bg, color: s.fg }}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
                  {a.title}
                </p>
                <span className="shrink-0 rounded-full bg-white/22 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur">
                  {a.source}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] opacity-90">
                {TailIcon && <TailIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{a.tail}</span>
                {a.scope && (
                  <span className="shrink-0 rounded-full bg-white/16 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur">
                    {a.scope}
                  </span>
                )}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
