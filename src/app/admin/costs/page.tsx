import type { Metadata } from "next";
import { gte } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { usage_counters } from "@/lib/db/schema";
import type { UsageBudgetNamespace } from "@/lib/usage-meter";
import { googlePhotoDailyCap } from "@/lib/google-photo-budget";
import { googleHoursRefreshDailyCap } from "@/lib/google-hours-refresh-budget";
import { googlePlaceEnrichmentDailyCap } from "@/lib/google-place-enrichment-budget";
import { googleRoutesDailyElementCap } from "@/lib/google-routes-budget";
import {
  googleEventGeocodeDailyLimit,
  MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
} from "@/lib/paid-usage-limits";
import {
  googleMapsPlatformRuntimeEnabled,
  googleMapsWrittenApprovalConfirmed,
  googleRoutesRuntimeEnabled,
} from "@/lib/google-maps-policy";
import {
  mapboxDailyUsageCap,
  mapboxMatrixRuntimeEnabled,
  mapboxRequestRuntimeEnabled,
} from "@/lib/mapbox-budget";
import {
  askAiDailyCallLimit,
  askAiEmbeddingDailyLimit,
  askAiMaxOutputTokens,
  askAiRuntimeRequested,
  askRuntimeEmbeddingsConfigured,
  askRuntimeEmbeddingsRequested,
  askTextGenerationRuntimeConfigured,
  askTextProvider,
  askTextProviderCredentialConfigured,
  MAX_ASK_AI_DAILY_CALL_LIMIT,
  MAX_ASK_AI_EMBEDDING_DAILY_LIMIT,
} from "@/lib/ask/runtime-budget";
import {
  radiusSearchEmbeddingDailyDocumentLimit,
  radiusSearchSemanticConfigured,
  radiusSearchSemanticRequested,
  MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT,
} from "@/lib/ask/search-index-budget";
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
 * usage_counters is incremented beside every PAID upstream fetch
 * (lib/usage-meter.ts). This page turns those tallies into a per-upstream
 * readout (today / 7 days / 30 days) with either an ESTIMATED dollar figure or
 * an honest capped-attempt count, plus a cost-controls checklist showing which
 * protections are actually configured. The estimates are deliberately
 * conservative labels, never a bill: the provider consoles (linked) are the
 * source of truth.
 *
 * Composed from the shared admin kit (@/components/admin/kit) so the whole
 * /admin surface reads as one calm field guide. The metered rows and cost
 * estimate figure stay local: they carry a threshold-colored money figure,
 * a mono stat line, and an untruncated note that no kit row slot covers.
 */

type MeteredUpstreamBase = {
  key: UsageBudgetNamespace;
  label: string;
  note: string;
  dailyCap?: number;
};

type UnitEstimateUpstream = MeteredUpstreamBase & {
  billing: "unit-estimate";
  per1000: number;
  freeMonthly?: number;
  rateLabel?: string;
};

type PlanCreditUpstream = MeteredUpstreamBase & {
  billing: "plan-credit";
  dailyCap: number;
};

type GuardedAttemptUpstream = MeteredUpstreamBase & {
  billing: "guarded-attempt";
  dailyCap: number;
};

type MeteredUpstream =
  | UnitEstimateUpstream
  | PlanCreditUpstream
  | GuardedAttemptUpstream;

type CostControlState = "active" | "off" | "attention";

type CostControl = {
  label: string;
  state: CostControlState;
  why: string;
};

const CONTROL_STATUS: Record<
  CostControlState,
  { label: string; tone: "positive" | "muted" | "warning" }
> = {
  active: { label: "Active", tone: "positive" },
  off: { label: "Off, safe", tone: "muted" },
  attention: { label: "Needs attention", tone: "warning" },
};

/** Unit prices are estimates, not bills. Capped-attempt services deliberately do
 * not receive a made-up dollar conversion. */
const UPSTREAMS: MeteredUpstream[] = [
  { key: "google_photo", label: "Google place photos", billing: "unit-estimate", per1000: 7, freeMonthly: 1_000, dailyCap: googlePhotoDailyCap(), note: "Places Photo SKU. Each no-store proxy request can reach Google. The configured aggregate cap is a spike breaker shared by public images and the health probe." },
  { key: "google_event_geocode", label: "Google event geocoding", billing: "unit-estimate", per1000: 5, dailyCap: googleEventGeocodeDailyLimit(), note: "Last-resort event coordinates after official County, trusted catalog, and current cache misses. A hashed normalized-address claim and one shared Eastern-day database cap prevent duplicate or unbounded paid requests." },
  { key: "budget_google_place_enrich_basic", label: "Google place sheet refresh", billing: "unit-estimate", per1000: 35, rateLabel: "$20–$35", dailyCap: googlePlaceEnrichmentDailyCap("basic"), note: "One deliberate, uncached basic refresh. A known Place ID uses Place Details Enterprise ($20/1k); a missing ID uses Text Search Enterprise ($35/1k). The dollar estimate conservatively uses the higher rate and does not pretend the two SKU free tiers are one pool." },
  { key: "budget_google_place_enrich_experience", label: "Google place experience", billing: "unit-estimate", per1000: 40, rateLabel: "$25–$40", dailyCap: googlePlaceEnrichmentDailyCap("experience"), note: "One user-requested rich context lookup. A known Place ID uses Enterprise + Atmosphere ($25/1k); identity search uses Text Search Enterprise + Atmosphere ($40/1k). The estimate uses the higher rate." },
  { key: "budget_google_business_status", label: "Google business status", billing: "unit-estimate", per1000: 17, freeMonthly: 5_000, dailyCap: 40, note: "Manual status-only diagnostic, unscheduled because the hours refresh already receives business status in the same paid Place Details request. If an operator runs it, the shared counter prevents retries from reopening the fixed 40-call Eastern-day allowance." },
  { key: "budget_google_hours_refresh", label: "Google hours refresh", billing: "unit-estimate", per1000: 20, freeMonthly: 1_000, dailyCap: googleHoursRefreshDailyCap(), note: "Place Details Enterprise hours checks. One shared Eastern-day counter covers the scheduled bucket, retries, and authenticated cycleDay backfills; counter uncertainty blocks the paid call." },
  { key: "ask_model_call", label: "Ask model calls", billing: "guarded-attempt", dailyCap: askAiDailyCallLimit(), note: "One unit is reserved immediately before each selected-provider turn, including every tool-agent step. These are guarded attempts, not a dollar estimate; the selected provider is the source of truth for tokens and cost." },
  { key: "ask_embedding", label: "Ask runtime embeddings", billing: "guarded-attempt", dailyCap: askAiEmbeddingDailyLimit(), note: "Optional direct-OpenAI semantic recall. One unit is reserved before each visitor-time embedding attempt; Postgres full-text results remain available when this path is off or unavailable." },
  { key: "radius_search_embedding", label: "Scheduled search vectors", billing: "guarded-attempt", dailyCap: radiusSearchEmbeddingDailyDocumentLimit(), note: "Optional direct-OpenAI index vectors. One unit is reserved for each document before a provider batch; the scheduled switch defaults off and Postgres full-text search remains the required baseline." },
  { key: "google_routes_matrix", label: "Google Routes matrix", billing: "unit-estimate", per1000: 10, freeMonthly: 5_000, dailyCap: googleRoutesDailyElementCap(), note: "Matrix elements, conservatively priced at the Pro rate and free tier. A place-sheet estimate uses one walking and one traffic-aware driving element after an explicit tap; device origins are never stored in Radius's persistent cache." },
  { key: "mapbox_directions", label: "Mapbox walking directions", billing: "unit-estimate", per1000: 2, dailyCap: mapboxDailyUsageCap("directions_request"), note: "One request is reserved only for a routed-leg cache miss. A dedicated switch or zero cap stops new provider work while a prior cached route can still answer." },
  { key: "mapbox_isochrone", label: "Mapbox isochrone", billing: "unit-estimate", per1000: 2, freeMonthly: 100_000, dailyCap: mapboxDailyUsageCap("isochrone_request"), note: "One request is reserved only for a polygon cache miss. Walk/bike results live for a day; traffic-aware driving results live for five minutes." },
  { key: "mapbox_matrix", label: "Mapbox travel matrix", billing: "unit-estimate", per1000: 2, freeMonthly: 100_000, dailyCap: mapboxDailyUsageCap("matrix_element"), note: "Each request reserves one Matrix element per place checked. Responses are not persisted; counter uncertainty or exhaustion keeps the local-distance estimate." },
  { key: "mapbox_search_box", label: "Mapbox Search Box fallback", billing: "unit-estimate", per1000: 11.5, freeMonthly: 2_500, dailyCap: mapboxDailyUsageCap("search_box_session"), note: "One unit is reserved when the server opens a lifecycle row. Retrieve, 180 seconds, or 50 suggestions closes that UUID permanently; missing lifecycle storage or an exhausted Eastern-day allowance blocks Mapbox without erasing the completed local result." },
  { key: "mapbox_geocode", label: "Mapbox permanent geocoding", billing: "unit-estimate", per1000: 5, dailyCap: mapboxDailyUsageCap("permanent_geocode"), note: "Permanent-result requests reserved only on a 30-day cache miss. Counter uncertainty or an exhausted Eastern-day allowance keeps the existing honest centroid instead of calling Mapbox." },
  { key: "mapbox_static", label: "Mapbox static maps", billing: "unit-estimate", per1000: 1, freeMonthly: 50_000, dailyCap: mapboxDailyUsageCap("static_request"), note: "One request is reserved only for an allowlisted locator-image cache miss. The bounded image is then cached for 30 days per rounded location." },
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
  { label: "Google Maps pricing", href: "https://developers.google.com/maps/billing-and-pricing/pricing" },
  { label: "Vercel AI Gateway usage", href: "https://vercel.com/dashboard/ai" },
  { label: "Anthropic direct usage", href: "https://console.anthropic.com/settings/usage" },
  { label: "Mapbox statistics", href: "https://account.mapbox.com/statistics" },
  { label: "Firecrawl usage", href: "https://www.firecrawl.dev/app" },
  { label: "Vercel usage", href: "https://vercel.com/dashboard/usage" },
];

function dayKeyEastern(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function envConfigured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function estimatedMonthlyCost(
  upstream: MeteredUpstream,
  calls: number,
): number | null {
  if (upstream.billing !== "unit-estimate") return null;
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

function CappedAttemptFigure({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  return (
    <div className="shrink-0 text-right">
      <p
        className="font-mono text-[14px] font-semibold leading-none tabular-nums"
        style={{
          color:
            limit > 0 && used >= limit
              ? "var(--app-brand-press)"
              : "var(--app-ink-2)",
        }}
      >
        {used.toLocaleString()} / {limit}
      </p>
      <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </p>
    </div>
  );
}

export default async function CostsAdmin() {
  const db = getDb();
  let rows: Array<{ day: string; upstream: string; count: number }> = [];
  let dbError = false;
  let searchDocumentCount = 0;
  let usageCounterUniqueIndexReady = false;
  let mapboxSearchSessionTableReady = false;
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
      const [row] = await rawSql<Array<{ ready: boolean }>>`
        select exists (
          select 1
          from pg_catalog.pg_index index_meta
          join pg_catalog.pg_class index_relation
            on index_relation.oid = index_meta.indexrelid
          join pg_catalog.pg_class table_relation
            on table_relation.oid = index_meta.indrelid
          join pg_catalog.pg_namespace table_namespace
            on table_namespace.oid = table_relation.relnamespace
          where table_namespace.nspname = 'public'
            and table_relation.relname = 'usage_counters'
            and index_relation.relname = 'usage_counters_day_upstream_uq'
            and index_meta.indisunique
            and index_meta.indisvalid
            and index_meta.indisready
            and index_meta.indislive
            and index_meta.indpred is null
            and index_meta.indexprs is null
            and index_meta.indnkeyatts = 2
            and pg_catalog.pg_get_indexdef(index_meta.indexrelid, 1, true) = 'day'
            and pg_catalog.pg_get_indexdef(index_meta.indexrelid, 2, true) = 'upstream'
        ) as ready
      `;
      usageCounterUniqueIndexReady = row?.ready === true;
    } catch {
      // The checklist must not claim atomic budgets when catalog inspection
      // is unavailable. Paid paths fail closed independently.
    }
    try {
      const [row] = await rawSql<Array<{ ready: boolean }>>`
        select to_regclass('public.mapbox_search_sessions') is not null as ready
      `;
      mapboxSearchSessionTableReady = row?.ready === true;
    } catch {
      // Search Box fails closed independently when its lifecycle table is not
      // available. Keep that missing prerequisite visible to the operator.
    }
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
      u.dailyCap !== undefined &&
      u.dailyCap > 0 &&
      todayCalls >= u.dailyCap;
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

  // Cost-control posture — read live from env so the checklist is honest.
  const googlePolicyApprovalRecorded = googleMapsWrittenApprovalConfirmed();
  const googlePlatformSwitchRequested =
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED === "1";
  const googleRoutesSwitchRequested =
    process.env.GOOGLE_ROUTES_ENABLED === "1";
  const googlePlatformRuntimeEnabled = googleMapsPlatformRuntimeEnabled();
  const googleRoutesEnabled = googleRoutesRuntimeEnabled();
  const googlePlacesCredentialConfigured = envConfigured(
    process.env.GOOGLE_PLACES_API_KEY,
  );
  const googlePlacesRuntimeReady =
    googlePlatformRuntimeEnabled && googlePlacesCredentialConfigured;
  const dedicatedGoogleRoutesConfigured = envConfigured(
    process.env.GOOGLE_ROUTES_API_KEY,
  );
  const googleRoutesRuntimeReady =
    googleRoutesEnabled && dedicatedGoogleRoutesConfigured;
  const googleGeocodingRequested =
    process.env.GOOGLE_GEOCODING_ENABLED === "1";
  const dedicatedGoogleGeocodingConfigured = envConfigured(
    process.env.GOOGLE_GEOCODING_API_KEY,
  );
  const googleGeocodingRuntimeReady =
    googlePlatformRuntimeEnabled &&
    googleGeocodingRequested &&
    dedicatedGoogleGeocodingConfigured;
  const anyGoogleRuntimeRequested =
    googlePlatformSwitchRequested ||
    googleRoutesSwitchRequested ||
    googleGeocodingRequested;
  const mapboxSearchBoxEnabled =
    process.env.MAPBOX_SEARCH_BOX_ENABLED === "1";
  const mapboxPermanentGeocodingEnabled =
    process.env.MAPBOX_GEOCODING_ENABLED === "1";
  const mapboxMatrixSwitchEnabled =
    process.env.MAPBOX_MATRIX_ENABLED === "1";
  const mapboxStaticSwitchEnabled =
    process.env.MAPBOX_STATIC_MAPS_ENABLED === "1";
  const mapboxDirectionsSwitchEnabled =
    process.env.MAPBOX_DIRECTIONS_ENABLED === "1";
  const mapboxIsochroneSwitchEnabled =
    process.env.MAPBOX_ISOCHRONE_ENABLED === "1";
  const mapboxServerTokenConfigured = envConfigured(
    process.env.MAPBOX_SERVER_TOKEN,
  );
  const mapboxMatrixElementCap = mapboxDailyUsageCap("matrix_element");
  const mapboxMatrixEnabled = mapboxMatrixRuntimeEnabled();
  const mapboxStaticRequestCap = mapboxDailyUsageCap("static_request");
  const mapboxDirectionsRequestCap = mapboxDailyUsageCap(
    "directions_request",
  );
  const mapboxIsochroneRequestCap = mapboxDailyUsageCap("isochrone_request");
  const mapboxStaticRuntimeEnabled = mapboxRequestRuntimeEnabled("static");
  const mapboxDirectionsRuntimeEnabled =
    mapboxRequestRuntimeEnabled("directions");
  const mapboxIsochroneRuntimeEnabled =
    mapboxRequestRuntimeEnabled("isochrone");
  const askRuntimeRequested = askAiRuntimeRequested();
  const askCallCap = askAiDailyCallLimit();
  const askSelectedProvider = askTextProvider();
  const askSelectedProviderConfigured =
    askTextProviderCredentialConfigured(askSelectedProvider);
  const askTextRuntimeConfigured = askTextGenerationRuntimeConfigured();
  const askEmbeddingRequested = askRuntimeEmbeddingsRequested();
  const askEmbeddingCap = askAiEmbeddingDailyLimit();
  const askEmbeddingRuntimeConfigured = askRuntimeEmbeddingsConfigured();
  const askOutputTokenCap = askAiMaxOutputTokens();
  const searchSemanticRequested = radiusSearchSemanticRequested();
  const searchSemanticCap = radiusSearchEmbeddingDailyDocumentLimit();
  const searchSemanticConfigured = radiusSearchSemanticConfigured();
  const eventGeocodeDailyCap = googleEventGeocodeDailyLimit();
  const sharedUsageCounterReady =
    Boolean(rawSql) && !dbError && usageCounterUniqueIndexReady;
  const mapboxSearchLifecycleReady =
    sharedUsageCounterReady && mapboxSearchSessionTableReady;
  const requestPricedMapboxControlsReady = [
    {
      requested: mapboxStaticSwitchEnabled,
      enabled: mapboxStaticRuntimeEnabled,
      cap: mapboxStaticRequestCap,
    },
    {
      requested: mapboxDirectionsSwitchEnabled,
      enabled: mapboxDirectionsRuntimeEnabled,
      cap: mapboxDirectionsRequestCap,
    },
    {
      requested: mapboxIsochroneSwitchEnabled,
      enabled: mapboxIsochroneRuntimeEnabled,
      cap: mapboxIsochroneRequestCap,
    },
  ].every(
    ({ requested, enabled, cap }) =>
      !requested || cap === 0 || (enabled && sharedUsageCounterReady),
  );
  const anyRequestPricedMapboxRuntimeRequested = [
    {
      requested: mapboxStaticSwitchEnabled,
      cap: mapboxStaticRequestCap,
    },
    {
      requested: mapboxDirectionsSwitchEnabled,
      cap: mapboxDirectionsRequestCap,
    },
    {
      requested: mapboxIsochroneSwitchEnabled,
      cap: mapboxIsochroneRequestCap,
    },
  ].some(({ requested, cap }) => requested && cap > 0);
  const anyMapboxPaidRuntimeRequested =
    mapboxSearchBoxEnabled ||
    mapboxPermanentGeocodingEnabled ||
    mapboxMatrixEnabled ||
    mapboxStaticRuntimeEnabled ||
    mapboxDirectionsRuntimeEnabled ||
    mapboxIsochroneRuntimeEnabled;
  const controls: CostControl[] = [
    {
      label: "Rate limiting (Vercel KV)",
      state:
        process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
          ? "active"
          : "attention",
      why: "Without KV, a bounded per-instance fallback still limits each warm worker, but it cannot coordinate across serverless workers. KV remains the preferred distributed layer; guarded paid paths also keep their atomic daily budgets.",
    },
    {
      label: "Google Maps policy approval",
      state: googlePolicyApprovalRecorded
        ? "active"
        : anyGoogleRuntimeRequested
          ? "attention"
          : "off",
      why: googlePolicyApprovalRecorded
        ? "The exact written-authorization marker is recorded. Runtime APIs still require their separate switches and least-privilege credentials."
        : anyGoogleRuntimeRequested
          ? "A Google runtime switch was requested without the written-authorization marker. The code-level hold blocks the call until that mismatch is corrected."
          : "No Google runtime is requested. The policy hold safely prevents maintenance, Routes, and geocoding calls even when credentials exist.",
    },
    {
      label: "Google Places runtime",
      state: googlePlacesRuntimeReady
        ? "active"
        : googlePlatformSwitchRequested
          ? "attention"
          : "off",
      why: googlePlacesRuntimeReady
        ? "Places runtime is explicitly authorized and uses its dedicated credential. Provider quotas and billing alerts remain the source-of-truth controls."
        : googlePlatformSwitchRequested
          ? "Places runtime was requested, but policy approval or the dedicated Places credential is missing. Maintenance calls remain unavailable."
          : "Places maintenance is held off. Existing credentials alone cannot activate hours, status, or enrichment. Current photo delivery is managed separately.",
    },
    {
      label: "Dedicated Google Routes runtime",
      state: googleRoutesRuntimeReady
        ? "active"
        : googleRoutesSwitchRequested
          ? "attention"
          : "off",
      why: googleRoutesRuntimeReady
        ? "Routes is explicitly authorized and uses only GOOGLE_ROUTES_API_KEY. Results are not persisted and upstream failures keep the local-distance fallback."
        : googleRoutesSwitchRequested
          ? "Routes was requested, but policy approval, the platform switch, or its dedicated credential is missing. There is no Places-key fallback, so no paid request is made."
          : "Routes is held off. A dedicated key alone cannot activate it, and callers keep their local-distance or unavailable state.",
    },
    {
      label: "Google event-geocoding isolation",
      state: googleGeocodingRuntimeReady
        ? "active"
        : googleGeocodingRequested
          ? "attention"
          : "off",
      why: googleGeocodingRuntimeReady
        ? "The official County address service remains first. The separately authorized Google fallback uses only GOOGLE_GEOCODING_API_KEY and keeps a maximum 30-day coordinate cache."
        : googleGeocodingRequested
          ? "Google geocoding was requested, but policy approval, the platform switch, or its dedicated key is missing. Official County, trusted catalog, and cache coordinates continue to publish."
          : "Google event geocoding is held off. The official Frederick County address lookup remains available without a Google request.",
    },
    {
      label: "Google event-geocode daily breaker",
      state:
        !googleGeocodingRequested || eventGeocodeDailyCap === 0
          ? "off"
          : googleGeocodingRuntimeReady && sharedUsageCounterReady
            ? "active"
            : "attention",
      why:
        !googleGeocodingRequested
          ? "Paid event geocoding is not requested. Official County, trusted catalog, and current cache coordinates remain available."
          : eventGeocodeDailyCap === 0
          ? `Paid event geocoding is disabled. Set GOOGLE_EVENT_GEOCODE_DAILY_LIMIT from 1 to ${MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT} only after the policy and runtime gates are satisfied.`
          : googleGeocodingRuntimeReady && sharedUsageCounterReady
            ? `The app allows at most ${eventGeocodeDailyCap} unique cache-miss event addresses per Eastern day (code maximum ${MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT}). Duplicate addresses are denied until the current provider result reaches the cache.`
            : "Paid geocoding was requested, but its runtime prerequisites or the atomic database counter are unavailable. It fails closed while official County, trusted catalog, and current cache coordinates remain available.",
    },
    {
      label: "Scheduled search-vector budget",
      state:
        !searchSemanticRequested || searchSemanticCap === 0
          ? "off"
          : searchSemanticConfigured && sharedUsageCounterReady
            ? "active"
            : "attention",
      why:
        !searchSemanticRequested || searchSemanticCap === 0
          ? "Scheduled semantic vectors are held off. The required Postgres full-text index still refreshes without OpenAI spend."
          : !searchSemanticConfigured
            ? "Scheduled vectors were requested, but direct OpenAI or a positive document allowance is missing. Full-text indexing continues."
            : sharedUsageCounterReady
              ? `Each document is reserved before its provider batch under a ${searchSemanticCap.toLocaleString()}-document Eastern-day cap (code maximum ${MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT.toLocaleString()}).`
              : "The semantic switch is on, but the shared counter or its unique index is unavailable. OpenAI stays untouched and full-text indexing continues.",
    },
    {
      label: "Public Ask model budget",
      state:
        !askRuntimeRequested || askCallCap === 0
          ? "off"
          : askTextRuntimeConfigured && sharedUsageCounterReady
            ? "active"
            : "attention",
      why: !askRuntimeRequested || askCallCap === 0
        ? "Public model calls are held off. Cached responses and deterministic Frederick answers remain available without provider spend."
        : !askSelectedProvider
          ? "ASK_AI_PROVIDER contains an unsupported value. Use gateway, anthropic, or openai. Model calls fail closed until the setting is corrected."
          : !askSelectedProviderConfigured
          ? `ASK_AI_PROVIDER selects ${askSelectedProvider}, but that provider's credential is missing. Radius does not borrow another provider.`
          : sharedUsageCounterReady
            ? `The selected ${askSelectedProvider} path reserves every provider turn under a ${askCallCap.toLocaleString()}-call Eastern-day cap (code maximum ${MAX_ASK_AI_DAILY_CALL_LIMIT.toLocaleString()}).`
            : "The runtime switch and provider are configured, but the shared counter or its unique index is unavailable. Model calls fail closed while local answers continue.",
    },
    {
      label: "Ask runtime embedding budget",
      state:
        !askEmbeddingRequested || askEmbeddingCap === 0
          ? "off"
          : askEmbeddingRuntimeConfigured && sharedUsageCounterReady
            ? "active"
            : "attention",
      why: !askEmbeddingRequested || askEmbeddingCap === 0
        ? "Visitor-time semantic embeddings are held off. Postgres full-text retrieval remains available."
        : !askEmbeddingRuntimeConfigured
          ? "Runtime semantic recall was requested, but direct OpenAI, hybrid search, or a nonzero cap is missing. Full-text retrieval remains available."
          : sharedUsageCounterReady
            ? `Each runtime embedding reserves one unit under a ${askEmbeddingCap.toLocaleString()}-attempt Eastern-day cap (code maximum ${MAX_ASK_AI_EMBEDDING_DAILY_LIMIT.toLocaleString()}).`
            : "The runtime embedding switch is on, but the shared counter is unavailable. OpenAI stays untouched and full-text retrieval remains available.",
    },
    {
      label: "Ask output and retry bounds",
      state: "active",
      why: `Every generation path is capped at ${askOutputTokenCap.toLocaleString()} output tokens, the tool loop stops after five steps, and SDK retries are zero so one reservation cannot hide another provider attempt.`,
    },
    {
      label: "Mapbox server-only credential",
      state: !anyMapboxPaidRuntimeRequested
        ? "off"
        : mapboxServerTokenConfigured
          ? "active"
          : "attention",
      why: !anyMapboxPaidRuntimeRequested
        ? "All paid Mapbox server features are off. A dedicated least-privilege token is only required before one is enabled."
        : mapboxServerTokenConfigured
        ? "Paid server routes use only MAPBOX_SERVER_TOKEN. They never fall back to the publishable token shipped in browser JavaScript."
        : "A paid Mapbox switch is on, but the dedicated server token is missing. New provider work fails closed; the public browser token is never used as a substitute.",
    },
    {
      label: "Mapbox locator and reach breakers",
      state: !anyRequestPricedMapboxRuntimeRequested
        ? "off"
        : requestPricedMapboxControlsReady && mapboxServerTokenConfigured
          ? "active"
          : "attention",
      why: !anyRequestPricedMapboxRuntimeRequested
        ? "Static Images, walking Directions, and Isochrone are off or held at a zero cap. Existing cache hits and local results remain available."
        : requestPricedMapboxControlsReady && mapboxServerTokenConfigured
        ? `Static Images, walking Directions, and Isochrone each have a dedicated switch plus Eastern-day request caps of ${mapboxStaticRequestCap.toLocaleString()}, ${mapboxDirectionsRequestCap.toLocaleString()}, and ${mapboxIsochroneRequestCap.toLocaleString()}. Cache hits remain available without a reservation.`
        : "A request-priced Mapbox path is enabled without its server credential or shared atomic counter. New cache misses fail closed before Mapbox until both are available.",
    },
    {
      label: "Mapbox Matrix global breaker",
      state: !mapboxMatrixEnabled
        ? "off"
        : mapboxServerTokenConfigured && sharedUsageCounterReady
          ? "active"
          : "attention",
      why: mapboxMatrixEnabled && mapboxServerTokenConfigured && sharedUsageCounterReady
        ? `Ask, map search, and Within reach share the ${mapboxMatrixElementCap.toLocaleString()}-element Eastern-day cap. Matrix responses are not persisted.`
        : !mapboxMatrixEnabled
          ? mapboxMatrixSwitchEnabled && mapboxMatrixElementCap === 0
          ? "The Matrix switch is on, but its zero-element cap deliberately disables every Matrix path without removing the token. Local distance estimates remain available."
            : "Every Matrix path stays off unless MAPBOX_MATRIX_ENABLED is 1. Local distance estimates remain available."
          : "Matrix was enabled, but its server credential or atomic counter is unavailable. Provider work fails closed while local distance estimates remain available.",
    },
    {
      label: "Atomic Mapbox daily budgets",
      state: !anyMapboxPaidRuntimeRequested
        ? "off"
        : sharedUsageCounterReady
          ? "active"
          : "attention",
      why: !anyMapboxPaidRuntimeRequested
        ? "No paid Mapbox server feature is active, so no provider allowance can be spent. The counter must be verified before enabling one."
        : sharedUsageCounterReady
        ? `The shared database counter and its unique day/upstream index are available. Search Box, permanent geocoding, Matrix, Static Images, Directions, and Isochrone reserve atomically in their billed session, request, or element units before uncached work.`
        : "The shared counter or its required unique day/upstream index is unavailable. Guarded paid requests fail closed until both are restored; cache hits and local fallbacks remain available.",
    },
    {
      label: "Mapbox Search Box lifecycle",
      state: !mapboxSearchBoxEnabled
        ? "off"
        : mapboxSearchLifecycleReady && mapboxServerTokenConfigured
          ? "active"
          : "attention",
      why: !mapboxSearchBoxEnabled
        ? "Search Box is off. Apply and verify migration 0045 before enabling it so every paid session has a server-owned lifecycle."
        : mapboxSearchLifecycleReady && mapboxServerTokenConfigured
        ? "The hashed session ledger is available. A UUID closes after retrieve, 180 seconds, or 50 suggestions, and cannot reopen a paid provider session."
        : "Search Box is switched on, but its server credential, migration 0045, or the shared daily counter is unavailable. The fallback fails closed before Mapbox until all are verified.",
    },
    {
      label: "Mapbox permanent-geocoding switch",
      state: !mapboxPermanentGeocodingEnabled
        ? "off"
        : mapboxServerTokenConfigured && sharedUsageCounterReady
          ? "active"
          : "attention",
      why: !mapboxPermanentGeocodingEnabled
        ? "Stored address enrichment is off. Cache hits and official or local sources do not need it."
        : mapboxServerTokenConfigured && sharedUsageCounterReady
          ? "Permanent geocoding is enabled with its server credential and shared atomic allowance."
          : "Permanent geocoding was enabled without its server credential or shared atomic allowance. New provider work fails closed.",
    },
    {
      label: "Mapbox Search Box switch",
      state: !mapboxSearchBoxEnabled
        ? "off"
        : mapboxServerTokenConfigured && mapboxSearchLifecycleReady
          ? "active"
          : "attention",
      why: !mapboxSearchBoxEnabled
        ? "The paid fallback is off. Radius search still completes locally."
        : mapboxServerTokenConfigured && mapboxSearchLifecycleReady
          ? "The paid fallback is enabled only after local Radius search, with its server-owned session lifecycle available."
          : "The paid fallback was enabled without its server credential or session lifecycle. It fails closed after local Radius search.",
    },
    {
      label: "Hybrid search index",
      state: searchDocumentCount > 0 ? "active" : "attention",
      why: searchDocumentCount > 0
        ? `${searchDocumentCount.toLocaleString()} local records are available to meaning + exact-match retrieval.`
        : "Apply migration 0025, then run npm run build:radius-search once.",
    },
  ];

  return (
    <AdminShell
      eyebrow="Operations"
      title="Usage costs"
      intro={
        <>
          The app&rsquo;s own tally of paid calls and capped recovery attempts.
          Metered services use rough unit estimates; attempt counters stay
          separate from provider credits and bills. Provider consoles remain
          the source of truth.
        </>
      }
    >
      {dbError && (
        <div className="mt-6">
          <Notice tone="warning">
            The usage_counters table isn&rsquo;t migrated yet. Run
            <code className="mx-1">drizzle/0017_usage_counters.sql</code> in the Supabase
            SQL editor, then reload. Counters start filling as soon as it exists.
          </Notice>
        </div>
      )}
      {!dbError && rawSql && !usageCounterUniqueIndexReady && (
        <div className="mt-6">
          <Notice tone="warning">
            The usage counter can be read, but its required unique day/upstream
            index could not be verified. Run
            <code className="mx-1">drizzle/0017_usage_counters.sql</code> in the Supabase
            SQL editor before enabling paid paths; they fail closed without it.
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
                      today {d1.toLocaleString()}
                      {u.billing === "unit-estimate" && u.dailyCap !== undefined && (
                        <span> / {u.dailyCap.toLocaleString()} cap</span>
                      )}
                      {" · "}7d {d7.toLocaleString()} · 30d {d30.toLocaleString()}
                      {u.billing === "unit-estimate" ? (
                        <span style={{ color: "var(--app-ink-3)" }}>
                          {u.rateLabel
                            ? ` · ${u.rateLabel}/1k`
                            : ` · ~$${u.per1000}/1k`}
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-ink-3)" }}>
                          {u.billing === "plan-credit"
                            ? " · recovery attempts"
                            : " · reserved provider units"}
                          {" · hard cap "}{u.dailyCap}/day
                        </span>
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
                  {u.billing === "unit-estimate" ? (
                    <EstimateFigure est={est30 ?? 0} />
                  ) : (
                    <CappedAttemptFigure
                      used={d1}
                      limit={u.dailyCap}
                      label={u.billing === "plan-credit" ? "recovery attempts today" : "reserved units today"}
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
          {controls.map((c, i) => {
            const status = CONTROL_STATUS[c.state];
            return (
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
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </div>
              </li>
            );
          })}
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
        Counts record validated paid fetch attempts. Cache-aware paths exclude
        cache hits; a few older fetch-cache counters remain an upper bound.
        Providers can still reject or fail an attempted call, so their consoles
        remain the billing source of truth. Unit prices are estimates pinned in
        code (src/app/admin/costs/page.tsx); update them when provider pricing
        changes. Firecrawl recovery and the guarded Ask model/embedding rows
        are excluded from dollar totals: a recovery attempt is not necessarily
        a provider credit, and AI cost depends on the selected model plus input
        and output tokens rather than a flat call price. The month
        projection extends what has already been spent at the median daily rate
        of the last seven full days, so one spiky day does not distort it.
      </p>
    </AdminShell>
  );
}
