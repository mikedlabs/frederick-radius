/**
 * Server-only native menu reader.
 *
 * Base tables remain closed to anon/authenticated PostgREST roles. These
 * queries are therefore the public app's trust boundary: every returned source,
 * menu, section, and item must be published, marked current, and still inside
 * its bounded validity window.
 */
import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  JsonObject,
  MenuClaimEvidence,
  MenuItemAvailability,
  MenuProvider,
  MenuProvenanceMethod,
  MenuSourceKind,
  NativeMenuItemRecord,
  NativeMenuRecord,
  NativeMenuSectionRecord,
  NativeMenuSourceRecord,
  NativeMenuType,
  PublishedMenu,
  PublishedMenuForPlaceResult,
  PublishedMenuItemMatch,
  PublishedMenuSearchResult,
  PublishedMenuSection,
} from "@/lib/menus/types";

type RawSql = NonNullable<ReturnType<typeof getSql>>;
type RawTimestamp = string | Date;

type PublishedMenuRow = {
  source_id: string;
  source_place_slug: string;
  source_provider: string;
  source_kind: string;
  source_key: string;
  source_label: string;
  source_url: string | null;
  source_external_merchant_id: string | null;
  source_provenance_method: string;
  source_provenance: unknown;
  source_record_status: string;
  source_verification_status: string;
  source_freshness_status: string;
  source_source_updated_at: RawTimestamp | null;
  source_checked_at: RawTimestamp;
  source_valid_until: RawTimestamp;
  source_published_at: RawTimestamp;

  menu_id: string;
  menu_source_key: string;
  menu_name: string;
  menu_description: string | null;
  menu_type: string;
  menu_currency: string;
  menu_canonical_url: string | null;
  menu_provenance_url: string | null;
  menu_provenance: unknown;
  menu_record_status: string;
  menu_freshness_status: string;
  menu_source_updated_at: RawTimestamp | null;
  menu_checked_at: RawTimestamp;
  menu_valid_until: RawTimestamp;
  menu_published_at: RawTimestamp;
  menu_sort_order: number;

  section_id: string | null;
  section_source_key: string | null;
  section_name: string | null;
  section_description: string | null;
  section_provenance_url: string | null;
  section_provenance: unknown;
  section_record_status: string | null;
  section_freshness_status: string | null;
  section_source_updated_at: RawTimestamp | null;
  section_checked_at: RawTimestamp | null;
  section_valid_until: RawTimestamp | null;
  section_published_at: RawTimestamp | null;
  section_sort_order: number | null;

  item_id: string | null;
  item_source_key: string | null;
  item_name: string | null;
  item_description: string | null;
  item_price_minor: number | null;
  item_price_currency: string | null;
  item_price_display: string | null;
  item_availability_status: string | null;
  item_availability_evidence: string | null;
  item_availability_checked_at: RawTimestamp | null;
  item_dietary_tags: string[] | null;
  item_dietary_evidence: string | null;
  item_allergen_statement: string | null;
  item_calorie_count: number | null;
  item_order_url: string | null;
  item_provenance_url: string | null;
  item_provenance: unknown;
  item_record_status: string | null;
  item_freshness_status: string | null;
  item_source_updated_at: RawTimestamp | null;
  item_checked_at: RawTimestamp | null;
  item_valid_until: RawTimestamp | null;
  item_published_at: RawTimestamp | null;
  item_sort_order: number | null;

  search_rank?: number | string;
};

function iso(value: RawTimestamp): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: RawTimestamp | null): string | null {
  return value === null ? null : iso(value);
}

function objectOrEmpty(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function finiteInteger(value: number | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function sourceFromRow(row: PublishedMenuRow): NativeMenuSourceRecord {
  return {
    id: row.source_id,
    placeSlug: row.source_place_slug,
    provider: row.source_provider as MenuProvider,
    sourceKind: row.source_kind as MenuSourceKind,
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    externalMerchantId: row.source_external_merchant_id,
    provenanceMethod: row.source_provenance_method as MenuProvenanceMethod,
    provenance: objectOrEmpty(row.source_provenance),
    recordStatus: "published",
    verificationStatus: "verified",
    freshnessStatus: "current",
    sourceUpdatedAt: isoOrNull(row.source_source_updated_at),
    checkedAt: iso(row.source_checked_at),
    validUntil: iso(row.source_valid_until),
    publishedAt: iso(row.source_published_at),
  };
}

function menuFromRow(row: PublishedMenuRow): NativeMenuRecord {
  return {
    id: row.menu_id,
    sourceId: row.source_id,
    sourceKey: row.menu_source_key,
    name: row.menu_name,
    description: row.menu_description,
    menuType: row.menu_type as NativeMenuType,
    currency: row.menu_currency,
    canonicalUrl: row.menu_canonical_url,
    provenanceUrl: row.menu_provenance_url,
    provenance: objectOrEmpty(row.menu_provenance),
    recordStatus: "published",
    freshnessStatus: "current",
    sourceUpdatedAt: isoOrNull(row.menu_source_updated_at),
    checkedAt: iso(row.menu_checked_at),
    validUntil: iso(row.menu_valid_until),
    publishedAt: iso(row.menu_published_at),
    sortOrder: finiteInteger(row.menu_sort_order) ?? 0,
  };
}

function sectionFromRow(row: PublishedMenuRow): NativeMenuSectionRecord | null {
  if (
    row.section_id === null ||
    row.section_source_key === null ||
    row.section_name === null ||
    row.section_checked_at === null ||
    row.section_valid_until === null ||
    row.section_published_at === null
  ) {
    return null;
  }
  return {
    id: row.section_id,
    menuId: row.menu_id,
    sourceKey: row.section_source_key,
    name: row.section_name,
    description: row.section_description,
    provenanceUrl: row.section_provenance_url,
    provenance: objectOrEmpty(row.section_provenance),
    recordStatus: "published",
    freshnessStatus: "current",
    sourceUpdatedAt: isoOrNull(row.section_source_updated_at),
    checkedAt: iso(row.section_checked_at),
    validUntil: iso(row.section_valid_until),
    publishedAt: iso(row.section_published_at),
    sortOrder: finiteInteger(row.section_sort_order) ?? 0,
  };
}

function itemFromRow(row: PublishedMenuRow): NativeMenuItemRecord | null {
  if (
    row.item_id === null ||
    row.section_id === null ||
    row.item_source_key === null ||
    row.item_name === null ||
    row.item_price_currency === null ||
    row.item_availability_status === null ||
    row.item_availability_evidence === null ||
    row.item_dietary_evidence === null ||
    row.item_checked_at === null ||
    row.item_valid_until === null ||
    row.item_published_at === null
  ) {
    return null;
  }
  return {
    id: row.item_id,
    sectionId: row.section_id,
    sourceKey: row.item_source_key,
    name: row.item_name,
    description: row.item_description,
    priceMinor: finiteInteger(row.item_price_minor),
    priceCurrency: row.item_price_currency,
    priceDisplay: row.item_price_display,
    availabilityStatus:
      row.item_availability_status as MenuItemAvailability,
    availabilityEvidence:
      row.item_availability_evidence as MenuClaimEvidence,
    availabilityCheckedAt: isoOrNull(row.item_availability_checked_at),
    dietaryTags: Array.isArray(row.item_dietary_tags)
      ? row.item_dietary_tags.filter(
          (tag): tag is string => typeof tag === "string",
        )
      : [],
    dietaryEvidence: row.item_dietary_evidence as MenuClaimEvidence,
    allergenStatement: row.item_allergen_statement,
    calorieCount: finiteInteger(row.item_calorie_count),
    orderUrl: row.item_order_url,
    provenanceUrl: row.item_provenance_url,
    provenance: objectOrEmpty(row.item_provenance),
    recordStatus: "published",
    freshnessStatus: "current",
    sourceUpdatedAt: isoOrNull(row.item_source_updated_at),
    checkedAt: iso(row.item_checked_at),
    validUntil: iso(row.item_valid_until),
    publishedAt: iso(row.item_published_at),
    sortOrder: finiteInteger(row.item_sort_order) ?? 0,
  };
}

async function queryPublishedMenuRows(
  sql: RawSql,
  placeSlug: string,
): Promise<PublishedMenuRow[]> {
  return (await sql`
    SELECT
      ms.id AS source_id,
      ms.place_slug AS source_place_slug,
      ms.provider AS source_provider,
      ms.source_kind,
      ms.source_key,
      ms.source_label,
      ms.source_url,
      ms.external_merchant_id AS source_external_merchant_id,
      ms.provenance_method AS source_provenance_method,
      ms.provenance AS source_provenance,
      ms.record_status AS source_record_status,
      ms.verification_status AS source_verification_status,
      ms.freshness_status AS source_freshness_status,
      ms.source_updated_at AS source_source_updated_at,
      ms.checked_at AS source_checked_at,
      ms.valid_until AS source_valid_until,
      ms.published_at AS source_published_at,

      m.id AS menu_id,
      m.source_key AS menu_source_key,
      m.name AS menu_name,
      m.description AS menu_description,
      m.menu_type,
      m.currency AS menu_currency,
      m.canonical_url AS menu_canonical_url,
      m.provenance_url AS menu_provenance_url,
      m.provenance AS menu_provenance,
      m.record_status AS menu_record_status,
      m.freshness_status AS menu_freshness_status,
      m.source_updated_at AS menu_source_updated_at,
      m.checked_at AS menu_checked_at,
      m.valid_until AS menu_valid_until,
      m.published_at AS menu_published_at,
      m.sort_order AS menu_sort_order,

      s.id AS section_id,
      s.source_key AS section_source_key,
      s.name AS section_name,
      s.description AS section_description,
      s.provenance_url AS section_provenance_url,
      s.provenance AS section_provenance,
      s.record_status AS section_record_status,
      s.freshness_status AS section_freshness_status,
      s.source_updated_at AS section_source_updated_at,
      s.checked_at AS section_checked_at,
      s.valid_until AS section_valid_until,
      s.published_at AS section_published_at,
      s.sort_order AS section_sort_order,

      i.id AS item_id,
      i.source_key AS item_source_key,
      i.name AS item_name,
      i.description AS item_description,
      i.price_minor AS item_price_minor,
      i.price_currency AS item_price_currency,
      i.price_display AS item_price_display,
      i.availability_status AS item_availability_status,
      i.availability_evidence AS item_availability_evidence,
      i.availability_checked_at AS item_availability_checked_at,
      i.dietary_tags AS item_dietary_tags,
      i.dietary_evidence AS item_dietary_evidence,
      i.allergen_statement AS item_allergen_statement,
      i.calorie_count AS item_calorie_count,
      i.order_url AS item_order_url,
      i.provenance_url AS item_provenance_url,
      i.provenance AS item_provenance,
      i.record_status AS item_record_status,
      i.freshness_status AS item_freshness_status,
      i.source_updated_at AS item_source_updated_at,
      i.checked_at AS item_checked_at,
      i.valid_until AS item_valid_until,
      i.published_at AS item_published_at,
      i.sort_order AS item_sort_order
    FROM public.menu_sources ms
    JOIN public.native_menus m
      ON m.source_id = ms.id
     AND m.record_status = 'published'
     AND m.freshness_status = 'current'
     AND m.published_at IS NOT NULL
     AND m.published_at <= now()
     AND m.valid_until > now()
    LEFT JOIN public.menu_sections s
      ON s.menu_id = m.id
     AND s.record_status = 'published'
     AND s.freshness_status = 'current'
     AND s.published_at IS NOT NULL
     AND s.published_at <= now()
     AND s.valid_until > now()
    LEFT JOIN public.menu_items i
      ON i.section_id = s.id
     AND i.record_status = 'published'
     AND i.freshness_status = 'current'
     AND i.published_at IS NOT NULL
     AND i.published_at <= now()
     AND i.valid_until > now()
    WHERE ms.place_slug = ${placeSlug}
      AND ms.record_status = 'published'
      AND ms.verification_status = 'verified'
      AND ms.freshness_status = 'current'
      AND ms.published_at IS NOT NULL
      AND ms.published_at <= now()
      AND ms.valid_until > now()
    ORDER BY
      m.sort_order,
      m.name,
      s.sort_order,
      s.name,
      i.sort_order,
      i.name
  `) as unknown as PublishedMenuRow[];
}

function nestPublishedMenus(rows: PublishedMenuRow[]): PublishedMenu[] {
  const menus = new Map<string, PublishedMenu>();
  const sectionsByMenu = new Map<
    string,
    Map<string, PublishedMenuSection>
  >();

  for (const row of rows) {
    let menu = menus.get(row.menu_id);
    if (!menu) {
      menu = {
        ...menuFromRow(row),
        source: sourceFromRow(row),
        sections: [],
      };
      menus.set(row.menu_id, menu);
      sectionsByMenu.set(row.menu_id, new Map());
    }

    const sectionRecord = sectionFromRow(row);
    if (!sectionRecord) continue;

    const sectionMap = sectionsByMenu.get(row.menu_id);
    if (!sectionMap) continue;
    let section = sectionMap.get(sectionRecord.id);
    if (!section) {
      section = { ...sectionRecord, items: [] };
      sectionMap.set(sectionRecord.id, section);
      menu.sections.push(section);
    }

    const item = itemFromRow(row);
    if (item && !section.items.some((candidate) => candidate.id === item.id)) {
      section.items.push(item);
    }
  }

  return [...menus.values()];
}

/**
 * Return the complete published/current native menu tree for one place.
 * `not_found` means the database was reachable but no trustworthy current menu
 * qualified. `unavailable` means Radius could not evaluate the menu store.
 */
export async function getPublishedMenuForPlace(
  placeSlug: string,
): Promise<PublishedMenuForPlaceResult> {
  const normalizedSlug = placeSlug.trim().slice(0, 160);
  if (!normalizedSlug) return { status: "not_found", data: null };

  let sql: RawSql | null;
  try {
    sql = getSql();
  } catch {
    return { status: "unavailable", reason: "query_failed", data: null };
  }
  if (!sql) {
    return { status: "unavailable", reason: "not_configured", data: null };
  }

  try {
    const rows = await queryPublishedMenuRows(sql, normalizedSlug);
    if (rows.length === 0) return { status: "not_found", data: null };
    return {
      status: "ok",
      data: {
        placeSlug: normalizedSlug,
        menus: nestPublishedMenus(rows),
      },
    };
  } catch {
    console.warn("[native-menu] published menu query failed");
    return { status: "unavailable", reason: "query_failed", data: null };
  }
}

export type SearchPublishedMenuOptions = {
  limit?: number;
};

function normalizeSearchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

async function queryPublishedMenuItems(
  sql: RawSql,
  query: string,
  limit: number,
): Promise<PublishedMenuRow[]> {
  return (await sql`
    WITH search_query AS (
      SELECT websearch_to_tsquery('english', ${query}) AS value
    )
    SELECT
      ms.id AS source_id,
      ms.place_slug AS source_place_slug,
      ms.provider AS source_provider,
      ms.source_kind,
      ms.source_key,
      ms.source_label,
      ms.source_url,
      ms.external_merchant_id AS source_external_merchant_id,
      ms.provenance_method AS source_provenance_method,
      ms.provenance AS source_provenance,
      ms.record_status AS source_record_status,
      ms.verification_status AS source_verification_status,
      ms.freshness_status AS source_freshness_status,
      ms.source_updated_at AS source_source_updated_at,
      ms.checked_at AS source_checked_at,
      ms.valid_until AS source_valid_until,
      ms.published_at AS source_published_at,

      m.id AS menu_id,
      m.source_key AS menu_source_key,
      m.name AS menu_name,
      m.description AS menu_description,
      m.menu_type,
      m.currency AS menu_currency,
      m.canonical_url AS menu_canonical_url,
      m.provenance_url AS menu_provenance_url,
      m.provenance AS menu_provenance,
      m.record_status AS menu_record_status,
      m.freshness_status AS menu_freshness_status,
      m.source_updated_at AS menu_source_updated_at,
      m.checked_at AS menu_checked_at,
      m.valid_until AS menu_valid_until,
      m.published_at AS menu_published_at,
      m.sort_order AS menu_sort_order,

      s.id AS section_id,
      s.source_key AS section_source_key,
      s.name AS section_name,
      s.description AS section_description,
      s.provenance_url AS section_provenance_url,
      s.provenance AS section_provenance,
      s.record_status AS section_record_status,
      s.freshness_status AS section_freshness_status,
      s.source_updated_at AS section_source_updated_at,
      s.checked_at AS section_checked_at,
      s.valid_until AS section_valid_until,
      s.published_at AS section_published_at,
      s.sort_order AS section_sort_order,

      i.id AS item_id,
      i.source_key AS item_source_key,
      i.name AS item_name,
      i.description AS item_description,
      i.price_minor AS item_price_minor,
      i.price_currency AS item_price_currency,
      i.price_display AS item_price_display,
      i.availability_status AS item_availability_status,
      i.availability_evidence AS item_availability_evidence,
      i.availability_checked_at AS item_availability_checked_at,
      i.dietary_tags AS item_dietary_tags,
      i.dietary_evidence AS item_dietary_evidence,
      i.allergen_statement AS item_allergen_statement,
      i.calorie_count AS item_calorie_count,
      i.order_url AS item_order_url,
      i.provenance_url AS item_provenance_url,
      i.provenance AS item_provenance,
      i.record_status AS item_record_status,
      i.freshness_status AS item_freshness_status,
      i.source_updated_at AS item_source_updated_at,
      i.checked_at AS item_checked_at,
      i.valid_until AS item_valid_until,
      i.published_at AS item_published_at,
      i.sort_order AS item_sort_order,

      ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(i.name, '') || ' ' || coalesce(i.description, '')
        ),
        search_query.value
      ) AS search_rank
    FROM public.menu_items i
    JOIN public.menu_sections s
      ON s.id = i.section_id
     AND s.record_status = 'published'
     AND s.freshness_status = 'current'
     AND s.published_at IS NOT NULL
     AND s.published_at <= now()
     AND s.valid_until > now()
    JOIN public.native_menus m
      ON m.id = s.menu_id
     AND m.record_status = 'published'
     AND m.freshness_status = 'current'
     AND m.published_at IS NOT NULL
     AND m.published_at <= now()
     AND m.valid_until > now()
    JOIN public.menu_sources ms
      ON ms.id = m.source_id
     AND ms.record_status = 'published'
     AND ms.verification_status = 'verified'
     AND ms.freshness_status = 'current'
     AND ms.published_at IS NOT NULL
     AND ms.published_at <= now()
     AND ms.valid_until > now()
    CROSS JOIN search_query
    WHERE i.record_status = 'published'
      AND i.freshness_status = 'current'
      AND i.published_at IS NOT NULL
      AND i.published_at <= now()
      AND i.valid_until > now()
      AND to_tsvector(
        'english',
        coalesce(i.name, '') || ' ' || coalesce(i.description, '')
      ) @@ search_query.value
    ORDER BY
      search_rank DESC,
      i.name,
      ms.place_slug,
      m.sort_order,
      s.sort_order,
      i.sort_order
    LIMIT ${limit}
  `) as unknown as PublishedMenuRow[];
}

/**
 * Search only item records whose complete source -> menu -> section -> item
 * chain is published, current, verified where applicable, and unexpired.
 */
export async function searchPublishedMenuItems(
  query: string,
  options: SearchPublishedMenuOptions = {},
): Promise<PublishedMenuSearchResult> {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!normalizedQuery) return { status: "ok", items: [] };
  const limit = normalizeSearchLimit(options.limit);

  let sql: RawSql | null;
  try {
    sql = getSql();
  } catch {
    return { status: "unavailable", reason: "query_failed", items: [] };
  }
  if (!sql) {
    return { status: "unavailable", reason: "not_configured", items: [] };
  }

  try {
    const rows = await queryPublishedMenuItems(
      sql,
      normalizedQuery,
      limit,
    );
    const items: PublishedMenuItemMatch[] = [];
    for (const row of rows) {
      const section = sectionFromRow(row);
      const item = itemFromRow(row);
      if (!section || !item) continue;
      const score = Number(row.search_rank ?? 0);
      items.push({
        score: Number.isFinite(score) ? score : 0,
        source: sourceFromRow(row),
        menu: menuFromRow(row),
        section,
        item,
      });
    }
    return { status: "ok", items };
  } catch {
    console.warn("[native-menu] published item search failed");
    return { status: "unavailable", reason: "query_failed", items: [] };
  }
}
