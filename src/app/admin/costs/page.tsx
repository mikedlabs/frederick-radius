import type { Metadata } from "next";
import { gte } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { usage_counters } from "@/lib/db/schema";
import type { PaidUpstream } from "@/lib/usage-meter";
import { googlePhotoDailyCap } from "@/lib/google-photo-budget";
import { resolveGoogleGeocodeDailyCap } from "@/lib/ingest/geocode";
import { resolveHoursRefreshRunCap } from "@/lib/hours-refresh-targets";
import {
  AdminShell,
  SectionLabel,
  HairlineList,
  StatStrip,
  StatusPill,
  Notice,
  ExternalLink,
} from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Usage costs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /admin/costs — what is incurring cost, from the app's own meter.
 *
 * usage_counters receives best-effort SKU telemetry from database-connected
 * app paths (lib/usage-meter.ts). Awaited atomic budget rows are the spend
 * boundary; these reporting rows are not. Maintenance and scheduled CLI runs
 * print an explicit request/SKU preview but may not appear here. The page
 * therefore presents an operational estimate, never a bill: the provider
 * consoles (linked) are the source of truth.
 *
 * Composed from the shared admin kit (@/components/admin/kit) so the whole
 * /admin surface reads as one calm field guide. The metered rows and cost
 * estimate figure stay local: they carry a threshold-colored money figure,
 * a mono stat line, and an untruncated note that no kit row slot covers.
 */

type MeteredUpstreamBase = {
  key: PaidUpstream;
  label: string;
  note: string;
};

type UnitEstimateUpstream = MeteredUpstreamBase & {
  billing: "unit-estimate";
  per1000: number;
  freeMonthly?: number;
};

type PlanCreditUpstream = MeteredUpstreamBase & {
  billing: "plan-credit";
  dailyCap: number;
};

type MeteredUpstream = UnitEstimateUpstream | PlanCreditUpstream;

/** Unit prices are estimates, not bills. Capped-attempt services deliberately do
 * not receive a made-up dollar conversion. */
const UPSTREAMS: MeteredUpstream[] = [
  // Global Google Maps Platform list prices and monthly free usage caps,
  // verified 2026-08-23. Each named SKU receives its own free cap. Source:
  // https://developers.google.com/maps/billing-and-pricing/pricing
  { key: "google_photo", label: "Google place photos", billing: "unit-estimate", per1000: 7, freeMonthly: 1_000, note: "Place Details Photos SKU. The first 1,000 media requests each month are free. Each no-store proxy request can reach Google; these counts are real upstream fetch attempts." },
  { key: "google_place_details_pro", label: "Google Place Details Pro", billing: "unit-estimate", per1000: 17, freeMonthly: 5_000, note: "Direct Place Details requests whose highest field is Pro, including status-only checks. The first 5,000 requests each month are free." },
  { key: "google_place_details_enterprise", label: "Google Place Details Enterprise", billing: "unit-estimate", per1000: 20, freeMonthly: 1_000, note: "Direct Place Details requests for fields such as opening hours, rating, phone, or website. The first 1,000 requests each month are free." },
  { key: "google_place_details_enterprise_atmosphere", label: "Google Place Details Enterprise + Atmosphere", billing: "unit-estimate", per1000: 25, freeMonthly: 1_000, note: "Direct Place Details requests for reviews, summaries, or visit-decision attributes. The first 1,000 requests each month are free." },
  { key: "google_text_search_pro", label: "Google Text Search Pro", billing: "unit-estimate", per1000: 32, freeMonthly: 5_000, note: "Text Search requests whose highest field is Pro, including identity-safe photo resolution. The first 5,000 requests each month are free." },
  { key: "google_text_search_enterprise", label: "Google Text Search Enterprise", billing: "unit-estimate", per1000: 35, freeMonthly: 1_000, note: "Text Search requests for fields such as opening hours, rating, phone, or website. The first 1,000 requests each month are free." },
  { key: "google_text_search_enterprise_atmosphere", label: "Google Text Search Enterprise + Atmosphere", billing: "unit-estimate", per1000: 40, freeMonthly: 1_000, note: "Text Search requests for reviews, summaries, or visit-decision attributes. The first 1,000 requests each month are free." },
  { key: "anthropic_ask", label: "Ask Radius AI", billing: "unit-estimate", per1000: 10, note: "Counts submitted AI answers, not every internal tool step. AI Gateway is the source of truth for model and embedding spend." },
  { key: "google_routes_matrix", label: "Google Routes matrix (legacy)", billing: "unit-estimate", per1000: 10, freeMonthly: 5_000, note: "Conservative historical estimate for the former combined counter. New requests are split by their actual Routes SKU below." },
  { key: "google_routes_matrix_essentials", label: "Google Routes walking matrix", billing: "unit-estimate", per1000: 5, freeMonthly: 10_000, note: "Compute Route Matrix Essentials elements. Place-sheet estimates run only after an explicit tap; device origins are rounded and never stored in Radius's persistent cache." },
  { key: "google_routes_matrix_pro", label: "Google Routes traffic-aware matrix", billing: "unit-estimate", per1000: 10, freeMonthly: 5_000, note: "Compute Route Matrix Pro elements. Traffic-aware driving triggers this tier; the app now meters it separately from walking." },
  { key: "google_geocode", label: "Google event geocoding", billing: "unit-estimate", per1000: 5, freeMonthly: 10_000, note: "Geocoding requests for uncached event addresses. Radius reserves a shared daily attempt before each request; trusted cache hits do not reach Google." },
  { key: "mapbox_directions", label: "Mapbox walking directions", billing: "unit-estimate", per1000: 2, note: "One routed leg when a nearby place is selected. Route and fetch-cache hits do not increment this counter." },
  { key: "mapbox_isochrone", label: "Mapbox isochrone", billing: "unit-estimate", per1000: 2, freeMonthly: 100_000, note: "After the 100k-request monthly free tier. Platform caching means real hits run lower than this count." },
  { key: "mapbox_matrix", label: "Mapbox travel matrix", billing: "unit-estimate", per1000: 2, freeMonthly: 100_000, note: "After the 100k-element monthly free tier. Mapbox bills each returned matrix element. Within reach caches its 2–9-place shortlist for five minutes or one day, while map-search walking enrichment stays no-store." },
  { key: "mapbox_search_box", label: "Mapbox Search Box fallback", billing: "unit-estimate", per1000: 11.5, freeMonthly: 2_500, note: "After the 2,500-session monthly free tier. Counts each fallback session when its first suggestion succeeds, including sessions abandoned without a selection. Radius search always runs first." },
  { key: "mapbox_geocode", label: "Mapbox permanent geocoding", billing: "unit-estimate", per1000: 5, note: "Stored event-address enrichment. Mapbox has no free tier for permanent results; disabled unless MAPBOX_GEOCODING_ENABLED=1." },
  { key: "mapbox_static", label: "Mapbox static maps", billing: "unit-estimate", per1000: 1, freeMonthly: 50_000, note: "After the 50k/month free tier; cached for 30 days per location." },
  {
    key: "firecrawl_visit_frederick",
    label: "Visit Frederick recovery",
    billing: "plan-credit",
    dailyCap: 12,
    note: "One app-side attempt is reserved before each exact Visit Frederick feed recovery request. Failed attempts remain in this tally even when Firecrawl does not bill a provider credit. The provider dashboard is the source of truth.",
  },
];

const BILLING_LINKS: Array<{ label: string; href: string }> = [
  { label: "Google Cloud billing", href: "https://console.cloud.google.com/billing" },
  { label: "Vercel AI Gateway usage", href: "https://vercel.com/dashboard/ai" },
  { label: "Anthropic fallback usage", href: "https://console.anthropic.com/settings/usage" },
  { label: "Mapbox statistics", href: "https://account.mapbox.com/statistics" },
  { label: "Firecrawl usage", href: "https://www.firecrawl.dev/app" },
  { label: "Vercel usage", href: "https://vercel.com/dashboard/usage" },
];

function dayKeyEastern(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function boundedGoogleDailyCap(
  raw: string | undefined,
  safeDefault: number,
  maximum: number,
): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return safeDefault;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return safeDefault;
  return Math.min(maximum, Math.max(1, parsed));
}

function estimatedMonthlyCost(
  upstream: MeteredUpstream,
  calls: number,
): number | null {
  if (upstream.billing === "plan-credit") return null;
  return (
    (Math.max(0, calls - (upstream.freeMonthly ?? 0)) / 1000) *
    upstream.per1000
  );
}

/** The threshold-colored 30-day estimate figure (brand-press when it clears $1). */
function EstimateFigure({ est }: { est: number }) {
  return (
    <div className="shrink-0 text-right">
      <p
        className="font-mono text-[14px] font-semibold leading-none tabular-nums"
        style={{ color: est >= 1 ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
      >
        ~${est.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        est / 30d
      </p>
    </div>
  );
}

function PlanCreditFigure({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="shrink-0 text-right">
      <p
        className="font-mono text-[14px] font-semibold leading-none tabular-nums"
        style={{ color: used >= limit ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
      >
        {used.toLocaleString()} / {limit}
      </p>
      <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        recovery attempts today
      </p>
    </div>
  );
}

export default async function CostsAdmin() {
  const db = getDb();
  let rows: Array<{ day: string; upstream: string; count: number }> = [];
  let dbError = false;
  let searchDocumentCount = 0;
  const nowMs = Date.now();
  if (db) {
    try {
      const since = new Date(nowMs - 30 * 86_400_000);
      rows = await db
        .select({ day: usage_counters.day, upstream: usage_counters.upstream, count: usage_counters.count })
        .from(usage_counters)
        .where(gte(usage_counters.day, dayKeyEastern(since)));
    } catch {
      dbError = true;
    }
  }
  const rawSql = getSql();
  if (rawSql) {
    try {
      const [row] = await rawSql<Array<{ count: number | string }>>`
        select count(*) as count from public.radius_search_documents
      `;
      searchDocumentCount = Number(row?.count) || 0;
    } catch {
      // Migration not applied yet. The checklist below reports it as missing.
    }
  }

  const today = dayKeyEastern(new Date(nowMs));
  const sevenAgo = dayKeyEastern(new Date(nowMs - 7 * 86_400_000));
  const sum = (key: string, sinceDay: string | null) =>
    rows
      .filter((r) => r.upstream === key && (sinceDay === null || r.day >= sinceDay))
      .reduce((a, r) => a + r.count, 0);

  // The month model: what has this Eastern calendar month cost so far, and
  // where does it land if the rest of the month runs at the recent pace?
  // Pace is the MEDIAN of the last seven full days (today is partial, and a
  // median shrugs off a one-day spike that would wreck an average).
  const monthStart = `${today.slice(0, 7)}-01`;
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const remainingDays = daysInMonth - dayOfMonth;
  const last7Keys = Array.from({ length: 7 }, (_, i) => dayKeyEastern(new Date(nowMs - (i + 1) * 86_400_000)));
  const monthMath = UPSTREAMS.map((u) => {
    const byDay = new Map(rows.filter((r) => r.upstream === u.key).map((r) => [r.day, r.count]));
    // Days with no counter row are real zero-call days; they must weigh in.
    const daily = last7Keys.map((k) => byDay.get(k) ?? 0).sort((a, b) => a - b);
    const medianDaily = daily[3];
    const todayCalls = byDay.get(today) ?? 0;
    const monthCalls = sum(u.key, monthStart);
    const projectedCalls = monthCalls + medianDaily * remainingDays;
    const mtdEst = estimatedMonthlyCost(u, monthCalls);
    const projectedEst = estimatedMonthlyCost(u, projectedCalls);
    // Same alarm rule as the desk's cost sentinel: real volume, 3x the median.
    const atDailyCap =
      u.billing === "plan-credit" && todayCalls >= u.dailyCap;
    const hot =
      atDailyCap ||
      (todayCalls >= 50 && todayCalls > 3 * Math.max(1, medianDaily));
    return { key: u.key, mtdEst, projectedEst, hot, atDailyCap };
  });
  const totalMtd = monthMath.reduce((a, m) => a + (m.mtdEst ?? 0), 0);
  const totalProjected = monthMath.reduce(
    (a, m) => a + (m.projectedEst ?? 0),
    0,
  );
  const hotCount = monthMath.filter((m) => m.hot).length;
  const atomicGoogleCapsReady = Boolean(db && rawSql && !dbError);
  const photoDailyCap = googlePhotoDailyCap();
  const placeBasicDailyCap = boundedGoogleDailyCap(
    process.env.GOOGLE_PLACE_ENRICH_DAILY_CAP,
    30,
    80,
  );
  const placeExperienceDailyCap = boundedGoogleDailyCap(
    process.env.GOOGLE_PLACE_EXPERIENCE_DAILY_CAP,
    20,
    20,
  );
  const routeDailyCap = boundedGoogleDailyCap(
    process.env.GOOGLE_ROUTES_PRIVATE_DAILY_CAP,
    100,
    150,
  );
  const geocodeDailyCap = resolveGoogleGeocodeDailyCap();
  const hoursRefreshDailyCap = resolveHoursRefreshRunCap();

  // Cost-control posture — read live from env so the checklist is honest.
  const controls: Array<{ label: string; ok: boolean; why: string }> = [
    { label: "Shared per-IP rate limiting (Vercel KV)", ok: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN), why: process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN ? "Requests share one per-IP limiter across serverless workers." : "A bounded per-instance fallback remains active. Atomic database reservations still cap protected Google spend, but KV is needed for one shared per-IP bucket across workers." },
    { label: "Google Places key", ok: Boolean(process.env.GOOGLE_PLACES_API_KEY), why: "Place details and photos use this server-only deployment key. Restrict it to the Places APIs and set a quota in Google Cloud." },
    { label: "Google Routes key isolation", ok: Boolean(process.env.GOOGLE_ROUTES_API_KEY), why: process.env.GOOGLE_ROUTES_API_KEY ? "Routes uses its own API-restricted key and independent Google Cloud quota." : "Routes still works through the Places-key fallback, but it cannot have an independent key restriction and quota until GOOGLE_ROUTES_API_KEY is set." },
    { label: "Google Geocoding key isolation", ok: Boolean(process.env.GOOGLE_GEOCODING_API_KEY), why: process.env.GOOGLE_GEOCODING_API_KEY ? "Geocoding uses its own API-restricted key and independent Google Cloud quota." : "Geocoding still works through the Places-key fallback, but it cannot have an independent key restriction and quota until GOOGLE_GEOCODING_API_KEY is set." },
    { label: "Atomic Google daily ceilings", ok: atomicGoogleCapsReady, why: atomicGoogleCapsReady ? `Shared Eastern-day reservations are active: photos ${photoDailyCap}, place basic/hours ${placeBasicDailyCap}, place experience ${placeExperienceDailyCap}, route estimates ${routeDailyCap}, geocodes ${geocodeDailyCap}, hours refresh ${hoursRefreshDailyCap}, and business status 40.` : `The database counter is unavailable, so protected Google paths fail closed instead of spending. Configured ceilings are photos ${photoDailyCap}, place basic/hours ${placeBasicDailyCap}, place experience ${placeExperienceDailyCap}, route estimates ${routeDailyCap}, geocodes ${geocodeDailyCap}, hours refresh ${hoursRefreshDailyCap}, and business status 40.` },
    { label: "AI Gateway", ok: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN), why: "Routes the agent through one budgeted, observable model layer. Set a team spend limit in Vercel." },
    { label: "Agent step limit", ok: true, why: "Radius stops the decision loop after five model steps and keeps simple questions off the model path." },
    { label: "Mapbox Matrix switch", ok: process.env.MAPBOX_MATRIX_ENABLED === "1", why: "Real travel-time ranking stays off unless this dedicated switch is set to 1." },
    { label: "Mapbox Search Box switch", ok: process.env.MAPBOX_SEARCH_BOX_ENABLED === "1", why: "The metered fallback search stays off unless this dedicated switch is set to 1." },
    { label: "Hybrid search index", ok: searchDocumentCount > 0, why: searchDocumentCount > 0 ? `${searchDocumentCount.toLocaleString()} local records are available to meaning + exact-match retrieval.` : "Apply migration 0025, then run npm run build:radius-search once." },
  ];

  return (
    <AdminShell
      eyebrow="Operations"
      title="Usage costs"
      intro={
        <>
          Best-effort app telemetry for paid calls and capped recovery
          attempts. Atomic ceilings protect Google spend even if a reporting
          write is lost. Manual and scheduled CLI runs may not appear here,
          and provider consoles remain the source of truth.
        </>
      }
    >
      {dbError && (
        <div className="mt-6">
          <Notice tone="warning">
            The usage_counters table isn&rsquo;t migrated yet. Run
            <code className="mx-1">drizzle/0017_usage_counters.sql</code> in the Supabase
            SQL editor, then reload. Protected Google paths fail closed until
            the atomic counter is available; reporting starts filling as soon
            as the table exists.
          </Notice>
        </div>
      )}

      {/* The month, answered first: spent so far, where it lands, what's hot. */}
      <section className="mt-6">
        <SectionLabel>This month</SectionLabel>
        <StatStrip
          items={[
            { value: `~$${totalMtd.toFixed(2)}`, label: "est so far" },
            { value: `~$${totalProjected.toFixed(2)}`, label: `projected by day ${daysInMonth}` },
            {
              value: hotCount,
              label: "running hot",
              tone: hotCount > 0 ? "danger" : "positive",
            },
          ]}
        />
      </section>

      {/* Per-upstream meter — the answer (estimated spend) leads each row, counts support. */}
      <section className="mt-7">
        <SectionLabel>Metered calls</SectionLabel>
        <HairlineList>
          {UPSTREAMS.map((u, i) => {
            const d1 = sum(u.key, today);
            const d7 = sum(u.key, sevenAgo);
            const d30 = sum(u.key, null);
            const est30 = estimatedMonthlyCost(u, d30);
            const month = monthMath.find((m) => m.key === u.key);
            return (
              <li key={u.key} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                <div className="flex items-start justify-between gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>
                        {u.label}
                      </p>
                      {month?.hot && (
                        <StatusPill tone="danger">
                          {month.atDailyCap ? "daily cap reached" : "running hot today"}
                        </StatusPill>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      today {d1.toLocaleString()} · 7d {d7.toLocaleString()} · 30d {d30.toLocaleString()}
                      {u.billing === "unit-estimate" ? (
                        <span style={{ color: "var(--app-ink-3)" }}> · ~${u.per1000}/1k</span>
                      ) : (
                        <span style={{ color: "var(--app-ink-3)" }}> · recovery attempts · hard cap {u.dailyCap}/day</span>
                      )}
                    </p>
                    {u.billing === "unit-estimate" && (
                      <p className="mt-0.5 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                        month ~${(month?.mtdEst ?? 0).toFixed(2)}
                        <span style={{ color: "var(--app-ink-3)" }}> · projected ~${(month?.projectedEst ?? 0).toFixed(2)}</span>
                      </p>
                    )}
                    <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                      {u.note}
                    </p>
                  </div>
                  {u.billing === "unit-estimate" && est30 !== null ? (
                    <EstimateFigure est={est30} />
                  ) : (
                    <PlanCreditFigure
                      used={d1}
                      limit={u.billing === "plan-credit" ? u.dailyCap : 0}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </HairlineList>
      </section>

      {/* Cost-control posture */}
      <section className="mt-7">
        <SectionLabel>Cost controls</SectionLabel>
        <HairlineList>
          {controls.map((c, i) => (
            <li key={c.label} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
              <div className="flex items-start gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>
                    {c.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                    {c.why}
                  </p>
                </div>
                <StatusPill tone={c.ok ? "positive" : "brand"}>{c.ok ? "Active" : "Missing"}</StatusPill>
              </div>
            </li>
          ))}
        </HairlineList>
      </section>

      {/* Source-of-truth links */}
      <section className="mt-7">
        <SectionLabel>Real bills live here</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {BILLING_LINKS.map((l) => (
            <ExternalLink key={l.href} href={l.href}>
              {l.label}
            </ExternalLink>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Counts are best-effort telemetry for validated paid fetch attempts;
        short-lived serverless or CLI processes can end before a reporting
        write lands, so this view may undercount. Cache-aware paths exclude
        cache hits, while a few older fetch-cache counters remain an upper
        bound. Google Cloud Billing and the other provider consoles remain the
        billing source of truth. Unit prices are estimates pinned in code
        (src/app/admin/costs/page.tsx); update them when provider pricing
        changes. Firecrawl recovery is shown as app-side attempts and is
        excluded from dollar totals because an attempt is not the same as a
        provider credit or billable call. The month
        projection extends what has already been spent at the median daily rate
        of the last seven full days, so one spiky day does not distort it.
      </p>
    </AdminShell>
  );
}
