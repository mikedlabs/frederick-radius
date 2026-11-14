import { scopeToParam, setScope, type Scope } from "@/lib/scope";
import { queryWithoutSearchArea } from "@/lib/search/refinement";
import { replaceNativeWorkspaceScope } from "@/components/search/native-request-return";

const SCOPED_ROUTES = new Set(["/search", "/map", "/events", "/today", "/today/tonight", "/ask"]);
/** Client-owned routes whose readers follow ?in directly. Native history keeps
 * them mounted (the live map, Today's cached briefing) and still lets Next's
 * search-parameter readers see the new area. */
const NATIVE_HISTORY_ROUTES = new Set(["/map", "/today"]);

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

/** The router calls a commit may need. Pass `useRouter()`, or wrap its calls
 * in a transition when the caller shows a pending state. */
export type LocationScopeTransport = {
  replace: (href: string, options: { scroll: boolean }) => void;
  refresh: () => void;
};

/**
 * The one writer for a visitor's area choice. It stores the shared area first
 * (in-page listeners such as the map camera react to that event before the
 * URL changes), then brings the current page's URL in line so an old explicit
 * `?in=` cannot win over the new choice.
 */
export function commitLocationScope(next: Scope | null, transport: LocationScopeTransport): void {
  setScope(next);
  const href = locationScopeHref(window.location.href, next);
  if (!href) {
    // Other server surfaces consume the new shared scope cookie directly.
    transport.refresh();
  } else if (window.location.pathname === "/compass") {
    // Refining the current Tools workspace must not intercept itself.
    replaceNativeWorkspaceScope(href);
  } else if (NATIVE_HISTORY_ROUTES.has(window.location.pathname)) {
    // Keep this entry's own state (focus, layer and selection continuity),
    // but drop Next's own markers: with them present its native-history
    // adapter treats the call as its own and skips syncing useSearchParams.
    // It copies its internal fields back onto the object passed here.
    const current: unknown = window.history.state;
    const state: Record<string, unknown> = current && typeof current === "object" ? { ...current } : {};
    delete state.__NA;
    delete state._N;
    window.history.replaceState(state, "", href);
  } else {
    transport.replace(href, { scroll: false });
  }
}
