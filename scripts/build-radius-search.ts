/**
 * Incrementally index Radius place documents for local search.
 *
 * Prerequisites:
 *   1. Apply drizzle/0025_radius_search_documents.sql and
 *      drizzle/0033_radius_search_embedding_optional.sql by hand in Supabase.
 *   2. Configure DATABASE_URL. OPENAI_API_KEY is optional; without it, the
 *      command still builds the complete full-text index.
 *   3. Run: npm run build:radius-search
 */
import "dotenv/config";
import { closeDb } from "@/lib/db/client";
import { refreshRadiusSearchIndex } from "@/lib/ask/search-index-builder";

async function main() {
  const result = await refreshRadiusSearchIndex();
  console.log(
    `Radius search: ${result.total} places, ${result.changed} changed, ` +
      `${result.processed} indexed, ${result.embedded} embedded ` +
      `(${result.tokenUsage} tokens)`,
  );
  console.log(
    !result.current
      ? `${result.remaining} full-text documents remain for a later run.`
      : result.embeddingWarning
        ? result.embeddingWarning.message
        : !result.embeddingEnabled
          ? "Full-text search is current. Optional semantic vectors are not configured."
          : result.embeddingCurrent
          ? "The configured search index is current."
          : `${result.embeddingRemaining} optional semantic vectors remain.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
