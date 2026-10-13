import { createHash } from "node:crypto";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { publishableGooglePhotoAttribution } from "@/lib/google-photo-policy";

const PHOTO_RESOURCE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const PHOTO_NAME_SHA256 = /^[a-f0-9]{64}$/;
const PHOTO_PROXY_BASE = "https://frederickradius.app";

type PublishableGooglePhotoCredit = GooglePhotoAttribution & {
  google_maps_uri: string;
};

export type CompactGooglePhotoCredit = Omit<PublishableGooglePhotoCredit, "photo_name"> & {
  photo_name_sha256: string;
};

export type SelectedPlacePhotoRecord = {
  slug: string;
  google_photo_url?: string;
  google_photo_attribution?: GooglePhotoAttribution;
  /** Exact true means the canonical build accepted this place's hero. */
  google_photo_policy_passed?: unknown;
};

export type SelectedPlacePhoto = {
  url: string;
  attribution: PublishableGooglePhotoCredit;
};

type RawPhotoCredit = {
  photo_name?: unknown;
  photo_name_sha256?: unknown;
  google_maps_uri?: unknown;
  flag_content_uri?: unknown;
  authors?: unknown;
};

function photoNameSha256(name: string): string {
  return createHash("sha256").update(name, "utf8").digest("hex");
}

/** Both supplied proofs must agree; a malformed extra proof cannot be ignored. */
function hasBoundPhotoIdentity(row: RawPhotoCredit, name: string): boolean {
  const hasName = Object.hasOwn(row, "photo_name");
  const hasDigest = Object.hasOwn(row, "photo_name_sha256");
  return (hasName || hasDigest) &&
    (!hasName || row.photo_name === name) &&
    (!hasDigest || (typeof row.photo_name_sha256 === "string" &&
      PHOTO_NAME_SHA256.test(row.photo_name_sha256) &&
      row.photo_name_sha256 === photoNameSha256(name)));
}

/** Preserve supplied credit fields and recheck the individual photo source. */
function publishablePhotoCredit(row: RawPhotoCredit, name: string): PublishableGooglePhotoCredit | undefined {
  if (typeof row.google_maps_uri !== "string") return undefined;
  const authors = Array.isArray(row.authors)
    ? row.authors.flatMap((author) => {
        if (!author || typeof author !== "object") return [];
        const candidate = author as {
          display_name?: unknown;
          uri?: unknown;
          photo_uri?: unknown;
        };
        const display_name =
          typeof candidate.display_name === "string"
            ? candidate.display_name.trim()
            : "";
        const uri =
          typeof candidate.uri === "string" &&
          candidate.uri.startsWith("https://")
            ? candidate.uri
            : undefined;
        const photo_uri =
          typeof candidate.photo_uri === "string" &&
          candidate.photo_uri.startsWith("https://")
            ? candidate.photo_uri
            : undefined;
        if (!display_name && !uri && !photo_uri) return [];
        return [{ display_name: display_name || undefined, uri, photo_uri }];
      })
    : [];
  const credit: PublishableGooglePhotoCredit = {
    photo_name: name,
    google_maps_uri: row.google_maps_uri,
    flag_content_uri:
      typeof row.flag_content_uri === "string" &&
      row.flag_content_uri.startsWith("https://")
        ? row.flag_content_uri
        : undefined,
    authors,
  };
  return publishableGooglePhotoAttribution(name, [credit]) ? credit : undefined;
}

/**
 * Store a fixed-size fingerprint of the original provider resource identity.
 * The full original attribution must pass publication policy before compacting;
 * identity is never synthesized from a slug, image URL, or author. Only the
 * server adapter and local artifact generator import this Node-only helper.
 */
export function compactGooglePhotoCredit(
  value: unknown,
): CompactGooglePhotoCredit | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as RawPhotoCredit;
  if (typeof row.photo_name !== "string" || !PHOTO_RESOURCE.test(row.photo_name) ||
    !hasBoundPhotoIdentity(row, row.photo_name)) return undefined;
  const credit = publishablePhotoCredit(row, row.photo_name);
  if (!credit) return undefined;
  return {
    photo_name_sha256: photoNameSha256(credit.photo_name),
    google_maps_uri: credit.google_maps_uri,
    flag_content_uri: credit.flag_content_uri,
    authors: credit.authors,
  };
}

/**
 * Bind one selected canonical snapshot to one exact stored source record.
 * Full embedded identities and compact SHA-256 proofs are both accepted.
 * Reconstruct the public resource name only after binding, keeping its original
 * source/author fields and rechecking policy. This does not certify availability.
 */
export function bindSelectedPlacePhotoCredit(
  requestedSlug: string,
  place: SelectedPlacePhotoRecord,
  rawCredit: unknown,
): SelectedPlacePhoto | undefined {
  if (
    requestedSlug !== place.slug ||
    place.google_photo_policy_passed !== true ||
    !place.google_photo_url ||
    !place.google_photo_url.startsWith("/api/place-photo?")
  ) {
    return undefined;
  }
  let proxy: URL;
  try {
    proxy = new URL(place.google_photo_url, PHOTO_PROXY_BASE);
  } catch {
    return undefined;
  }
  if (
    proxy.origin !== PHOTO_PROXY_BASE ||
    proxy.username ||
    proxy.password ||
    proxy.pathname !== "/api/place-photo" ||
    proxy.hash ||
    proxy.searchParams.getAll("name").length !== 1 ||
    proxy.searchParams.getAll("slug").length !== 1 ||
    proxy.searchParams.get("slug") !== requestedSlug
  ) {
    return undefined;
  }
  const name = proxy.searchParams.get("name");
  if (!name || !PHOTO_RESOURCE.test(name) || !rawCredit || typeof rawCredit !== "object") return undefined;
  const row = rawCredit as RawPhotoCredit;
  if (!hasBoundPhotoIdentity(row, name)) return undefined;
  const credit = publishablePhotoCredit(row, name);
  return credit ? { url: place.google_photo_url, attribution: credit } : undefined;
}
