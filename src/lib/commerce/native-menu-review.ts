import { createHash } from "node:crypto";

import { getSql } from "@/lib/db/client";
import type {
  NativeMenuDocument,
  NativeMenuItem,
} from "@/lib/commerce/native-menu-ingest";

/**
 * Server-side review inbox for restaurant-authorized menu snapshots.
 *
 * This writer deliberately has no publish mode. Every row it creates remains
 * draft + unverified + freshness unknown until a separate human review and
 * publication workflow exists. Firecrawl, Tavily, Apify, and other discovery
 * tools must not call this writer with scraped data.
 */

type QueryResult = readonly Record<string, unknown>[];

export interface NativeMenuReviewSql {
  (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<QueryResult>;
  begin?<T>(
    work: (transaction: NativeMenuReviewSql) => Promise<T>,
  ): Promise<T>;
}

interface ReviewSourceRow {
  placeSlug: string;
  provider: NativeMenuDocument["source"]["provider"];
  sourceKind: "owner_upload" | "pos_api";
  sourceKey: string;
  sourceLabel: string;
  sourceUrl: string;
  provenanceMethod: "business_submission" | "merchant_authorized";
  provenance: Record<string, unknown>;
  contentHash: string;
  checkedAt: string;
}

interface ReviewMenuRow {
  sourceKey: string;
  name: string;
  menuType:
    | "main"
    | "breakfast"
    | "brunch"
    | "lunch"
    | "dinner"
    | "kids"
    | "drinks"
    | "dessert"
    | "happy_hour"
    | "catering"
    | "other";
  currency: "USD";
  canonicalUrl: string;
  provenanceUrl: string;
  provenance: Record<string, unknown>;
  contentHash: string;
  checkedAt: string;
  sortOrder: number;
}

interface ReviewSectionRow {
  menuSourceKey: string;
  sourceKey: string;
  name: string;
  provenanceUrl: string;
  provenance: Record<string, unknown>;
  contentHash: string;
  checkedAt: string;
  sortOrder: number;
}

interface ReviewItemRow {
  menuSourceKey: string;
  sectionSourceKey: string;
  sourceKey: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  priceDisplay: string | null;
  availabilityStatus: "unknown" | "available" | "unavailable";
  availabilityEvidence:
    | "not_provided"
    | "provider_api"
    | "business_submission";
  availabilityCheckedAt: string | null;
  dietaryTags: string[];
  dietaryEvidence:
    | "not_provided"
    | "provider_api"
    | "business_submission"
    | "official_menu";
  provenanceUrl: string;
  provenance: Record<string, unknown>;
  contentHash: string;
  checkedAt: string;
  sortOrder: number;
}

export interface NativeMenuReviewDraft {
  source: ReviewSourceRow;
  menus: ReviewMenuRow[];
  sections: ReviewSectionRow[];
  items: ReviewItemRow[];
}

export interface NativeMenuReviewStageResult {
  sourceId: string;
  placeSlug: string;
  sourceKey: string;
  menus: number;
  sections: number;
  items: number;
  recordStatus: "draft";
  verificationStatus: "unverified";
  freshnessStatus: "unknown";
  publiclyVisible: false;
  reviewRequired: true;
}

export interface NativeMenuReviewCandidate {
  sourceId: string;
  placeSlug: string;
  provider: string;
  sourceLabel: string;
  sourceUrl: string | null;
  checkedAt: string | null;
  updatedAt: string;
  menus: number;
  sections: number;
  items: number;
  recordStatus: "draft";
  verificationStatus: "unverified";
  publiclyVisible: false;
}

export class NativeMenuReviewError extends Error {
  readonly code:
    | "not_configured"
    | "transaction_required"
    | "protected_source"
    | "read_failed"
    | "write_failed";

  constructor(
    code: NativeMenuReviewError["code"],
    message: string,
  ) {
    super(message);
    this.name = "NativeMenuReviewError";
    this.code = code;
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function menuType(id: string, name: string): ReviewMenuRow["menuType"] {
  const words = `${id} ${name}`.toLowerCase().replace(/[^a-z]+/g, " ");
  if (/\bhappy hour\b/.test(words)) return "happy_hour";
  if (/\bbreakfast\b/.test(words)) return "breakfast";
  if (/\bbrunch\b/.test(words)) return "brunch";
  if (/\blunch\b/.test(words)) return "lunch";
  if (/\bdinner\b/.test(words)) return "dinner";
  if (/\b(kid|kids|children)\b/.test(words)) return "kids";
  if (/\b(drink|drinks|beer|wine|cocktail|beverage)\b/.test(words)) return "drinks";
  if (/\b(dessert|desserts|sweet|sweets)\b/.test(words)) return "dessert";
  if (/\b(catering|party)\b/.test(words)) return "catering";
  if (/\b(main|all day|food)\b/.test(words)) return "main";
  return "other";
}

function priceDisplay(priceCents: number | undefined): string | null {
  if (priceCents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(priceCents / 100);
}

function availability(item: NativeMenuItem): Pick<
  ReviewItemRow,
  "availabilityStatus" | "availabilityEvidence" | "availabilityCheckedAt"
> {
  if (item.available == null) {
    return {
      availabilityStatus: "unknown",
      availabilityEvidence: "not_provided",
      availabilityCheckedAt: null,
    };
  }
  return {
    availabilityStatus: item.available ? "available" : "unavailable",
    availabilityEvidence:
      item.availabilityEvidence === "provider_api"
        ? "provider_api"
        : "business_submission",
    availabilityCheckedAt: null,
  };
}

function dietaryEvidence(
  item: NativeMenuItem,
): ReviewItemRow["dietaryEvidence"] {
  if (!item.dietaryTags?.length) return "not_provided";
  if (item.dietaryEvidence === "provider_api") return "provider_api";
  if (item.dietaryEvidence === "official_menu") return "official_menu";
  return "business_submission";
}

/** Build the exact database draft without touching storage. */
export function prepareNativeMenuReviewDraft(
  document: NativeMenuDocument,
): NativeMenuReviewDraft {
  const providerIsPos = document.source.provider !== "owner_upload";
  const sourceKey = `radius:${digest({
    provider: document.source.provider,
    url: document.source.url,
  }).slice(0, 24)}`;
  const authorization = {
    schemaVersion: document.schemaVersion,
    authorizationBasis: document.authorization.basis,
    ...(document.authorization.grantedAt
      ? { authorizationGrantedAt: document.authorization.grantedAt }
      : {}),
    ...(document.source.publishedAt
      ? { sourcePublishedAt: document.source.publishedAt }
      : {}),
    stagedFor: "human_review",
  };
  const source: ReviewSourceRow = {
    placeSlug: document.placeId,
    provider: document.source.provider,
    sourceKind: providerIsPos ? "pos_api" : "owner_upload",
    sourceKey,
    sourceLabel: providerIsPos
      ? `${document.source.provider} menu for ${document.placeId}`
      : `Owner-submitted menu for ${document.placeId}`,
    sourceUrl: document.source.url,
    provenanceMethod: providerIsPos
      ? "merchant_authorized"
      : "business_submission",
    provenance: authorization,
    contentHash: digest(document),
    checkedAt: document.source.checkedAt,
  };

  const menus: ReviewMenuRow[] = [];
  const sections: ReviewSectionRow[] = [];
  const items: ReviewItemRow[] = [];

  for (const menu of document.menus) {
    const preparedMenu: ReviewMenuRow = {
      sourceKey: menu.id,
      name: menu.name,
      menuType: menuType(menu.id, menu.name),
      currency: menu.currency,
      canonicalUrl: document.source.url,
      provenanceUrl: document.source.url,
      provenance: authorization,
      contentHash: digest(menu),
      checkedAt: document.source.checkedAt,
      sortOrder: menu.position,
    };
    menus.push(preparedMenu);

    for (const section of menu.sections) {
      const preparedSection: ReviewSectionRow = {
        menuSourceKey: menu.id,
        sourceKey: section.id,
        name: section.name,
        provenanceUrl: document.source.url,
        provenance: authorization,
        contentHash: digest(section),
        checkedAt: document.source.checkedAt,
        sortOrder: section.position,
      };
      sections.push(preparedSection);

      for (const item of section.items) {
        const preparedAvailability = availability(item);
        items.push({
          menuSourceKey: menu.id,
          sectionSourceKey: section.id,
          sourceKey: item.id,
          name: item.name,
          description: item.description ?? null,
          priceMinor: item.priceCents ?? null,
          priceDisplay: priceDisplay(item.priceCents),
          ...preparedAvailability,
          availabilityCheckedAt:
            preparedAvailability.availabilityStatus === "unknown"
              ? null
              : document.source.checkedAt,
          dietaryTags: item.dietaryTags ?? [],
          dietaryEvidence: dietaryEvidence(item),
          provenanceUrl: item.sourceUrl ?? document.source.url,
          provenance: authorization,
          contentHash: digest(item),
          checkedAt: document.source.checkedAt,
          sortOrder: item.position,
        });
      }
    }
  }

  return { source, menus, sections, items };
}

function rows(value: QueryResult): QueryResult {
  if (!Array.isArray(value)) {
    throw new NativeMenuReviewError(
      "write_failed",
      "Native menu review storage returned an invalid result.",
    );
  }
  return value;
}

function finiteCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Return the private, bounded review queue. It never reads published menus. */
export async function listNativeMenuReviewCandidates(
  options: {
    database?: NativeMenuReviewSql;
    limit?: number;
  } = {},
): Promise<NativeMenuReviewCandidate[]> {
  const sql =
    options.database ?? (getSql() as unknown as NativeMenuReviewSql | null);
  if (!sql) {
    throw new NativeMenuReviewError(
      "not_configured",
      "DATABASE_URL is required to read the native menu review queue.",
    );
  }
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(200, Math.trunc(options.limit ?? 100)))
    : 100;

  try {
    const result = rows(await sql`
      select
        source.id as source_id,
        source.place_slug,
        source.provider,
        source.source_label,
        source.source_url,
        source.checked_at,
        source.updated_at,
        count(distinct menu.id)::integer as menu_count,
        count(distinct section.id)::integer as section_count,
        count(distinct item.id)::integer as item_count
      from public.menu_sources source
      left join public.native_menus menu
        on menu.source_id = source.id
       and menu.record_status = 'draft'
      left join public.menu_sections section
        on section.menu_id = menu.id
       and section.record_status = 'draft'
      left join public.menu_items item
        on item.section_id = section.id
       and item.record_status = 'draft'
      where source.record_status = 'draft'
        and source.verification_status = 'unverified'
      group by source.id
      order by source.checked_at desc nulls last, source.updated_at desc
      limit ${limit}
    `);

    return result.flatMap((row) => {
      if (
        typeof row.source_id !== "string" ||
        typeof row.place_slug !== "string" ||
        typeof row.provider !== "string" ||
        typeof row.source_label !== "string"
      ) {
        return [];
      }
      const updatedAt = isoOrNull(row.updated_at);
      if (!updatedAt) return [];
      return [{
        sourceId: row.source_id,
        placeSlug: row.place_slug,
        provider: row.provider,
        sourceLabel: row.source_label,
        sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
        checkedAt: isoOrNull(row.checked_at),
        updatedAt,
        menus: finiteCount(row.menu_count),
        sections: finiteCount(row.section_count),
        items: finiteCount(row.item_count),
        recordStatus: "draft" as const,
        verificationStatus: "unverified" as const,
        publiclyVisible: false as const,
      }];
    });
  } catch (error) {
    if (error instanceof NativeMenuReviewError) throw error;
    throw new NativeMenuReviewError(
      "read_failed",
      "The native menu review queue could not be read.",
    );
  }
}

/**
 * Atomically stage one authorized menu snapshot for human review.
 *
 * Existing published, verified, or rejected sources are protected. A fresh
 * review import may replace only a prior draft/unverified candidate with the
 * same source identity.
 */
export async function stageNativeMenuForReview(
  document: NativeMenuDocument,
  database?: NativeMenuReviewSql,
): Promise<NativeMenuReviewStageResult> {
  const rootSql =
    database ?? (getSql() as unknown as NativeMenuReviewSql | null);
  if (!rootSql) {
    throw new NativeMenuReviewError(
      "not_configured",
      "DATABASE_URL is required to stage a native menu for review.",
    );
  }
  if (typeof rootSql.begin !== "function") {
    throw new NativeMenuReviewError(
      "transaction_required",
      "Native menu review storage requires a database transaction.",
    );
  }

  const draft = prepareNativeMenuReviewDraft(document);
  const menuPayload = draft.menus.map((menu) => ({
    source_key: menu.sourceKey,
    name: menu.name,
    menu_type: menu.menuType,
    currency: menu.currency,
    canonical_url: menu.canonicalUrl,
    provenance_url: menu.provenanceUrl,
    provenance: menu.provenance,
    content_hash: menu.contentHash,
    checked_at: menu.checkedAt,
    sort_order: menu.sortOrder,
  }));
  const sectionPayload = draft.sections.map((section) => ({
    menu_source_key: section.menuSourceKey,
    source_key: section.sourceKey,
    name: section.name,
    provenance_url: section.provenanceUrl,
    provenance: section.provenance,
    content_hash: section.contentHash,
    checked_at: section.checkedAt,
    sort_order: section.sortOrder,
  }));
  const itemPayload = draft.items.map((item) => ({
    menu_source_key: item.menuSourceKey,
    section_source_key: item.sectionSourceKey,
    source_key: item.sourceKey,
    name: item.name,
    description: item.description,
    price_minor: item.priceMinor,
    price_display: item.priceDisplay,
    availability_status: item.availabilityStatus,
    availability_evidence: item.availabilityEvidence,
    availability_checked_at: item.availabilityCheckedAt,
    dietary_tags: item.dietaryTags,
    dietary_evidence: item.dietaryEvidence,
    provenance_url: item.provenanceUrl,
    provenance: item.provenance,
    content_hash: item.contentHash,
    checked_at: item.checkedAt,
    sort_order: item.sortOrder,
  }));

  try {
    return await rootSql.begin(async (sql) => {
      await sql`set local statement_timeout = '15s'`;

      const sourceRows = rows(await sql`
        insert into public.menu_sources (
          place_slug,
          provider,
          source_kind,
          source_key,
          source_label,
          source_url,
          provenance_method,
          provenance,
          record_status,
          verification_status,
          freshness_status,
          content_hash,
          checked_at,
          valid_until,
          published_at,
          last_error,
          updated_at
        ) values (
          ${draft.source.placeSlug},
          ${draft.source.provider},
          ${draft.source.sourceKind},
          ${draft.source.sourceKey},
          ${draft.source.sourceLabel},
          ${draft.source.sourceUrl},
          ${draft.source.provenanceMethod},
          ${JSON.stringify(draft.source.provenance)}::jsonb,
          'draft',
          'unverified',
          'unknown',
          ${draft.source.contentHash},
          ${draft.source.checkedAt}::timestamptz,
          null,
          null,
          null,
          now()
        )
        on conflict (place_slug, provider, source_key) do update set
          source_kind = excluded.source_kind,
          source_label = excluded.source_label,
          source_url = excluded.source_url,
          provenance_method = excluded.provenance_method,
          provenance = excluded.provenance,
          record_status = 'draft',
          verification_status = 'unverified',
          freshness_status = 'unknown',
          content_hash = excluded.content_hash,
          checked_at = excluded.checked_at,
          valid_until = null,
          published_at = null,
          last_error = null,
          updated_at = now()
        where menu_sources.record_status = 'draft'
          and menu_sources.verification_status = 'unverified'
        returning id
      `);
      const sourceId = sourceRows[0]?.id;
      if (typeof sourceId !== "string" || !sourceId) {
        throw new NativeMenuReviewError(
          "protected_source",
          "A reviewed or published menu source already uses this identity; the review candidate was not changed.",
        );
      }

      await sql`
        delete from public.native_menus
        where source_id = ${sourceId}::uuid
          and record_status = 'draft'
      `;

      const menuRows = rows(await sql`
        insert into public.native_menus (
          source_id,
          source_key,
          name,
          menu_type,
          currency,
          canonical_url,
          provenance_url,
          provenance,
          record_status,
          freshness_status,
          content_hash,
          checked_at,
          valid_until,
          published_at,
          sort_order,
          updated_at
        )
        select
          ${sourceId}::uuid,
          candidate.source_key,
          candidate.name,
          candidate.menu_type,
          candidate.currency,
          candidate.canonical_url,
          candidate.provenance_url,
          candidate.provenance,
          'draft',
          'unknown',
          candidate.content_hash,
          candidate.checked_at,
          null,
          null,
          candidate.sort_order,
          now()
        from jsonb_to_recordset(${JSON.stringify(menuPayload)}::jsonb) as candidate(
          source_key text,
          name text,
          menu_type text,
          currency text,
          canonical_url text,
          provenance_url text,
          provenance jsonb,
          content_hash text,
          checked_at timestamptz,
          sort_order integer
        )
        returning id
      `);

      const sectionRows = rows(await sql`
        insert into public.menu_sections (
          menu_id,
          source_key,
          name,
          provenance_url,
          provenance,
          record_status,
          freshness_status,
          content_hash,
          checked_at,
          valid_until,
          published_at,
          sort_order,
          updated_at
        )
        select
          menu.id,
          candidate.source_key,
          candidate.name,
          candidate.provenance_url,
          candidate.provenance,
          'draft',
          'unknown',
          candidate.content_hash,
          candidate.checked_at,
          null,
          null,
          candidate.sort_order,
          now()
        from jsonb_to_recordset(${JSON.stringify(sectionPayload)}::jsonb) as candidate(
          menu_source_key text,
          source_key text,
          name text,
          provenance_url text,
          provenance jsonb,
          content_hash text,
          checked_at timestamptz,
          sort_order integer
        )
        join public.native_menus menu
          on menu.source_id = ${sourceId}::uuid
         and menu.source_key = candidate.menu_source_key
         and menu.record_status = 'draft'
        returning id
      `);

      const itemRows = rows(await sql`
        insert into public.menu_items (
          section_id,
          source_key,
          name,
          description,
          price_minor,
          price_currency,
          price_display,
          availability_status,
          availability_evidence,
          availability_checked_at,
          dietary_tags,
          dietary_evidence,
          provenance_url,
          provenance,
          record_status,
          freshness_status,
          content_hash,
          checked_at,
          valid_until,
          published_at,
          sort_order,
          updated_at
        )
        select
          section.id,
          candidate.source_key,
          candidate.name,
          candidate.description,
          candidate.price_minor,
          'USD',
          candidate.price_display,
          candidate.availability_status,
          candidate.availability_evidence,
          candidate.availability_checked_at,
          candidate.dietary_tags,
          candidate.dietary_evidence,
          candidate.provenance_url,
          candidate.provenance,
          'draft',
          'unknown',
          candidate.content_hash,
          candidate.checked_at,
          null,
          null,
          candidate.sort_order,
          now()
        from jsonb_to_recordset(${JSON.stringify(itemPayload)}::jsonb) as candidate(
          menu_source_key text,
          section_source_key text,
          source_key text,
          name text,
          description text,
          price_minor integer,
          price_display text,
          availability_status text,
          availability_evidence text,
          availability_checked_at timestamptz,
          dietary_tags text[],
          dietary_evidence text,
          provenance_url text,
          provenance jsonb,
          content_hash text,
          checked_at timestamptz,
          sort_order integer
        )
        join public.native_menus menu
          on menu.source_id = ${sourceId}::uuid
         and menu.source_key = candidate.menu_source_key
         and menu.record_status = 'draft'
        join public.menu_sections section
          on section.menu_id = menu.id
         and section.source_key = candidate.section_source_key
         and section.record_status = 'draft'
        returning id
      `);

      if (
        menuRows.length !== draft.menus.length ||
        sectionRows.length !== draft.sections.length ||
        itemRows.length !== draft.items.length
      ) {
        throw new NativeMenuReviewError(
          "write_failed",
          "The staged menu tree was incomplete; the transaction was rolled back.",
        );
      }

      return {
        sourceId,
        placeSlug: draft.source.placeSlug,
        sourceKey: draft.source.sourceKey,
        menus: menuRows.length,
        sections: sectionRows.length,
        items: itemRows.length,
        recordStatus: "draft",
        verificationStatus: "unverified",
        freshnessStatus: "unknown",
        publiclyVisible: false,
        reviewRequired: true,
      };
    });
  } catch (error) {
    if (error instanceof NativeMenuReviewError) throw error;
    throw new NativeMenuReviewError(
      "write_failed",
      "The native menu review candidate could not be staged; no rows were committed.",
    );
  }
}
