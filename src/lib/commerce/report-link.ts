export type CommerceLinkReportInput = {
  place_slug: string;
  place_name: string | null;
  link_ref: string | null;
  url: string | null;
  provider: string | null;
  link_type: string | null;
  issue_type: "broken_link";
  note: string | null;
};

const ALLOWED_FIELDS = new Set([
  "placeSlug",
  "placeName",
  "linkRef",
  "url",
  "provider",
  "linkType",
  "note",
]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,159}$/;
const TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false };
  return { ok: true, value: trimmed };
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

/** Strictly validate the public broken-link report before it reaches Postgres. */
export function parseCommerceLinkReport(value: unknown): CommerceLinkReportInput | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))) return null;

  const slug = optionalString(value.placeSlug, 160);
  const placeName = optionalString(value.placeName, 200);
  const linkRef = optionalString(value.linkRef, 256);
  const url = optionalString(value.url, 1_024);
  const provider = optionalString(value.provider, 40);
  const linkType = optionalString(value.linkType, 40);
  const note = optionalString(value.note, 280);
  if (
    !slug.ok ||
    !placeName.ok ||
    !linkRef.ok ||
    !url.ok ||
    !provider.ok ||
    !linkType.ok ||
    !note.ok ||
    !slug.value ||
    !SLUG_RE.test(slug.value) ||
    (url.value !== null && !isSafeHttpUrl(url.value)) ||
    (provider.value !== null && !TOKEN_RE.test(provider.value)) ||
    (linkType.value !== null && !TOKEN_RE.test(linkType.value))
  ) {
    return null;
  }

  return {
    place_slug: slug.value,
    place_name: placeName.value,
    link_ref: linkRef.value ?? url.value,
    url: url.value,
    provider: provider.value,
    link_type: linkType.value,
    issue_type: "broken_link",
    note: note.value,
  };
}
