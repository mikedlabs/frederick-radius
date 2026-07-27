/**
 * Incrementally embed Radius place documents for hybrid search.
 *
 * Prerequisites:
 *   1. Apply drizzle/0025_radius_search_documents.sql by hand in Supabase.
 *   2. Configure DATABASE_URL and AI Gateway auth.
 *   3. Run: npm run build:radius-search
 */
import "dotenv/config";
import { closeDb } from "@/lib/db/client";
import { refreshRadiusSearchIndex } from "@/lib/ask/search-index-builder";

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "AI Gateway auth is required. Set AI_GATEWAY_API_KEY or run `vercel env pull` for a short-lived VERCEL_OIDC_TOKEN.",
    );
  }
  const result = await refreshRadiusSearchIndex();
  console.log(
    `Radius search: ${result.total} places, ${result.changed} changed, ` +
      `${result.processed} embedded (${result.tokenUsage} tokens)`,
  );
  console.log("Radius search index is current.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
