import { scopeToParam, type Scope } from "@/lib/scope";
import { queryWithoutSearchArea } from "@/lib/search/refinement";

const SCOPED_ROUTES = new Set(["/search", "/map", "/events", "/today", "/ask"]);

/** Refinement updates the current route instead of leaving an old explicit
 * town in control. Preserve camera, date, result type, and the return journey. */
export function locationScopeHref(currentHref: string, scope: Scope | null): string | null {
  const url = new URL(currentHref);
  if (!SCOPED_ROUTES.has(url.pathname) && !url.searchParams.has("in")) return null;
  url.searchParams.set("in", scopeToParam(scope ?? "county"));
  const query = url.searchParams.get("q");
  if (query) {
    const refined = queryWithoutSearchArea(query);
    if (refined) url.searchParams.set("q", refined);
    else url.searchParams.delete("q");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
