/**
 * Live Pulse — the one-screen civic snapshot for Frederick County.
 *
 * This is the page that replaces opening four separate government /
 * utility websites (MDOT CHART, FirstEnergy, FCPS, FCG FixIT). Every
 * feed is fetched server-side, normalized, and rendered IN-APP. The
 * only outbound links are small "source" attributions — the data
 * itself lives here.
 */
import type { Metadata } from "next";
import {
  Activity, Construction, Zap, School, AlertTriangle, Siren,
  CheckCircle2, ExternalLink, MapPin, Clock,
} from "lucide-react";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { getPulsePointIncidents } from "@/lib/integrations/pulsepoint";

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Live Pulse",
  description: "Live traffic, power, school, and 311 status across Frederick County — one screen instead of four government websites.",
};

export const revalidate = 120;

function timeAgo(iso: string): string {
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function PulsePage() {
  const [incidents, outages, fcps, fixit, safety] = await Promise.all([
    getChartIncidentsFrederick(),
    getFrederickOutages(),
    getFcpsAlerts(),
    getFixItIssues(15),
    getPulsePointIncidents(),
  ]);

  const sevRank = { High: 0, Medium: 1, Low: 2 } as const;
  const traffic = [...incidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity]
  );
  const schoolAlerts = fcps.filter((a) => a.status !== "unknown");
  const allClear =
    safety.length === 0 &&
    traffic.length === 0 &&
    outages.total_out < 25 &&
    schoolAlerts.length === 0 &&
    fixit.length === 0;

  const pct =
    outages.total_served > 0
      ? ((outages.total_out / outages.total_served) * 100).toFixed(2)
      : "0";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          <Activity className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          Live Pulse · Frederick County
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          What&apos;s happening right now
        </h1>
        <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>
          Traffic, power, schools, and citizen 311 reports — combined from four
          county and state feeds, refreshed every couple of minutes.
        </p>
      </header>

      {allClear && (
        <div
          className="flex items-center gap-3 rounded-[var(--app-radius-lg)] border p-4"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <CheckCircle2 className="h-6 w-6 shrink-0" strokeWidth={2} style={{ color: "var(--app-positive)" }} aria-hidden />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>All clear across the county</p>
            <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
              No major traffic, outages, school alerts, or open 311 hot spots right now.
            </p>
          </div>
        </div>
      )}

      {/* ── Public safety (PulsePoint scanner) ── */}
      {safety.length > 0 && (
        <DashSection
          id="safety"
          icon={Siren}
          title="Active fire & rescue"
          count={safety.length}
          accent="var(--app-danger)"
          source={{ label: "PulsePoint", href: "https://web.pulsepoint.org/" }}
          empty="No active fire or rescue calls."
        >
          {safety.map((s) => (
            <Row
              key={s.id}
              tone="danger"
              title={s.type}
              meta={[s.address, timeAgo(s.received_at)]}
            />
          ))}
        </DashSection>
      )}

      {/* ── Police calls for service ──
          Frederick PD's CFS data is a CommunityCrimeMap (LexisNexis)
          embed with no public feed/API — so we link to the official
          map honestly rather than scrape or fabricate it. The
          disclaimer is the one the City/PD itself requires. */}
      <section
        id="police"
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--app-border)" }}>
          <Siren className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Police calls for service
          </h2>
        </div>
        <div className="space-y-2.5 px-4 py-3">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Frederick PD publishes the prior day&apos;s calls for service
            from its CAD system, updated daily, on an official map. You
            can browse it and subscribe to alerts for your area there.
          </p>
          <a
            href="https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)] active:scale-[0.99]"
            style={{ background: "var(--app-cool)" }}
          >
            Open the official CFS map
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </a>
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Calls for service are not confirmed crimes — they reflect
            requests for police response. Source: Frederick Police
            Department via CommunityCrimeMap.
          </p>
        </div>
      </section>

      {/* ── Traffic ── */}
      <DashSection
        id="traffic"
        icon={Construction}
        title="Traffic & roadwork"
        count={traffic.length}
        accent="var(--app-warning)"
        source={{ label: "MDOT CHART", href: "https://chart.maryland.gov/" }}
        empty="No active incidents on Frederick County roads."
      >
        {traffic.slice(0, 12).map((i) => (
          <Row
            key={i.id}
            tone={i.severity === "High" ? "danger" : i.severity === "Medium" ? "warning" : "muted"}
            title={`${i.road}${i.direction ? ` ${i.direction}` : ""} — ${i.type}`}
            body={i.description}
            meta={[
              i.location,
              i.lanes_affected,
              i.expected_end ? `Clears ~${new Date(i.expected_end).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric" })}` : undefined,
            ]}
          />
        ))}
      </DashSection>

      {/* ── Power ── */}
      <DashSection
        id="power"
        icon={Zap}
        title="Power outages"
        count={outages.total_out > 25 ? outages.munis.length || 1 : 0}
        accent="var(--app-danger)"
        source={{ label: "FirstEnergy / Potomac Edison", href: "https://outages-mdwv.firstenergycorp.com/" }}
        empty="No significant outages — fewer than 25 customers affected county-wide."
      >
        {outages.total_out > 25 && (
          <>
            <div
              className="mb-2 flex items-baseline gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
            >
              <span className="font-serif text-2xl font-semibold tabular-nums" style={{ color: "var(--app-danger)" }}>
                {outages.total_out.toLocaleString()}
              </span>
              <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>
                customers without power · {pct}% of {outages.total_served.toLocaleString()} served
              </span>
            </div>
            {outages.munis.map((m) => (
              <Row
                key={m.area}
                tone={m.customers_out > 500 ? "danger" : "warning"}
                title={m.area}
                body={`${m.customers_out.toLocaleString()} out of ${m.customers_served.toLocaleString()} (${m.percentage.toFixed(1)}%)`}
              />
            ))}
          </>
        )}
      </DashSection>

      {/* ── Schools ── */}
      <DashSection
        id="schools"
        icon={School}
        title="Schools (FCPS)"
        count={schoolAlerts.length}
        accent="var(--app-warning)"
        source={{ label: "FCPS RSS", href: "https://www.fcps.org/" }}
        empty="Frederick County Public Schools on a normal schedule."
      >
        {schoolAlerts.map((a) => (
          <Row
            key={a.id}
            tone={a.status === "closed" ? "danger" : a.status === "open" ? "muted" : "warning"}
            title={
              a.status === "closed" ? "Schools closed"
                : a.status === "delayed" ? "Delayed opening"
                : a.status === "early_dismissal" ? "Early dismissal"
                : "Update"
            }
            body={a.title}
            meta={[timeAgo(a.published_at)]}
          />
        ))}
      </DashSection>

      {/* ── 311 ── */}
      <DashSection
        id="311"
        icon={AlertTriangle}
        title="Citizen 311 reports"
        count={fixit.length}
        accent="var(--app-cool)"
        source={{ label: "FCG FixIT · SeeClickFix", href: "https://www.frederickcountymd.gov/8235/FCG-FixIT" }}
        empty="No recent open 311 reports nearby."
      >
        {fixit.map((i) => (
          <Row
            key={i.id}
            tone={i.status === "closed" ? "muted" : "cool"}
            title={i.summary}
            body={i.category}
            meta={[i.address, timeAgo(i.reported_at), i.status]}
          />
        ))}
      </DashSection>

      <p className="pt-2 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Informational only — not a substitute for 911 or official emergency
        broadcasts. Source feeds are linked per section.
      </p>
    </div>
  );
}

function DashSection({
  id, icon: Icon, title, count, accent, source, empty, children,
}: {
  id: string;
  icon: typeof Activity;
  title: string;
  count: number;
  accent: string;
  source: { label: string; href: string };
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);
  return (
    <section
      id={id}
      className="scroll-mt-20 space-y-2 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          <Icon className="h-4 w-4" strokeWidth={2} style={{ color: accent }} aria-hidden />
          {title}
        </h2>
        {count > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ background: `${accent}1A`, color: accent }}
          >
            {count}
          </span>
        )}
      </div>

      {hasItems ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <p className="flex items-center gap-2 py-1 text-sm" style={{ color: "var(--app-ink-3)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-positive)" }} aria-hidden />
          {empty}
        </p>
      )}

      <a
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 pt-1 text-[10px] uppercase tracking-wide"
        style={{ color: "var(--app-ink-3)" }}
      >
        Source: {source.label}
        <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      </a>
    </section>
  );
}

function Row({
  title, body, meta, tone,
}: {
  title: string;
  body?: string;
  meta?: (string | undefined)[];
  tone: "danger" | "warning" | "cool" | "muted";
}) {
  const dot =
    tone === "danger" ? "var(--app-danger)"
      : tone === "warning" ? "var(--app-warning)"
      : tone === "cool" ? "var(--app-cool)"
      : "var(--app-ink-3)";
  const metas = (meta ?? []).filter(Boolean) as string[];
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
          {title}
        </p>
        {body && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {body}
          </p>
        )}
        {metas.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            {metas.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i === 0 && <MapPin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
                {i > 0 && <Clock className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
