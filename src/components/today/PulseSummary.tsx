/**
 * PulseSummary — the ONE quiet civic line on Today.
 *
 * The full multi-feed board lives at /pulse (and CivicAlerts carries
 * weather/park emergencies up top). Today should not re-render that
 * whole board — it made the page feel like a dashboard directory. So
 * this collapses the same five feeds to a single honest line: the one
 * most-urgent active concern, or a calm "all clear", always linking to
 * the full board. Same feeds, same priority order as LivePulse.
 */
import { Activity, Zap, School, Construction, Siren, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getPulsePointIncidents } from "@/lib/integrations/pulsepoint";

type Lead = { icon: typeof Activity; color: string; text: string };

export default async function PulseSummary() {
  const [incidents, outages, fcps, fixit, safety] = await Promise.all([
    getChartIncidentsFrederick().catch(() => []),
    getFrederickOutages().catch(() => ({ total_out: 0, munis: [] as { area: string; customers_out: number }[] })),
    getFcpsAlerts().catch(() => []),
    getFixItIssues(1).catch(() => []),
    getPulsePointIncidents().catch(() => []),
  ]);

  // Same priority order as the full board: safety → school → power →
  // severe traffic → 311. First hit wins the single line.
  let lead: Lead | null = null;

  if (safety.length > 0) {
    lead = {
      icon: Siren,
      color: "var(--app-danger)",
      text: `${safety.length} active fire/rescue call${safety.length === 1 ? "" : "s"}`,
    };
  }
  if (!lead) {
    const closure = fcps.find(
      (a) => a.status === "closed" || a.status === "delayed" || a.status === "early_dismissal",
    );
    if (closure) {
      lead = {
        icon: School,
        color: closure.status === "closed" ? "var(--app-danger)" : "var(--app-warning)",
        text:
          closure.status === "closed"
            ? "FCPS closed today"
            : closure.status === "delayed"
              ? "FCPS on delay"
              : "FCPS early dismissal",
      };
    }
  }
  if (!lead && outages.total_out > 25) {
    lead = {
      icon: Zap,
      color: outages.total_out > 500 ? "var(--app-danger)" : "var(--app-warning)",
      text: `${outages.total_out.toLocaleString()} without power`,
    };
  }
  if (!lead) {
    const severe = incidents.find((i) => i.severity === "High");
    if (severe) {
      lead = {
        icon: Construction,
        color: "var(--app-warning)",
        text: `${severe.road}: ${severe.type === "Construction" ? "major roadwork" : "severe delay"}`,
      };
    }
  }
  if (!lead && fixit.length > 0) {
    lead = {
      icon: AlertTriangle,
      color: "var(--app-cool)",
      text: "Recent 311 activity",
    };
  }

  const Icon = lead?.icon ?? CheckCircle2;
  const color = lead?.color ?? "var(--app-good, #3F7E5A)";
  const text = lead?.text ?? "All clear across Frederick County";

  return (
    <Link
      href="/pulse"
      aria-label="Open the live county pulse board"
      className="flex items-center gap-2.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-3.5 py-2.5 transition active:scale-[0.99]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--app-bg-sunken) 70%, transparent)" }}
      >
        <Icon className="h-4 w-4" strokeWidth={2} style={{ color }} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          {text}
        </span>
        <span className="block text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Live pulse · Frederick County
        </span>
      </span>
      <span
        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold"
        style={{ color: "var(--app-cool)" }}
      >
        Open
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
    </Link>
  );
}
