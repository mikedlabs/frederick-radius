import { AlertTriangle, Info, AlertCircle, Clock } from "lucide-react";
import { getNwsAlerts, type NwsAlert } from "@/lib/integrations/nws-alerts";
import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";

type UnifiedAlert = {
  source: "NWS" | "NPS";
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
  // Heads up is a HIGH-SIGNAL interruption layer, not a feed: drop "info"
  // (low-confidence/routine) so it never cries wolf. Sort worst-first.
  return out
    .filter((a) => a.severity !== "info")
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

const STYLES = {
  emergency: { bg: "var(--app-danger)", icon: AlertCircle, fg: "#fff" },
  warning:   { bg: "var(--app-warning)", icon: AlertTriangle, fg: "#fff" },
  advisory:  { bg: "var(--app-warning)", icon: AlertTriangle, fg: "#fff" },
  info:      { bg: "var(--app-info)", icon: Info, fg: "#fff" },
} as const;

/**
 * CivicAlerts — the "Heads up" interruption layer at the top of Today:
 * "Before you make a plan, is there anything you need to know?"
 *
 * STRICT by design (the "safety vest, not a banner ad" rule):
 *   - Only real, sourced, time-bound alerts (NWS weather + NPS park),
 *     high-signal only (advisory/warning/emergency — never routine "info").
 *   - Self-hides entirely when nothing is active.
 *   - Shows ONE alert (worst-first); any others collapse to a quiet
 *     "+N more →" link to /pulse (the full live civic board), so this
 *     never becomes a stacked banner wall.
 *   - Every alert carries source (NWS/NPS), an expiry tail ("Until 8 PM"
 *     = time-bound), and a local scope chip.
 * Other alert types (parking, road closures, transit) plug in here the
 * moment a real feed exists — absent until then, never faked.
 */
export default async function CivicAlerts() {
  const [nws, nps] = await Promise.all([getNwsAlerts(), getNpsAlerts()]);
  const alerts = normalize(nws, nps);
  if (alerts.length === 0) return null;

  const top = alerts[0];
  const more = alerts.length - 1;
  const s = STYLES[top.severity];
  const Icon = s.icon;
  const TailIcon = top.tail.startsWith("Until") ? Clock : null;

  return (
    <section className="space-y-1.5" aria-label="Heads up">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        Heads up
      </p>
      <a
        href={top.url ?? "#"}
        target={top.url ? "_blank" : undefined}
        rel="noopener noreferrer"
        className="block rounded-[var(--app-radius-md)] px-3 py-2.5 shadow-[var(--app-shadow-1)] transition active:scale-[0.985]"
        style={{ background: s.bg, color: s.fg }}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">{top.title}</p>
          <span className="shrink-0 rounded-full bg-white/22 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
            {top.source}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] opacity-90">
          {TailIcon && <TailIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{top.tail}</span>
          {top.scope && (
            <span className="shrink-0 rounded-full bg-white/16 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur">
              {top.scope}
            </span>
          )}
        </div>
      </a>
      {more > 0 && (
        <a href="/alerts" className="block px-1 text-[11px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
          +{more} more active {more === 1 ? "alert" : "alerts"} →
        </a>
      )}
    </section>
  );
}
