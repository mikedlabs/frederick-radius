import { browseReturnFromLocation, normalizeBrowseReturnTo, withBrowseReturnTo } from "@/lib/browse-return";
import { parseScope, scopeToParam, type Scope } from "@/lib/scope";

const BASE = "https://frederick-radius.invalid";

/** Carry the visitor's public scope and exact listing back through planning.
 * Device coordinates and personal list names never become plan inputs. */
export function placePlanHref(slug: string, location?: URL, fallbackScope?: Scope | null): string {
  const returnTo = location ? browseReturnFromLocation(location) : null;
  const origin = returnTo ? new URL(returnTo, BASE) : location;
  const scope = parseScope(origin?.searchParams.get("in")) ?? fallbackScope ?? "county";
  const params = new URLSearchParams({ place: slug, in: scopeToParam(scope) });
  return withBrowseReturnTo(`/plan?${params}`, returnTo);
}

/** Local edits retain the journey. Shared links deliberately use only ?p=. */
export function updatedPlanHref(current: URL, token?: string): string {
  const params = new URLSearchParams();
  if (token) params.set("p", token);
  const scope = parseScope(current.searchParams.get("in"));
  if (scope) params.set("in", scopeToParam(scope));
  const returnTo = normalizeBrowseReturnTo(current.searchParams.get("returnTo"));
  if (returnTo) params.set("returnTo", returnTo);
  const query = params.toString();
  return `/plan${query ? `?${query}` : ""}`;
}
