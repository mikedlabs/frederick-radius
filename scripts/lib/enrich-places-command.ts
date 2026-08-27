export type EnrichPlacesCommandScope = {
  slugs: readonly string[] | null;
  needsEnrichment: boolean;
  dfpThin: boolean;
  all: boolean;
};

function shellArg(value: string): string {
  return /^[a-zA-Z0-9_./:@,+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Print a copyable paid command without widening the scope reviewed in the
 * dry run. The explicit limit is part of that review and must survive too.
 */
export function enrichPlacesLiveCommand(
  scope: EnrichPlacesCommandScope,
  limit: number,
): string {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Enrichment command limit must be a positive whole number.");
  }
  const namedScopes = [
    Boolean(scope.slugs),
    scope.needsEnrichment,
    scope.dfpThin,
    scope.all,
  ].filter(Boolean).length;
  if (namedScopes > 1) {
    throw new Error("Enrichment command requires exactly one reviewed scope.");
  }

  const scopeArgs = scope.slugs
    ? ["--slug", scope.slugs.join(",")]
    : scope.needsEnrichment
      ? ["--needs-enrichment"]
      : scope.dfpThin
        ? ["--dfp-thin"]
        : scope.all
          ? ["--all"]
          : [];
  const args = [
    ...scopeArgs,
    "--live",
    "--confirm",
    "--limit",
    String(limit),
  ];
  return `npm run enrich -- ${args.map(shellArg).join(" ")}`;
}
