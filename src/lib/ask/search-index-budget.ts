import "server-only";
import {
  reserveDailyUsage,
  type UsageReservation,
} from "@/lib/usage-meter";

/**
 * Scheduled semantic vectors are optional. The required Radius search index is
 * Postgres full text, so the paid layer starts at zero and needs its own
 * explicit switch, credential, and code-bounded daily document allowance.
 */
export const DEFAULT_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = 0;
export const MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT = 512;

export function radiusSearchEmbeddingDailyDocumentLimit(
  raw: string | number | undefined =
    process.env.RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT,
): number {
  if (raw === undefined) {
    return DEFAULT_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;
  }
  const normalized = typeof raw === "number" ? raw : raw.trim();
  if (normalized === "") {
    return DEFAULT_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;
  }
  const parsed =
    typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return DEFAULT_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT;
  }
  return Math.min(
    parsed,
    MAX_RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT,
  );
}

export function radiusSearchSemanticRequested(
  raw: string | undefined = process.env.RADIUS_SEARCH_SEMANTIC_ENABLED,
): boolean {
  return raw === "1";
}

export function radiusSearchSemanticConfigured(): boolean {
  return (
    radiusSearchSemanticRequested() &&
    radiusSearchEmbeddingDailyDocumentLimit() > 0 &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  );
}

export async function reserveRadiusSearchEmbeddingDocuments(
  documents: number,
): Promise<UsageReservation | null> {
  if (!radiusSearchSemanticConfigured()) {
    return { reserved: false, count: 0 };
  }
  if (!Number.isSafeInteger(documents) || documents <= 0) return null;
  return reserveDailyUsage(
    "radius_search_embedding",
    radiusSearchEmbeddingDailyDocumentLimit(),
    documents,
  );
}
