/**
 * Standalone Google Place sanitizer — the one place every raw Google
 * Places (New) response gets normalized into a Frederick Radius-shape
 * `DiscoveredPlace`. Re-exported from the searchNearby module so the
 * shape stays consistent across every entry point (the searchNearby
 * fetcher, the planned searchText fetcher, the autocomplete details
 * lookup, and any future Place Details enrichment).
 *
 * Importing from here keeps callers free of the larger searchNearby
 * module weight when they only need the parser.
 */
import "server-only";
export {
  sanitizeGooglePlace,
  isInFrederickCounty,
  uiTagFor,
  type DiscoveredPlace,
} from "@/lib/integrations/google-nearby";
