import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { getNwsAlerts, type NwsAlert } from "@/lib/integrations/nws-alerts";
import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";

type UnifiedAlert = {
  source: "NWS" | "NPS";
  severity: "info" | "advisory" | "warning" | "emergency";
  title: string;
  body: string;
  area: string;
  url?: string;
};

function normalize(nws: NwsAlert[], nps: NpsAlert[]): UnifiedAlert[] {
  const out: UnifiedAlert[] = [];
  for (const a of nws) {
    const severity =
      a.severity === "Extreme" ? "emergency" :
      a.severity === "Severe" ? "warning" :
      a.severity === "Moderate" ? "advisory" : "info";
    out.push({
      source: "NWS",
      severity,
      title: a.event,
      body: a.headline,
      area: a.area,
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
      body: a.description,
      area: a.parkName,
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

export default async function CivicAlerts() {
  const [nws, nps] = await Promise.all([getNwsAlerts(), getNpsAlerts()]);
  const alerts = normalize(nws, nps);
  if (alerts.length === 0) return null;

  return (
    <ul className="space-y-1.5" aria-label="Active civic alerts">
      {alerts.map((a, i) => {
        const s = STYLES[a.severity];
        const Icon = s.icon;
        return (
          <li key={i}>
            <a
              href={a.url ?? "#"}
              target={a.url ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5 text-[13px] leading-snug shadow-[var(--app-shadow-1)]"
              style={{ background: s.bg, color: s.fg }}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold tracking-tight">
                  {a.title}
                  <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider opacity-80">
                    · {a.source} · {a.area}
                  </span>
                </p>
                <p className="line-clamp-2 opacity-90">{a.body}</p>
              </div>
              <X className="mt-0.5 h-4 w-4 shrink-0 opacity-0" strokeWidth={2} aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
