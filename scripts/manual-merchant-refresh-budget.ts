/** Offline preflight only. Reserve before a separately authorized manual read;
 * this script never receives provider credentials or contacts a provider. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MERCHANT_HOURS_SOURCES } from "../src/lib/merchant-hours";

const { checkManualMerchantBudget, reserveManualMerchantAttempt } = createRequire(import.meta.url)("./lib/manual-merchant-budget.cjs") as {
  checkManualMerchantBudget: (options: { ledgerPath: string; approvedSources: { slug: string; url: string }[] }) => { allowed: boolean };
  reserveManualMerchantAttempt: (options: { ledgerPath: string; approvedSources: { slug: string; url: string }[]; slug: string }) => { allowed: boolean };
};

export function manualMerchantBudgetOptions(args: string[]): { ledgerPath: string; slug?: string } {
  let ledgerPath: string | undefined, mode: "check" | "reserve" | undefined, slug: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--ledger" || argument.startsWith("--ledger=")) {
      if (ledgerPath !== undefined) throw new Error("Duplicate ledger argument.");
      ledgerPath = argument === "--ledger" ? args[++i] : argument.slice("--ledger=".length);
      if (!ledgerPath || ledgerPath.startsWith("--")) throw new Error("An absolute private ledger path is required.");
    } else if (argument === "--check") {
      if (mode) throw new Error("Choose exactly one check or reserve operation.");
      mode = "check";
    } else if (argument.startsWith("--reserve=")) {
      if (mode) throw new Error("Choose exactly one check or reserve operation.");
      mode = "reserve"; slug = argument.slice("--reserve=".length);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("An exact reviewed source slug is required.");
    } else throw new Error("Only --ledger ABSOLUTE_PRIVATE_PATH and --check or --reserve=EXACT_SLUG are supported.");
  }
  if (!ledgerPath || !mode) throw new Error("Require --ledger ABSOLUTE_PRIVATE_PATH and --check or --reserve=EXACT_SLUG.");
  return { ledgerPath, ...(mode === "reserve" ? { slug } : {}) };
}
function main() {
  try {
    const options = manualMerchantBudgetOptions(process.argv.slice(2));
    const approvedSources = MERCHANT_HOURS_SOURCES.filter((source) => "collection" in source && source.collection === "manual").map(({ slug, url }) => ({ slug, url }));
    const result = options.slug
      ? reserveManualMerchantAttempt({ ...options, slug: options.slug, approvedSources })
      : checkManualMerchantBudget({ ...options, approvedSources });
    console.log(JSON.stringify(result));
    if (!result.allowed) process.exitCode = 1;
  } catch (error) {
    // No filesystem paths, account balances, receipt bodies or provider errors.
    const known = error instanceof Error && error.name === "ManualMerchantBudgetError";
    console.error(JSON.stringify({ allowed: false, reason: known && "code" in error ? error.code : "invalid_request", message: known ? error.message : "The manual preflight could not be verified; no read is authorized. Require only --ledger ABSOLUTE_PRIVATE_PATH and --check or --reserve=EXACT_SLUG." }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
