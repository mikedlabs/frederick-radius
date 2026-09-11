/**
 * Restaurant-authorized native menu ingestion.
 *
 * This module deliberately accepts only structured data supplied by a
 * restaurant/operator or an OAuth-authorized POS adapter. It does not fetch or
 * scrape public pages. The normalized result is provider-agnostic and safe to
 * persist later without carrying OAuth credentials into menu data.
 */

export const NATIVE_MENU_SCHEMA_VERSION = 1 as const;
export const MAX_NATIVE_MENU_INPUT_BYTES = 2_000_000;
export const MAX_NATIVE_MENUS = 24;
export const MAX_NATIVE_MENU_SECTIONS = 240;
export const MAX_NATIVE_MENU_ITEMS = 5_000;

export const NATIVE_MENU_SOURCE_PROVIDERS = [
  "owner_upload",
  "toast",
  "square",
  "clover",
] as const;
export type NativeMenuSourceProvider = (typeof NATIVE_MENU_SOURCE_PROVIDERS)[number];

export const NATIVE_MENU_AUTHORIZATION_BASES = [
  "owner_upload",
  "operator_upload",
  "pos_oauth",
] as const;
export type NativeMenuAuthorizationBasis =
  (typeof NATIVE_MENU_AUTHORIZATION_BASES)[number];

export const NATIVE_MENU_AVAILABILITY_EVIDENCE = [
  "owner_attested",
  "provider_api",
] as const;
export type NativeMenuAvailabilityEvidence =
  (typeof NATIVE_MENU_AVAILABILITY_EVIDENCE)[number];

export const NATIVE_MENU_DIETARY_EVIDENCE = [
  "owner_attested",
  "official_menu",
  "provider_api",
] as const;
export type NativeMenuDietaryEvidence =
  (typeof NATIVE_MENU_DIETARY_EVIDENCE)[number];

/**
 * Deliberately finite. Unrecognized marketing, health, or allergen claims must
 * be reviewed before they become part of the public contract.
 */
export const NATIVE_MENU_DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_free",
  "halal",
  "kosher",
] as const;
export type NativeMenuDietaryTag = (typeof NATIVE_MENU_DIETARY_TAGS)[number];

export interface NativeMenuAuthorization {
  authorized: true;
  basis: NativeMenuAuthorizationBasis;
  grantedAt?: string;
}

export interface NativeMenuSource {
  provider: NativeMenuSourceProvider;
  url: string;
  checkedAt: string;
  publishedAt?: string;
}

export interface NativeMenuItem {
  id: string;
  name: string;
  description?: string;
  /** Integer cents. Never a float or formatted currency string. */
  priceCents?: number;
  available?: boolean;
  availabilityEvidence?: NativeMenuAvailabilityEvidence;
  dietaryTags?: NativeMenuDietaryTag[];
  dietaryEvidence?: NativeMenuDietaryEvidence;
  sourceUrl?: string;
  position: number;
}

export interface NativeMenuSection {
  id: string;
  name: string;
  position: number;
  items: NativeMenuItem[];
}

export interface NativeMenu {
  id: string;
  name: string;
  currency: "USD";
  position: number;
  sections: NativeMenuSection[];
}

export interface NativeMenuDocument {
  schemaVersion: typeof NATIVE_MENU_SCHEMA_VERSION;
  placeId: string;
  authorization: NativeMenuAuthorization;
  source: NativeMenuSource;
  menus: NativeMenu[];
  totals: {
    menus: number;
    sections: number;
    items: number;
  };
}

export type NativeMenuInputFormat = "json" | "csv";

export interface NativeMenuImportOptions {
  format: NativeMenuInputFormat;
}

export class NativeMenuValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Native menu validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "NativeMenuValidationError";
    this.issues = issues;
  }
}

type JsonRecord = Record<string, unknown>;

const POS_PROVIDERS = new Set<NativeMenuSourceProvider>(["toast", "square", "clover"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_PLACE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_PRICE_CENTS = 100_000_000;
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

const CSV_COLUMNS = new Set([
  "schema_version",
  "place_id",
  "authorized",
  "authorization_basis",
  "authorization_granted_at",
  "source_provider",
  "source_url",
  "checked_at",
  "published_at",
  "menu_id",
  "menu_name",
  "menu_position",
  "currency",
  "section_id",
  "section_name",
  "section_position",
  "item_id",
  "item_name",
  "item_position",
  "description",
  "price_cents",
  "available",
  "availability_evidence",
  "dietary_tags",
  "dietary_evidence",
  "item_source_url",
]);

const REQUIRED_CSV_COLUMNS = [
  "schema_version",
  "place_id",
  "authorized",
  "authorization_basis",
  "source_provider",
  "source_url",
  "checked_at",
  "menu_id",
  "menu_name",
  "section_id",
  "section_name",
  "item_id",
  "item_name",
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: JsonRecord,
  allowed: readonly string[],
  path: string,
  issues: string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) issues.push(`${path}.${key} is not a supported field or claim`);
  }
}

function text(
  value: unknown,
  path: string,
  issues: string[],
  options: { required?: boolean; max?: number } = {},
): string | undefined {
  if (value == null || value === "") {
    if (options.required) issues.push(`${path} is required`);
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push(`${path} must be a string`);
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized && options.required) issues.push(`${path} is required`);
  if (normalized.length > (options.max ?? 500)) {
    issues.push(`${path} exceeds ${options.max ?? 500} characters`);
  }
  return normalized || undefined;
}

function exactBoolean(value: unknown, path: string, issues: string[]): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  issues.push(`${path} must be true or false`);
  return undefined;
}

function integer(
  value: unknown,
  path: string,
  issues: string[],
  options: { required?: boolean; min?: number; max?: number } = {},
): number | undefined {
  if (value == null || value === "") {
    if (options.required) issues.push(`${path} is required`);
    return undefined;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    issues.push(`${path} must be an integer`);
    return undefined;
  }
  if (options.min != null && parsed < options.min) {
    issues.push(`${path} must be at least ${options.min}`);
  }
  if (options.max != null && parsed > options.max) {
    issues.push(`${path} must be at most ${options.max}`);
  }
  return parsed;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
  issues: string[],
  required = false,
): T[number] | undefined {
  const normalized = text(value, path, issues, { required, max: 80 });
  if (!normalized) return undefined;
  if (!(allowed as readonly string[]).includes(normalized)) {
    issues.push(`${path} has unsupported value "${normalized}"`);
    return undefined;
  }
  return normalized as T[number];
}

function timestamp(
  value: unknown,
  path: string,
  issues: string[],
  required = false,
): string | undefined {
  const normalized = text(value, path, issues, { required, max: 40 });
  if (!normalized) return undefined;
  if (!ISO_WITH_TIMEZONE.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    issues.push(`${path} must be an ISO 8601 timestamp with a timezone`);
    return undefined;
  }
  return new Date(normalized).toISOString();
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".invalid") ||
    host.endsWith(".test")
  ) {
    return true;
  }
  if (host.includes(":")) return true;
  const octets = host.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
    const values = octets.map(Number);
    if (values.some((part) => part > 255)) return true;
    const [a, b] = values;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  return !host.includes(".");
}

function safePublicUrl(
  value: unknown,
  path: string,
  issues: string[],
  required = false,
): string | undefined {
  const raw = text(value, path, issues, { required, max: 2_048 });
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      issues.push(`${path} must use https`);
      return undefined;
    }
    if (parsed.username || parsed.password) {
      issues.push(`${path} cannot contain credentials`);
      return undefined;
    }
    if (parsed.port && parsed.port !== "443") {
      issues.push(`${path} cannot use a non-standard port`);
      return undefined;
    }
    if (isBlockedHost(parsed.hostname)) {
      issues.push(`${path} must use a public hostname`);
      return undefined;
    }
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    issues.push(`${path} must be a valid public URL`);
    return undefined;
  }
}

function safeId(
  value: unknown,
  path: string,
  issues: string[],
  place = false,
): string | undefined {
  const normalized = text(value, path, issues, { required: true, max: 128 });
  if (!normalized) return undefined;
  if (!(place ? SAFE_PLACE_ID : SAFE_ID).test(normalized)) {
    issues.push(
      `${path} may contain only ${place ? "lowercase letters, numbers, and hyphens" : "letters, numbers, dots, colons, underscores, and hyphens"}`,
    );
    return undefined;
  }
  return normalized;
}

function normalizeItem(
  value: unknown,
  path: string,
  issues: string[],
  source: NativeMenuSource,
  defaultPosition: number,
): NativeMenuItem | undefined {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return undefined;
  }
  rejectUnknownKeys(
    value,
    [
      "id",
      "name",
      "description",
      "price_cents",
      "priceCents",
      "available",
      "availability_evidence",
      "availabilityEvidence",
      "dietary_tags",
      "dietaryTags",
      "dietary_evidence",
      "dietaryEvidence",
      "source_url",
      "sourceUrl",
      "position",
    ],
    path,
    issues,
  );
  const id = safeId(value.id, `${path}.id`, issues);
  const name = text(value.name, `${path}.name`, issues, { required: true, max: 180 });
  const description = text(value.description, `${path}.description`, issues, { max: 2_000 });
  const priceCents = integer(value.price_cents ?? value.priceCents, `${path}.price_cents`, issues, {
    min: 0,
    max: MAX_PRICE_CENTS,
  });
  const available = exactBoolean(value.available, `${path}.available`, issues);
  const availabilityEvidence = enumValue(
    value.availability_evidence ?? value.availabilityEvidence,
    NATIVE_MENU_AVAILABILITY_EVIDENCE,
    `${path}.availability_evidence`,
    issues,
  );
  if (available != null && !availabilityEvidence) {
    issues.push(`${path}.availability_evidence is required when available is supplied`);
  }
  if (available == null && availabilityEvidence) {
    issues.push(`${path}.availability_evidence cannot be supplied without available`);
  }
  if (availabilityEvidence === "provider_api" && !POS_PROVIDERS.has(source.provider)) {
    issues.push(`${path}.availability_evidence provider_api requires a POS source`);
  }

  const rawDietary = value.dietary_tags ?? value.dietaryTags;
  let dietaryTags: NativeMenuDietaryTag[] | undefined;
  if (rawDietary != null && rawDietary !== "") {
    const entries = Array.isArray(rawDietary)
      ? rawDietary
      : typeof rawDietary === "string"
        ? rawDietary.split("|")
        : [];
    if (!Array.isArray(rawDietary) && typeof rawDietary !== "string") {
      issues.push(`${path}.dietary_tags must be an array or pipe-delimited string`);
    }
    const tags: NativeMenuDietaryTag[] = [];
    for (const [index, entry] of entries.entries()) {
      const tag = enumValue(
        typeof entry === "string" ? entry.trim() : entry,
        NATIVE_MENU_DIETARY_TAGS,
        `${path}.dietary_tags[${index}]`,
        issues,
      );
      if (tag && !tags.includes(tag)) tags.push(tag);
      else if (tag) issues.push(`${path}.dietary_tags contains duplicate "${tag}"`);
    }
    dietaryTags = tags.length ? tags.sort() : undefined;
  }
  const dietaryEvidence = enumValue(
    value.dietary_evidence ?? value.dietaryEvidence,
    NATIVE_MENU_DIETARY_EVIDENCE,
    `${path}.dietary_evidence`,
    issues,
  );
  if (dietaryTags?.length && !dietaryEvidence) {
    issues.push(`${path}.dietary_evidence is required when dietary_tags are supplied`);
  }
  if (!dietaryTags?.length && dietaryEvidence) {
    issues.push(`${path}.dietary_evidence cannot be supplied without dietary_tags`);
  }
  if (dietaryEvidence === "provider_api" && !POS_PROVIDERS.has(source.provider)) {
    issues.push(`${path}.dietary_evidence provider_api requires a POS source`);
  }

  const sourceUrl = safePublicUrl(
    value.source_url ?? value.sourceUrl,
    `${path}.source_url`,
    issues,
  );
  const position =
    integer(value.position, `${path}.position`, issues, { min: 0, max: 100_000 }) ??
    defaultPosition;

  if (!id || !name) return undefined;
  return {
    id,
    name,
    ...(description ? { description } : {}),
    ...(priceCents != null ? { priceCents } : {}),
    ...(available != null ? { available } : {}),
    ...(availabilityEvidence ? { availabilityEvidence } : {}),
    ...(dietaryTags?.length ? { dietaryTags } : {}),
    ...(dietaryEvidence ? { dietaryEvidence } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    position,
  };
}

function normalizeDocument(value: unknown): NativeMenuDocument {
  const issues: string[] = [];
  if (!isRecord(value)) throw new NativeMenuValidationError(["root must be an object"]);
  rejectUnknownKeys(
    value,
    ["schema_version", "schemaVersion", "place_id", "placeId", "authorization", "source", "menus"],
    "root",
    issues,
  );

  const schemaVersion = integer(
    value.schema_version ?? value.schemaVersion,
    "schema_version",
    issues,
    { required: true, min: NATIVE_MENU_SCHEMA_VERSION, max: NATIVE_MENU_SCHEMA_VERSION },
  );
  const placeId = safeId(value.place_id ?? value.placeId, "place_id", issues, true);

  const rawAuthorization = value.authorization;
  let authorization: NativeMenuAuthorization | undefined;
  if (!isRecord(rawAuthorization)) {
    issues.push("authorization must be an object");
  } else {
    rejectUnknownKeys(
      rawAuthorization,
      ["authorized", "basis", "granted_at", "grantedAt"],
      "authorization",
      issues,
    );
    const authorized = exactBoolean(
      rawAuthorization.authorized,
      "authorization.authorized",
      issues,
    );
    if (authorized !== true) {
      issues.push("authorization.authorized must be true");
    }
    const basis = enumValue(
      rawAuthorization.basis,
      NATIVE_MENU_AUTHORIZATION_BASES,
      "authorization.basis",
      issues,
      true,
    );
    const grantedAt = timestamp(
      rawAuthorization.granted_at ?? rawAuthorization.grantedAt,
      "authorization.granted_at",
      issues,
    );
    if (authorized === true && basis) {
      authorization = {
        authorized: true,
        basis,
        ...(grantedAt ? { grantedAt } : {}),
      };
    }
  }

  const rawSource = value.source;
  let source: NativeMenuSource | undefined;
  if (!isRecord(rawSource)) {
    issues.push("source must be an object");
  } else {
    rejectUnknownKeys(
      rawSource,
      ["provider", "url", "checked_at", "checkedAt", "published_at", "publishedAt"],
      "source",
      issues,
    );
    const provider = enumValue(
      rawSource.provider,
      NATIVE_MENU_SOURCE_PROVIDERS,
      "source.provider",
      issues,
      true,
    );
    const url = safePublicUrl(rawSource.url, "source.url", issues, true);
    const checkedAt = timestamp(
      rawSource.checked_at ?? rawSource.checkedAt,
      "source.checked_at",
      issues,
      true,
    );
    const publishedAt = timestamp(
      rawSource.published_at ?? rawSource.publishedAt,
      "source.published_at",
      issues,
    );
    if (provider && url && checkedAt) {
      source = {
        provider,
        url,
        checkedAt,
        ...(publishedAt ? { publishedAt } : {}),
      };
    }
  }

  if (source && authorization) {
    if (POS_PROVIDERS.has(source.provider) && authorization.basis !== "pos_oauth") {
      issues.push("POS sources require authorization.basis pos_oauth");
    }
    if (!POS_PROVIDERS.has(source.provider) && authorization.basis === "pos_oauth") {
      issues.push("authorization.basis pos_oauth requires a POS source");
    }
  }

  const rawMenus = value.menus;
  const menus: NativeMenu[] = [];
  const menuIds = new Set<string>();
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  let sectionCount = 0;
  let itemCount = 0;

  if (!Array.isArray(rawMenus) || rawMenus.length === 0) {
    issues.push("menus must contain at least one menu");
  } else {
    if (rawMenus.length > MAX_NATIVE_MENUS) {
      issues.push(`menus exceeds the limit of ${MAX_NATIVE_MENUS}`);
    }
    rawMenus.slice(0, MAX_NATIVE_MENUS + 1).forEach((rawMenu, menuIndex) => {
      const menuPath = `menus[${menuIndex}]`;
      if (!isRecord(rawMenu)) {
        issues.push(`${menuPath} must be an object`);
        return;
      }
      rejectUnknownKeys(
        rawMenu,
        ["id", "name", "currency", "position", "sections"],
        menuPath,
        issues,
      );
      const id = safeId(rawMenu.id, `${menuPath}.id`, issues);
      if (id) {
        if (menuIds.has(id)) issues.push(`${menuPath}.id duplicates "${id}"`);
        menuIds.add(id);
      }
      const name = text(rawMenu.name, `${menuPath}.name`, issues, {
        required: true,
        max: 180,
      });
      const currency = text(rawMenu.currency, `${menuPath}.currency`, issues, {
        required: true,
        max: 3,
      });
      if (currency && currency !== "USD") {
        issues.push(`${menuPath}.currency must be USD`);
      }
      const position =
        integer(rawMenu.position, `${menuPath}.position`, issues, {
          min: 0,
          max: 100_000,
        }) ?? menuIndex;

      const rawSections = rawMenu.sections;
      const sections: NativeMenuSection[] = [];
      if (!Array.isArray(rawSections) || rawSections.length === 0) {
        issues.push(`${menuPath}.sections must contain at least one section`);
      } else {
        sectionCount += rawSections.length;
        rawSections.forEach((rawSection, sectionIndex) => {
          const sectionPath = `${menuPath}.sections[${sectionIndex}]`;
          if (!isRecord(rawSection)) {
            issues.push(`${sectionPath} must be an object`);
            return;
          }
          rejectUnknownKeys(
            rawSection,
            ["id", "name", "position", "items"],
            sectionPath,
            issues,
          );
          const sectionId = safeId(rawSection.id, `${sectionPath}.id`, issues);
          if (sectionId) {
            if (sectionIds.has(sectionId)) {
              issues.push(`${sectionPath}.id duplicates "${sectionId}"`);
            }
            sectionIds.add(sectionId);
          }
          const sectionName = text(rawSection.name, `${sectionPath}.name`, issues, {
            required: true,
            max: 180,
          });
          const sectionPosition =
            integer(rawSection.position, `${sectionPath}.position`, issues, {
              min: 0,
              max: 100_000,
            }) ?? sectionIndex;
          const rawItems = rawSection.items;
          const items: NativeMenuItem[] = [];
          if (!Array.isArray(rawItems) || rawItems.length === 0) {
            issues.push(`${sectionPath}.items must contain at least one item`);
          } else {
            itemCount += rawItems.length;
            rawItems.forEach((rawItem, itemIndex) => {
              const item = source
                ? normalizeItem(
                    rawItem,
                    `${sectionPath}.items[${itemIndex}]`,
                    issues,
                    source,
                    itemIndex,
                  )
                : undefined;
              if (item) {
                if (itemIds.has(item.id)) {
                  issues.push(`${sectionPath}.items[${itemIndex}].id duplicates "${item.id}"`);
                }
                itemIds.add(item.id);
                items.push(item);
              }
            });
          }
          if (sectionId && sectionName) {
            sections.push({
              id: sectionId,
              name: sectionName,
              position: sectionPosition,
              items: items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
            });
          }
        });
      }
      if (id && name && currency === "USD") {
        menus.push({
          id,
          name,
          currency: "USD",
          position,
          sections: sections.sort(
            (a, b) => a.position - b.position || a.id.localeCompare(b.id),
          ),
        });
      }
    });
  }

  if (sectionCount > MAX_NATIVE_MENU_SECTIONS) {
    issues.push(`sections exceeds the limit of ${MAX_NATIVE_MENU_SECTIONS}`);
  }
  if (itemCount > MAX_NATIVE_MENU_ITEMS) {
    issues.push(`items exceeds the limit of ${MAX_NATIVE_MENU_ITEMS}`);
  }

  if (
    issues.length ||
    schemaVersion !== NATIVE_MENU_SCHEMA_VERSION ||
    !placeId ||
    !authorization ||
    !source
  ) {
    throw new NativeMenuValidationError([...new Set(issues)]);
  }

  return {
    schemaVersion: NATIVE_MENU_SCHEMA_VERSION,
    placeId,
    authorization,
    source,
    menus: menus.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    totals: {
      menus: menus.length,
      sections: sectionCount,
      items: itemCount,
    },
  };
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length) {
        throw new NativeMenuValidationError(["CSV contains a quote inside an unquoted field"]);
      }
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (quoted) throw new NativeMenuValidationError(["CSV contains an unterminated quote"]);
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function csvToDocument(input: string): unknown {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new NativeMenuValidationError(["CSV must contain a header and at least one item row"]);
  }
  const headers = rows[0].map((header) => header.trim());
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  const issues: string[] = [];
  if (duplicateHeaders.length) {
    issues.push(`CSV has duplicate columns: ${[...new Set(duplicateHeaders)].join(", ")}`);
  }
  const unknown = headers.filter((header) => !CSV_COLUMNS.has(header));
  if (unknown.length) issues.push(`CSV has unsupported columns: ${unknown.join(", ")}`);
  const missing = REQUIRED_CSV_COLUMNS.filter((header) => !headers.includes(header));
  if (missing.length) issues.push(`CSV is missing required columns: ${missing.join(", ")}`);
  if (issues.length) throw new NativeMenuValidationError(issues);

  const records = rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new NativeMenuValidationError([
        `CSV row ${rowIndex + 2} has ${cells.length} fields; expected ${headers.length}`,
      ]);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index].trim()]));
  });

  const first = records[0];
  const metadataColumns = [
    "schema_version",
    "place_id",
    "authorized",
    "authorization_basis",
    "authorization_granted_at",
    "source_provider",
    "source_url",
    "checked_at",
    "published_at",
  ];
  for (const [rowIndex, record] of records.entries()) {
    for (const column of metadataColumns) {
      if ((record[column] ?? "") !== (first[column] ?? "")) {
        issues.push(`CSV row ${rowIndex + 2} has inconsistent ${column}`);
      }
    }
  }
  if (issues.length) throw new NativeMenuValidationError(issues);

  const menus = new Map<string, JsonRecord>();
  const sections = new Map<string, JsonRecord>();
  for (const record of records) {
    const menuId = record.menu_id;
    const sectionId = record.section_id;
    const menu = menus.get(menuId) ?? {
      id: menuId,
      name: record.menu_name,
      currency: record.currency || "USD",
      position: record.menu_position,
      sections: [],
    };
    if (
      menu.name !== record.menu_name ||
      menu.currency !== (record.currency || "USD") ||
      menu.position !== record.menu_position
    ) {
      issues.push(`CSV has conflicting definitions for menu_id "${menuId}"`);
    }
    menus.set(menuId, menu);

    const sectionKey = `${menuId}\u0000${sectionId}`;
    let section = sections.get(sectionKey);
    if (!section) {
      section = {
        id: sectionId,
        name: record.section_name,
        position: record.section_position,
        items: [],
      };
      sections.set(sectionKey, section);
      (menu.sections as JsonRecord[]).push(section);
    } else if (
      section.name !== record.section_name ||
      section.position !== record.section_position
    ) {
      issues.push(
        `CSV has conflicting definitions for section_id "${sectionId}" in menu "${menuId}"`,
      );
    }
    (section.items as JsonRecord[]).push({
      id: record.item_id,
      name: record.item_name,
      position: record.item_position,
      description: record.description,
      price_cents: record.price_cents,
      available: record.available,
      availability_evidence: record.availability_evidence,
      dietary_tags: record.dietary_tags,
      dietary_evidence: record.dietary_evidence,
      source_url: record.item_source_url,
    });
  }
  if (issues.length) throw new NativeMenuValidationError(issues);

  return {
    schema_version: first.schema_version,
    place_id: first.place_id,
    authorization: {
      authorized: first.authorized,
      basis: first.authorization_basis,
      granted_at: first.authorization_granted_at,
    },
    source: {
      provider: first.source_provider,
      url: first.source_url,
      checked_at: first.checked_at,
      published_at: first.published_at,
    },
    menus: [...menus.values()],
  };
}

/**
 * Parse and normalize a complete, restaurant-authorized menu snapshot.
 *
 * The function performs no network calls and writes nothing. Callers decide
 * where the returned document is stored after validation succeeds.
 */
export function importNativeMenu(
  input: string | Uint8Array,
  options: NativeMenuImportOptions,
): NativeMenuDocument {
  const bytes = typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
  if (bytes === 0) throw new NativeMenuValidationError(["input is empty"]);
  if (bytes > MAX_NATIVE_MENU_INPUT_BYTES) {
    throw new NativeMenuValidationError([
      `input exceeds the ${MAX_NATIVE_MENU_INPUT_BYTES}-byte limit`,
    ]);
  }
  const source = typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  let parsed: unknown;
  if (options.format === "json") {
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new NativeMenuValidationError(["input is not valid JSON"]);
    }
  } else {
    parsed = csvToDocument(source);
  }
  return normalizeDocument(parsed);
}
