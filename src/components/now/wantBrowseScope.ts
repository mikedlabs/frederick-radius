import { scopeToParam, type Scope } from "@/lib/scope";

/**
 * Resolve the location lens carried by a Today map shortcut.
 *
 * The map already owns the honest Near me flow: it requests a location when
 * available and falls back to the county when it is not. Keep that behavior
 * for an unset or Near me preference, but never let the static shortcut erase
 * a town or whole-county choice the visitor deliberately made.
 */
export function resolveWantBrowseScope(storedScope: Scope | null): Scope {
  if (storedScope === "county" || storedScope?.startsWith("town:")) {
    return storedScope;
  }
  return "nearme";
}

/**
 * Replace only the location parameter on a scope-aware map shortcut. Curated
 * pages and inline place-answer routes remain byte-for-byte unchanged.
 */
export function withWantBrowseScope(href: string, scope: Scope): string {
  if (!href.startsWith("/map?")) return href;

  const url = new URL(href, "https://frederickradius.local");
  if (!url.searchParams.has("in")) return href;

  url.searchParams.set("in", scopeToParam(scope));
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}
