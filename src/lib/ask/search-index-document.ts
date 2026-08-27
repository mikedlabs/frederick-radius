import { createHash } from "node:crypto";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";

type PublicPlace = ReturnType<typeof publicPlaces>[number];

export type RadiusSearchDocument = {
  id: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

/**
 * Canonical, provider-free text identity for one private search document.
 * The writer and public health checks share this exact hash without loading
 * the optional embedding provider on every health request.
 */
export function buildRadiusSearchDocument(
  raw: PublicPlace,
): RadiusSearchDocument {
  const place = decoratePlace(raw);
  const content = [
    place.name,
    `Category: ${place.category}`,
    `Town: ${place.city || place.municipality}`,
    place.short_blurb,
    place.description,
    place.primary_type,
    place.subcategories?.join(", "),
    place.tags?.join(", "),
    place.known_for?.join("; "),
    place.field_note_tip,
    // The lexical ranker scores these aliases too. Keeping them in the
    // canonical document makes health and refresh agree about its identity.
    place.search_aliases?.join(", "),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8_000);

  return {
    id: place.slug,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    metadata: {
      name: place.name,
      category: place.category,
      municipality: place.municipality,
    },
  };
}

export function radiusSearchDocuments(): RadiusSearchDocument[] {
  return publicPlaces().map(buildRadiusSearchDocument);
}
