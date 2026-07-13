import { BLOB_STATIC_ASSETS } from "@/data/blob-static-assets.generated";

/**
 * Resolve a committed public asset path to its Blob-hosted mirror when one has
 * been generated. Local paths remain the fallback, so moving assets to Blob can
 * happen in two safe steps: upload + generate the map, then delete local bytes
 * only after the deployed app is verified.
 */
export function staticAsset(src: string): string {
  return BLOB_STATIC_ASSETS[src] ?? src;
}
