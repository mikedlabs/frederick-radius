import { Activity, AlertTriangle, Zap, Bus, Construction, School, ChevronRight, Siren } from "lucide-react";
import Link from "next/link";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getPulsePointIncidents } from "@/lib/integrations/pulsepoint";

export default async function LivePulse() {
  const [incidents, outages, fcps, fixit, safety] = await Promise.all([
    getChartIncidentsFrederick(),
    getFrederickOutages(),
    getFcpsAlerts(),
    getFixItIssues(5),
    getPulsePointIncidents(),
  ]);

  const items: Array<{
    icon: typeof Activity;
    color: string;
    label: string;
    value: string;
    href?: string;
    detail?: string;
  }> = [];

  // Active fire / rescue (PulsePoint scanner) — most immediately relevant
  if (safety.length > 0) {
    const top = safety[0];
    items.push({
      icon: Siren,
      color: "var(--app-danger)",
      label: `${safety.length} active fire/rescue call${safety.length === 1 ? "" : "s"}`,
      value: `${top.type} · ${top.address}`,
      detail: "PulsePoint · live dispatch",
      href: "/pulse?open=safety",
    });
  }

  // Schools — most urgent if there's a closure/delay
  const closure = fcps.find((a) => a.status === "closed" || a.status === "delayed" || a.status === "early_dismissal");
  if (closure) {
    items.push({
      icon: School,
      color: closure.status === "closed" ? "var(--app-danger)" : "var(--app-warning)",
      label: closure.status === "closed" ? "FCPS closed" : closure.status === "delayed" ? "FCPS delayed" : "FCPS early dismissal",
      value: closure.title.slice(0, 60),
      detail: "Frederick County Public Schools · via FCPS RSS",
      href: "/pulse?open=schools",
    });
  }

  // Power outages
  if (outages.total_out > 25) {
    const muni = outages.munis[0];
    items.push({
      icon: Zap,
      color: outages.total_out > 500 ? "var(--app-danger)" : "var(--app-warning)",
      label: `${outages.total_out.toLocaleString()} without power`,
      value: muni ? `${muni.area} hardest hit (${muni.customers_out.toLocaleString()})` : "Across the county",
      detail: "FirstEnergy / Potomac Edison · updated every 15 min",
      href: "/pulse?open=power",
    });
  }

  // Traffic — show the worst incident
  const severeIncidents = incidents.filter((i) => i.severity === "High");
  if (severeIncidents.length > 0) {
    const i = severeIncidents[0];
    items.push({
      icon: Construction,
      color: "var(--app-warning)",
      label: i.type === "Construction" ? "Major roadwork" : "Severe traffic",
      value: `${i.road}: ${i.description.slice(0, 60)}`,
      detail: "MDOT CHART · live",
      href: "/pulse?open=traffic",
    });
  } else if (incidents.length > 5) {
    items.push({
      icon: Construction,
      color: "var(--app-cool)",
      label: `${incidents.length} active incidents`,
      value: "Traffic data across Frederick County",
      detail: "MDOT CHART · live",
      href: "https://chart.maryland.gov/",
    });
  }

  // 311 issues
  if (fixit.length > 0) {
    items.push({
      icon: AlertTriangle,
      color: "var(--app-cool)",
      label: `${fixit.length} recent 311 reports`,
      value: fixit[0].summary.slice(0, 60),
      detail: "FCG FixIT · SeeClickFix",
      href: "/pulse?open=fixit",
    });
  }

  if (items.length === 0) return null;

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Live county pulse"
    >
      <Link
        href="/pulse"
        className="mb-2 flex items-center justify-between gap-2 px-1"
      >
        <span className="inline-flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Live pulse · Frederick County
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: "var(--app-cool)" }}>
          All dashboards
          <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        </span>
      </Link>
      <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          const inner = (
            <div className="flex items-start gap-3 py-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: it.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                  {it.label}
                </p>
                <p className="line-clamp-2 text-xs leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  {it.value}
                </p>
                {it.detail && (
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
                    {it.detail}
                  </p>
                )}
              </div>
            </div>
          );
          return (
            <li key={i} className={i === 0 ? "" : "pt-0"}>
              {it.href ? (
                <Link href={it.href} className="block transition active:opacity-70">
                  {inner}
                </Link>
              ) : inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LivePulseEmpty() {
  return null;
}

// Visitor-mode rendering: same data but more touristy framing.
export async function LivePulseVisitor() {
  const [incidents, fixit] = await Promise.all([
    getChartIncidentsFrederick(),
    getFixItIssues(3),
  ]);
  const severe = incidents.filter((i) => i.severity === "High").slice(0, 2);
  if (severe.length === 0 && fixit.length === 0) return null;

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Heads up for visitors"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <Bus className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Heads up · Frederick County
        </p>
      </div>
      <ul className="space-y-1.5">
        {severe.map((i) => (
          <li key={i.id} className="text-xs" style={{ color: "var(--app-ink-2)" }}>
            <strong style={{ color: "var(--app-warning)" }}>{i.road}:</strong> {i.description.slice(0, 80)}
          </li>
        ))}
      </ul>
    </section>
  );
}
