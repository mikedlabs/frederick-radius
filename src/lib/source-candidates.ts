import { createHash } from "node:crypto";
import { getSql } from "@/lib/db/client";

export type SourceCandidateProvider = "tavily" | "firecrawl" | "apify";
export type SourceCandidateKind =
  | "event-source"
  | "food-truck-source"
  | "business-source"
  | "civic-source"
  | "general-source";
export type SourceCandidateDecision = "approved" | "rejected" | "published";

export type SourceCandidate = {
  key: string;
  provider: SourceCandidateProvider;
  kind: SourceCandidateKind;
  title: string;
  url: string;
  sourceDomain: string;
  observedAt: string;
  expiresAt: string;
  confidence: number;
  reviewFor: string[];
  status: string;
  sourceId?: string;
  profileId?: string;
  queryId?: string;
  details: Record<string, unknown>;
};

export type SourceCandidateReviewRow = SourceCandidate & {
  observationKey: string;
  decisionKey: string;
  decision: SourceCandidateDecision | null;
  decidedAt: string | null;
  firstObservedAt: string;
  observationCount: number;
  expired: boolean;
};

export type SourceCandidateReviewState =
  | { available: true; rows: SourceCandidateReviewRow[] }
  | { available: false; rows: []; reason: string };

export type SourceCandidateIntegrationHandoff = {
  mode: "new-adapter" | "source-change";
  title: string;
  markdown: string;
};

type UnknownRecord = Record<string, unknown>;

const MAX_REPORT_CANDIDATES = 500;
const MAX_DETAILS_BYTES = 16_000;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown, max = 2_000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => asString(entry, 120))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).slice(0, 12);
}

function asIso(value: unknown, fallback: string): string {
  const text = asString(value, 80);
  const time = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function expiresAfter(observedAt: string, days: number): string {
  return new Date(Date.parse(observedAt) + days * 86_400_000).toISOString();
}

function asPublicUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function confidence(value: unknown, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, Math.round(number * 1_000) / 1_000));
}

function classify(labels: readonly string[]): SourceCandidateKind {
  const text = labels.join(" ").toLowerCase();
  if (/food[ -]?truck|mobile food/.test(text)) return "food-truck-source";
  if (/event|calendar|lineup|venue|festival/.test(text)) return "event-source";
  if (/business|restaurant|opening|closing|commerce/.test(text)) return "business-source";
  if (/civic|government|municipal|county|city/.test(text)) return "civic-source";
  return "general-source";
}

function candidateKey(
  provider: SourceCandidateProvider,
  kind: SourceCandidateKind,
  url: string,
  sourceId = "",
): string {
  return createHash("sha256")
    .update(`${provider}\0${kind}\0${sourceId}\0${url}`)
    .digest("hex");
}

function boundedDetails(value: UnknownRecord): UnknownRecord {
  return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_DETAILS_BYTES
    ? value
    : { truncated: true };
}

function unique(candidates: SourceCandidate[]): SourceCandidate[] {
  const byKey = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const prior = byKey.get(candidate.key);
    if (!prior || candidate.confidence > prior.confidence) byKey.set(candidate.key, candidate);
  }
  return [...byKey.values()];
}

const HANDOFF_LANES: Record<SourceCandidateKind, string> = {
  "event-source": "event inventory",
  "food-truck-source": "food-truck schedules",
  "business-source": "business facts",
  "civic-source": "civic information",
  "general-source": "local information",
};

function markdownText(value: string): string {
  // Provider titles and labels are untrusted text that will be pasted into a
  // GitHub-flavored Markdown surface. Strip formatting/control characters and
  // mentions so a discovered page cannot reshape the brief or notify people.
  return value
    .replace(/\s+/g, " ")
    .replace(/[`*_{}\[\]<>#|@]/g, "")
    .trim();
}

function handoffDetailList(
  value: unknown,
  limit = 8,
): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map(markdownText)
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

/**
 * Turn an owner's approval into an implementation-ready handoff. The brief is
 * deliberately deterministic and contains only source metadata already in the
 * review row. It authorizes adapter/reverification work, never publication of
 * a provider summary or an unverified claim.
 */
export function buildSourceCandidateIntegrationHandoff(
  row: SourceCandidateReviewRow,
): SourceCandidateIntegrationHandoff {
  const mode = row.provider === "tavily" ? "new-adapter" : "source-change";
  const name = markdownText(row.title) || row.sourceDomain;
  const lane = HANDOFF_LANES[row.kind];
  const changedFields = handoffDetailList(row.details.changedFields);
  const parsingWarnings = handoffDetailList(row.details.parsingWarnings);
  const sourceId = row.sourceId ? markdownText(row.sourceId) : null;
  const reviewReason = row.reviewFor.map(markdownText).filter(Boolean);
  const title = mode === "new-adapter"
    ? `Integrate ${name} as a Radius ${lane} source`
    : `Reverify ${name} source change`;

  const evidence = [
    `- Original source: ${row.url}`,
    `- Data lane: ${lane}`,
    `- Discovery signal: ${row.provider} / ${markdownText(row.status)}`,
    `- Observed: ${row.observedAt}`,
    `- Discovery confidence: ${Math.round(row.confidence * 100)}%`,
    `- Review decision: approved for integration${row.decidedAt ? ` on ${row.decidedAt}` : ""}`,
    `- Candidate decision key: \`${row.decisionKey}\``,
    ...(sourceId ? [`- Existing source ID: \`${sourceId}\``] : []),
    ...(reviewReason.length ? [`- Review for: ${reviewReason.join(", ")}`] : []),
    ...(changedFields.length ? [`- Changed areas reported: ${changedFields.join(", ")}`] : []),
    ...(parsingWarnings.length ? [`- Parser warnings: ${parsingWarnings.join(", ")}`] : []),
    ...(row.expired ? ["- Freshness: candidate expired; re-open the original source before implementation"] : []),
  ];

  const work = mode === "new-adapter"
    ? [
        "1. Open the original source and confirm its owner, scope, reuse terms, update cadence, and stable canonical URL.",
        "2. Add the source to `data/sources.yaml` and implement the smallest deterministic adapter under the matching integration lane.",
        "3. Preserve the original URL, source label, checked time, and source record identity through normalization.",
        "4. Add bounded fixtures and tests for a successful response, a valid empty response, malformed input, and a stale or unavailable source.",
      ]
    : [
        "1. Open the original source and compare the reported change with the last trusted Radius snapshot or adapter output.",
        "2. Treat the provider fingerprint as a review cue only. Verify the exact changed fact at the original source.",
        "3. Update the deterministic adapter, source snapshot, or canonical correction that owns the verified field.",
        "4. Add or update a regression fixture covering this change plus empty, malformed, and unavailable responses.",
      ];

  const markdown = [
    `# ${title}`,
    "",
    "## Reviewed source",
    ...evidence,
    "",
    "## Implementation",
    ...work,
    "",
    "## Acceptance checks",
    "- Show evidence at every stage: fetched, parsed, normalized, accepted, published, and publicly returned.",
    "- Deduplicate against current Radius records and preserve municipality, time zone, and source attribution.",
    "- Keep collection in a bounded background job; do not add paid-provider calls to a visitor request path.",
    "- Record an honest empty, stale, or unavailable state instead of silently falling back to a misleading result.",
    "- Update the source ledger and trust copy only after the adapter is active and its public output is verified.",
    "",
    "## Publication guardrail",
    "This approval authorizes integration work only. Do not publish provider summaries, model-written claims, changed fingerprints, or any other unverified fact. Only original-source facts that pass the normal Radius verification and freshness rules may reach the app.",
  ].join("\n");

  return { mode, title, markdown };
}

/**
 * Distinguish a valid empty provider report from arbitrary parsed JSON. A
 * workflow may advance its comparison state only after one of these bounded
 * report contracts was recognized and durably handled.
 */
export function sourceCandidateReportProvider(
  value: unknown,
): SourceCandidateProvider | null {
  const report = asRecord(value);
  const provider = asString(asRecord(report?.provider)?.name, 40)?.toLowerCase();
  const generatedAt = asString(report?.generatedAt, 80);
  if (!report || !generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    return null;
  }
  if (
    provider === "tavily"
    && Array.isArray(report.queries)
    && report.queries.every((value) => {
      const query = asRecord(value);
      return Boolean(
        query
        && asString(query.status, 60)
        && Array.isArray(query.candidates)
        && query.candidates.every((candidateValue) => {
          const candidate = asRecord(candidateValue);
          return Boolean(
            candidate
            && asPublicUrl(candidate.url ?? candidate.originalSourceUrl)
            && asString(candidate.title, 240),
          );
        }),
      );
    })
  ) return "tavily";
  if (
    provider === "firecrawl"
    && Array.isArray(report.candidates)
    && report.candidates.every((value) => {
      const candidate = asRecord(value);
      const source = asRecord(candidate?.source);
      return Boolean(
        candidate
        && source
        && asString(candidate.status, 60)
        && asString(source.id, 120)
        && asString(source.name, 240)
        && asPublicUrl(candidate.finalUrl ?? source.url),
      );
    })
  ) return "firecrawl";
  if (
    provider === "apify"
    && Array.isArray(report.results)
    && report.results.every((value) => {
      const result = asRecord(value);
      const source = asRecord(result?.source);
      return Boolean(
        result
        && source
        && asString(result.status, 60)
        && asString(source.id, 120)
        && asString(source.name, 240)
        && asPublicUrl(result.finalUrl ?? source.url),
      );
    })
  ) return "apify";
  return null;
}

/** Convert every review-only provider report into one bounded queue shape. */
export function candidatesFromSourceReport(
  value: unknown,
  now = new Date(),
): SourceCandidate[] {
  const report = asRecord(value);
  if (!report) return [];
  const generatedAt = asIso(report.generatedAt, now.toISOString());
  const provider = sourceCandidateReportProvider(report);
  const output: SourceCandidate[] = [];

  if (provider === "tavily") {
    for (const queryValue of Array.isArray(report.queries) ? report.queries : []) {
      const query = asRecord(queryValue);
      if (!query) continue;
      const profileId = asString(query.profileId, 120) ?? "unknown-profile";
      const queryId = asString(query.queryId, 120) ?? "unknown-query";
      const defaultLabels = asStrings(query.reviewFor);
      for (const itemValue of Array.isArray(query.candidates) ? query.candidates : []) {
        const item = asRecord(itemValue);
        if (!item) continue;
        const url = asPublicUrl(item.url ?? item.originalSourceUrl);
        if (!url) continue;
        const itemLabels = asStrings(item.reviewFor);
        const reviewFor = itemLabels.length ? itemLabels : defaultLabels;
        const kind = classify(reviewFor);
        const observedAt = asIso(item.observedAt, generatedAt);
        output.push({
          key: candidateKey("tavily", kind, url), provider: "tavily", kind,
          title: asString(item.title, 240) ?? domainOf(url), url,
          sourceDomain: domainOf(url), observedAt,
          expiresAt: expiresAfter(observedAt, 30),
          confidence: confidence(item.score, 0.5), reviewFor,
          status: asString(query.status, 60) ?? "fetched", profileId, queryId,
          details: boundedDetails({ queryText: asString(query.queryText, 500) }),
        });
        if (output.length >= MAX_REPORT_CANDIDATES) return unique(output);
      }
    }
    return unique(output);
  }

  if (provider === "firecrawl") {
    for (const itemValue of Array.isArray(report.candidates) ? report.candidates : []) {
      const item = asRecord(itemValue);
      const source = asRecord(item?.source);
      if (!item || !source) continue;
      const status = asString(item.status, 60) ?? "changed";
      if (status === "same") continue;
      const url = asPublicUrl(item.finalUrl ?? source.url);
      if (!url) continue;
      const reviewFor = asStrings([source.category, source.purpose]);
      const kind = classify(reviewFor);
      const observedAt = asIso(item.checkedAt, generatedAt);
      const sourceId = asString(source.id, 120) ?? domainOf(url);
      output.push({
        key: candidateKey("firecrawl", kind, url, sourceId), provider: "firecrawl", kind,
        title: asString(source.name, 240) ?? domainOf(url), url,
        sourceDomain: domainOf(url), observedAt,
        expiresAt: expiresAfter(observedAt, 14),
        confidence: status === "changed" || status === "removed" ? 0.8 : 0.45,
        reviewFor, status, sourceId,
        details: boundedDetails({
          category: asString(source.category, 120),
          purpose: asString(source.purpose, 500),
          previousHash: asString(item.previousHash, 128),
          currentHash: asString(item.currentHash, 128),
          errorCode: asString(item.errorCode, 120),
          httpStatus: typeof item.httpStatus === "number" ? item.httpStatus : null,
        }),
      });
      if (output.length >= MAX_REPORT_CANDIDATES) break;
    }
    return unique(output);
  }

  if (provider === "apify") {
    const expiresAt = asIso(
      asRecord(report.reviewQueue)?.expiresAt,
      expiresAfter(generatedAt, 14),
    );
    for (const itemValue of Array.isArray(report.results) ? report.results : []) {
      const item = asRecord(itemValue);
      const source = asRecord(item?.source);
      if (!item || !source) continue;
      const status = asString(item.status, 60) ?? "unknown";
      if (status === "unchanged" || status === "baseline") continue;
      const url = asPublicUrl(item.finalUrl ?? source.url);
      if (!url) continue;
      const reviewFor = asStrings([source.category, source.purpose, "event calendar"]);
      const kind = classify(reviewFor);
      const observedAt = asIso(item.collectedAt, generatedAt);
      const sourceId = asString(source.id, 120) ?? domainOf(url);
      const level = asString(item.confidence, 20);
      const fingerprint = asRecord(item.fingerprint);
      output.push({
        key: candidateKey("apify", kind, url, sourceId), provider: "apify", kind,
        title: asString(source.name, 240) ?? domainOf(url), url,
        sourceDomain: domainOf(url), observedAt, expiresAt,
        confidence: level === "high" ? 0.9 : level === "medium" ? 0.7 : 0.45,
        reviewFor, status, sourceId,
        details: boundedDetails({
          town: asString(item.town, 120),
          changedFields: asStrings(item.changedFields),
          parsingWarnings: asStrings(item.parsingWarnings),
          contentHash: asString(fingerprint?.contentHash, 64),
          error: asRecord(item.error),
        }),
      });
      if (output.length >= MAX_REPORT_CANDIDATES) break;
    }
    return unique(output);
  }

  return [];
}

function jsonText(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError("Source candidate must be serializable.");
  return text;
}

export function sourceCandidateObservationKey(
  candidate: SourceCandidate,
): string {
  // A source can change more than once in one day. Keying only by calendar
  // date would silently discard the second change, while this bounded content
  // fingerprint keeps an exact workflow retry idempotent.
  const contentHash = createHash("sha256")
    .update(jsonText(candidate))
    .digest("hex");
  return `${candidate.key}:${contentHash.slice(0, 24)}`;
}

export function sourceCandidateDecisionKey(
  candidate: SourceCandidate,
): string {
  // Collection time and review expiry are evidence metadata, not a material
  // change. Tavily's fetched/cache status and relevance score are delivery
  // metadata too: either can drift between identical searches without the
  // underlying source changing. Keep an owner's decision across that noise.
  // Firecrawl and Apify statuses remain material because changed, removed,
  // error, and new represent different source observations.
  const material = candidate.provider === "tavily"
    ? {
        key: candidate.key,
        provider: candidate.provider,
        kind: candidate.kind,
        title: candidate.title,
        url: candidate.url,
        sourceDomain: candidate.sourceDomain,
        reviewFor: candidate.reviewFor,
        sourceId: candidate.sourceId,
        profileId: candidate.profileId,
        queryId: candidate.queryId,
        details: candidate.details,
      }
    : {
        ...candidate,
        observedAt: undefined,
        expiresAt: undefined,
      };
  const materialHash = createHash("sha256")
    .update(jsonText(material))
    .digest("hex");
  return `${candidate.key}:${materialHash.slice(0, 24)}`;
}

export async function persistSourceCandidates(
  candidates: readonly SourceCandidate[],
): Promise<{ inserted: number; skipped: number }> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required to persist source candidates.");
  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates.slice(0, MAX_REPORT_CANDIDATES)) {
    const decisionKey = sourceCandidateDecisionKey(candidate);
    const payload = {
      ...candidate,
      key: undefined,
      observedAt: undefined,
      expiresAt: undefined,
      confidence: undefined,
      decisionKey,
    };
    const contentHash = createHash("sha256").update(jsonText(candidate)).digest("hex");
    const observationKey = sourceCandidateObservationKey(candidate);
    const rows = await sql`
      insert into field_observations (
        source_key, observation_key, entity_kind, entity_key, field_name,
        value_status, observed_value, evidence_kind, verification_status,
        confidence, source_record_id, source_url, observed_at, checked_at,
        valid_until, content_hash, provenance
      ) values (
        ${`source-intelligence:${candidate.provider}`}, ${observationKey},
        'source-candidate', ${candidate.key}, 'discovery', 'asserted',
        ${jsonText(payload)}::jsonb, 'provider_api', 'unverified',
        ${candidate.confidence},
        ${candidate.sourceId ?? candidate.profileId ?? candidate.queryId ?? null},
        ${candidate.url}, ${candidate.observedAt}, ${candidate.observedAt},
        ${candidate.expiresAt}, ${contentHash},
        ${jsonText({ reviewOnly: true, automaticPublishing: false })}::jsonb
      )
      on conflict (source_key, observation_key) do nothing
      returning id
    `;
    if (rows.length) inserted += 1;
    else skipped += 1;
  }
  return { inserted, skipped };
}

export async function loadSourceCandidateReviewRows(): Promise<SourceCandidateReviewState> {
  const sql = getSql();
  if (!sql) {
    return {
      available: false,
      rows: [],
      reason: "The source inbox database is not configured.",
    };
  }
  try {
    const rows = (await sql`
      with latest as (
        select distinct on (fo.entity_key)
          fo.entity_key, fo.observation_key, fo.observed_value,
          coalesce(
            nullif(fo.observed_value ->> 'decisionKey', ''),
            fo.observation_key
          ) as decision_key,
          fo.confidence, fo.observed_at,
          fo.valid_until, fo.valid_until <= now() as expired,
          min(fo.observed_at) over (partition by fo.entity_key) as first_observed_at,
          count(*) over (partition by fo.entity_key) as observation_count
        from field_observations fo
        where fo.entity_kind = 'source-candidate' and fo.field_name = 'discovery'
        order by fo.entity_key, fo.observed_at desc, fo.id desc
      )
      select latest.*, cd.decision, cd.decided_at
      from latest
      left join curation_decisions cd
        on cd.tool = 'source-candidate'
       and cd.target_id = latest.decision_key
       and cd.field = ''
      order by case when cd.decision is null then 0 else 1 end, latest.observed_at desc
      limit 500
    `) as Array<{
      entity_key: string; observation_key: string; decision_key: string;
      observed_value: UnknownRecord; confidence: string | number;
      observed_at: string | Date; valid_until: string | Date;
      first_observed_at: string | Date; observation_count: string | number;
      expired: boolean;
      decision: string | null; decided_at: string | Date | null;
    }>;

    const normalized = rows.flatMap((row) => {
      const value = asRecord(row.observed_value);
      const url = asPublicUrl(value?.url);
      const provider = asString(value?.provider, 20);
      const kind = asString(value?.kind, 40);
      const observationKey = asString(row.observation_key, 120);
      const decisionKey = asString(row.decision_key, 120);
      const providers = ["tavily", "firecrawl", "apify"];
      const kinds = ["event-source", "food-truck-source", "business-source", "civic-source", "general-source"];
      if (
        !value || !url || !observationKey || !decisionKey
        || !/^[0-9a-f]{64}:[0-9a-f]{24}$/.test(observationKey)
        || !/^[0-9a-f]{64}:[0-9a-f]{24}$/.test(decisionKey)
        || !providers.includes(provider ?? "")
        || !kinds.includes(kind ?? "")
      ) return [];
      const decisions = ["approved", "rejected", "published"];
      const decision = decisions.includes(row.decision ?? "")
        ? row.decision as SourceCandidateDecision
        : null;
      return [{
        key: row.entity_key,
        observationKey,
        decisionKey,
        provider: provider as SourceCandidateProvider,
        kind: kind as SourceCandidateKind,
        title: asString(value.title, 240) ?? domainOf(url), url,
        sourceDomain: asString(value.sourceDomain, 240) ?? domainOf(url),
        observedAt: new Date(row.observed_at).toISOString(),
        expiresAt: new Date(row.valid_until).toISOString(),
        firstObservedAt: new Date(row.first_observed_at).toISOString(),
        observationCount: Number(row.observation_count),
        expired: row.expired,
        confidence: Number(row.confidence),
        reviewFor: asStrings(value.reviewFor),
        status: asString(value.status, 60) ?? "candidate",
        sourceId: asString(value.sourceId, 120) ?? undefined,
        profileId: asString(value.profileId, 120) ?? undefined,
        queryId: asString(value.queryId, 120) ?? undefined,
        details: asRecord(value.details) ?? {}, decision,
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
      }];
    });
    return { available: true, rows: normalized };
  } catch {
    return {
      available: false,
      rows: [],
      reason: "The source inbox could not be read. Check database health before reviewing discoveries.",
    };
  }
}

export async function decideSourceCandidate(
  decisionKey: string,
  decision: SourceCandidateDecision | "clear",
): Promise<void> {
  if (!/^[0-9a-f]{64}:[0-9a-f]{24}$/.test(decisionKey)) {
    throw new Error("Invalid source candidate decision key.");
  }
  if (
    decision !== "clear" &&
    decision !== "approved" &&
    decision !== "rejected" &&
    decision !== "published"
  ) {
    throw new Error("Invalid source candidate decision.");
  }
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required to review source candidates.");
  if (decision === "clear") {
    await sql`delete from curation_decisions where tool = 'source-candidate' and target_id = ${decisionKey} and field = ''`;
    return;
  }
  await sql`
    insert into curation_decisions (tool, target_id, field, decision, decided_at)
    values ('source-candidate', ${decisionKey}, '', ${decision}, now())
    on conflict (tool, target_id, field)
    do update set decision = excluded.decision, decided_at = excluded.decided_at
  `;
}
