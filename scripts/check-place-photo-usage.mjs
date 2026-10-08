#!/usr/bin/env node
/**
 * Place-photo usage guard — lightweight, Node built-ins only (the
 * check-zindex pattern).
 *
 * The same-origin place-photo proxy answers a daily cap, rate limit, missing
 * key or upstream error with a 200 image, so a component that paints a proxy
 * URL with a plain `<Image>` or `<img>` cannot tell the fallback plate from a
 * photograph. In the October 2026 audit, 19 of 26 photo surfaces drew that
 * plate as if it were a photo and some credited a photographer under it.
 * `src/components/ui/RadiusPhoto.tsx` is the one primitive that asks for the
 * proxy's failure signal, treats it as missing, and holds credits until a real
 * image loads.
 *
 * Flags, in component and page .tsx/.jsx under src/ (route handlers, specs and
 * stories excluded): any code (not comments) that mentions the proxy path.
 * Inspecting, building or painting a proxy URL means the file paints a place
 * photo, and that belongs to RadiusPhoto.
 *
 * Allowed:
 *   - APPROVED: the primitive and the helpers that own the failure-signal
 *     contract it is built on.
 *   - SIGNAL_AWARE: files fixed before RadiusPhoto existed (batch 1 and
 *     earlier). Each must still carry the failure-signal handling, or the
 *     check fails.
 *   - PENDING: known debt that still paints the proxy without the signal.
 *     Migrate each to RadiusPhoto and delete its entry. The list only shrinks.
 *
 * A listed file that no longer mentions the proxy is reported so its entry can
 * be removed; that is a notice, not a failure, because parallel work may
 * migrate a file before this list is edited.
 *
 *   node scripts/check-place-photo-usage.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROXY_PATH = "/api/place-photo";

export const APPROVED = new Set([
  "src/components/ui/RadiusPhoto.tsx",
  "src/components/place/PlaceHeroMedia.tsx",
  "src/components/place/PlacePhotoState.tsx",
]);

export const SIGNAL_AWARE = new Set([
  // Batch 1 (October 2026) routed these through the failure signal. EventCard
  // and the events/[slug] hero did too, through PlacePhotoScope, and no
  // longer mention the proxy, so they need no entry.
  "src/components/place/PlaceSheet.tsx",
  "src/components/map/MapPeek.tsx",
  "src/components/event/EventSheet.tsx",
  "src/components/ask/AskFrederick.tsx",
  // Earlier fixes that request and honor the signal themselves.
  "src/components/place/PlaceMedallion.tsx",
  "src/components/place/PlacePhotoGallery.tsx",
  "src/components/search/SearchResultImage.tsx",
  "src/components/beer/BreweryPhoto.tsx",
  "src/components/today/DaypartNeeds.tsx",
]);

export const PENDING = new Set([
  "src/components/ui/PhotoLightbox.tsx",
  "src/components/place/PlacePhoto.tsx",
  "src/components/plan/PlanBuilder.tsx",
  "src/components/today/PhotoMosaic.tsx",
  // Internal review tool, not a public surface.
  "src/app/admin/discovered-review/page.tsx",
]);

/** Evidence that a file still requests and honors the proxy's failure signal. */
const SIGNAL_CONTRACT =
  /fallback[^\n]{0,40}signal|FailureSignal|usePlacePhotoState|PlacePhotoScope|RadiusPhoto|naturalWidth\s*(?:<=|===?)\s*1/;

const SCAN_ROOT = "src";
const EXCLUDE_DIRS = [`src${sep}app${sep}api${sep}`];
const SCANNED = /\.(?:tsx|jsx)$/;
const SKIPPED = /\.(?:spec|test|stories)\.(?:tsx|jsx)$/;

/**
 * Remove // and block comments while keeping string and template literal
 * contents, so a path written in a comment is not a hit and a path built in a
 * template string is.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      // Quotes and apostrophes cannot span lines. An apostrophe in JSX text
      // ("Here's") is not a string, so it must not swallow the next comment.
      if (ch === quote || (ch === "\n" && quote !== "`")) quote = null;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      // Keep line breaks so reported line numbers stay true.
      out += source.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    // An apostrophe right after a letter is a contraction in JSX text
    // ("Here's"), not the start of a string.
    const contraction = ch === "'" && /[A-Za-z0-9]/.test(source[i - 1] ?? "");
    if ((ch === '"' || ch === "'" || ch === "`") && !contraction) quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

/** Line numbers (1-based) where code mentions the proxy path. */
export function proxyMentions(source) {
  const lines = stripComments(source).split("\n");
  const hits = [];
  lines.forEach((line, index) => {
    if (line.includes(PROXY_PATH)) hits.push({ line: index + 1, text: line.trim() });
  });
  return hits;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.some((excluded) => `${path}${sep}`.startsWith(excluded))) continue;
      walk(path, out);
    } else if (SCANNED.test(entry.name) && !SKIPPED.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Audit a set of files. `files` maps a repo-relative POSIX path to its source.
 * Returns failures (block the check) and notices (stale list entries).
 */
export function auditPlacePhotoUsage(files) {
  const failures = [];
  const notices = [];
  const mentioning = new Set();
  for (const [file, source] of files) {
    const hits = proxyMentions(source);
    if (hits.length === 0) continue;
    mentioning.add(file);
    if (APPROVED.has(file) || PENDING.has(file)) continue;
    if (SIGNAL_AWARE.has(file)) {
      if (!SIGNAL_CONTRACT.test(stripComments(source))) {
        failures.push(
          `${file}: listed as signal-aware but no longer requests or checks the failure signal. Use RadiusPhoto.`,
        );
      }
      continue;
    }
    for (const hit of hits) {
      failures.push(`${file}:${hit.line}  ${hit.text.slice(0, 110)}`);
    }
  }
  for (const file of [...SIGNAL_AWARE, ...PENDING]) {
    if (files.has(file) && !mentioning.has(file)) {
      notices.push(`${file} no longer mentions the proxy; remove its entry.`);
    }
  }
  return { failures, notices, scanned: files.size };
}

function main() {
  const files = new Map();
  for (const path of walk(SCAN_ROOT)) {
    files.set(relative(process.cwd(), path).split(sep).join("/"), readFileSync(path, "utf8"));
  }
  const { failures, notices, scanned } = auditPlacePhotoUsage(files);
  for (const notice of notices) console.log(`check-place-photo-usage: notice: ${notice}`);
  if (failures.length > 0) {
    console.error(
      `check-place-photo-usage: ${failures.length} place-photo use(s) outside RadiusPhoto.\n` +
        "Paint place and venue photos with src/components/ui/RadiusPhoto.tsx, which requests the\n" +
        "proxy's failure signal and waits for a real image before any credit.\n",
    );
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-place-photo-usage: ${scanned} files scanned, ${PENDING.size} pending migration, 0 new place-photo uses outside RadiusPhoto.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
