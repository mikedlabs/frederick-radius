import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import postcss from "postcss";
import routeCache from "next/dist/server/lib/route-cache-key.js";

const { getRouteCacheKey, isRouteCacheOwner } = routeCache;

const LABEL = ".content-chapter--plain .content-chapter__label";
const RULE = ".content-chapter--plain .content-chapter__rule";
const CONTRACTS = [
  [LABEL, "flex-shrink", (value) => Number.isFinite(value) && value > 0],
  [LABEL, "min-width", zeroLength],
  [LABEL, "overflow-wrap", (value) => value === "anywhere"],
  [RULE, "min-width", zeroLength],
];

function zeroLength(value) {
  return typeof value === "string" && /^0(?:px|rem|em|%)?$/.test(value);
}

function flexShrink(value) {
  if (value === "none") return 0;
  if (value === "auto" || value === "initial") return 1;
  const parts = postcss.list.space(value);
  const number = (part) => /^\+?(?:\d+|\d*\.\d+)$/.test(part ?? "");
  const basis = (part) => part === "auto" || /^(?:0|\d*\.?\d+(?:px|rem|em|%))$/.test(part ?? "");
  if (parts.length === 1 && (number(parts[0]) || basis(parts[0]))) return 1;
  if (parts.length === 2 && number(parts[0])) {
    if (number(parts[1])) return Number(parts[1]);
    if (basis(parts[1])) return 1; // Compiled `0 auto` means `0 1 auto`.
  }
  if (parts.length === 3 && number(parts[0]) && number(parts[1]) && basis(parts[2])) return Number(parts[1]);
  return null; // Unknown/global/variable expressions do not establish shrink.
}

/** A narrow emitted-rule contract, not a CSS computed-cascade engine.
 * Only exact, unconditional root selectors count; comma-combined selectors
 * are supported. Resolve their source order/importance and flex shorthand.
 * Conditional/nested/layer-only rules cannot rescue a missing base rule.
 * Other selectors, viewport conditions and runtime delivery still need the
 * production browser proof, even when this build-artifact contract passes.
 */
export function chapterCssContractErrors(stylesheets) {
  const winners = new Map();
  const errors = [];
  const apply = (selector, property, value, declaration, href) => {
    const key = `${selector}|${property}`;
    const previous = winners.get(key);
    if (previous?.important && !declaration.important) return;
    winners.set(key, { value, important: Boolean(declaration.important), href });
  };
  for (const { href, css } of stylesheets) {
    let ast;
    try { ast = postcss.parse(css, { from: href }); }
    catch (error) { errors.push(`Cannot parse built stylesheet ${href}: ${error.reason ?? error.message}`); continue; }
    ast.walkRules((rule) => {
      if (rule.parent.type !== "root") return;
      for (const selector of rule.selectors.map((value) => value.trim().replace(/\s+/g, " "))) {
        if (selector !== LABEL && selector !== RULE) continue;
        rule.each((declaration) => {
          if (declaration.type !== "decl") return;
          const property = declaration.prop.toLowerCase();
          const value = declaration.value.trim().toLowerCase().replace(/\s+/g, " ");
          if (property === "all") {
            for (const [target, affected] of CONTRACTS) if (target === selector) apply(selector, affected, null, declaration, href);
          } else if (selector === LABEL && property === "flex") {
            apply(selector, "flex-shrink", flexShrink(value), declaration, href);
          } else if (selector === LABEL && property === "flex-shrink") {
            apply(selector, property, /^\+?(?:\d+|\d*\.\d+)$/.test(value) ? Number(value) : null, declaration, href);
          } else if (property === "min-width" || selector === LABEL && ["overflow-wrap", "word-wrap"].includes(property)) {
            apply(selector, property === "word-wrap" ? "overflow-wrap" : property, value, declaration, href);
          }
        });
      }
    });
  }
  for (const [selector, property, accepts] of CONTRACTS) {
    const winner = winners.get(`${selector}|${property}`);
    if (!winner || !accepts(winner.value)) {
      const actual = winner ? JSON.stringify(winner.value) : "missing unconditional declaration";
      errors.push(`${selector}: ${property} must be ${property === "flex-shrink" ? "> 0" : property === "min-width" ? "0" : "anywhere"}; received ${actual}`);
    }
  }
  return errors;
}

const PRESS_TARGET = "[data-press-target]";
const PRESS_FACE = `${PRESS_TARGET}>[data-press-face]`;
const PRESS_ACTIVE = `${PRESS_TARGET}:where(:not(:disabled):not([aria-disabled=true])):active>[data-press-face]`;
const PRESS_STILL = `${PRESS_TARGET}${PRESS_TARGET}:is(:hover,:active,:focus-visible)`;
const PRESS_ACK = `${PRESS_TARGET}${PRESS_TARGET}:where(:not(:disabled):not([aria-disabled=true])):active`;
const PRESS_PENDING = `${PRESS_TARGET}:has(>[data-link-pending=true])`;
// The minifier can merge global focus rules into :is(:focus-visible,
// .search-field-shell:has(input:focus-visible)), raising them to 0,2,1.
// Require the owned 0,3,0 selector so delivered offset/color survive that merge.
const PRESS_FOCUS = `${PRESS_TARGET}${PRESS_TARGET}:focus-visible`;
const PRESS_REDUCED_ACTIVE = `${PRESS_TARGET}:active>[data-press-face]`;
// Lightning CSS lowers transform:none + scale:1 into transform:scale(1).
// Keep that emitted identity equivalent without accepting a moving transform.
const identityScaleTransform = (value) => /^scale\(1(?:,1)?\)$/.test(value);
const noTransform = (value) => value === "none" || identityScaleTransform(value);
const unitScale = (value) => value === "1" || value === "1 1";
const pressScale = (value) => /^scale\(var\(--press-scale,(?:0?\.\d+)\)\)$/.test(value);
const insetAck = (value) => value.startsWith("inset 0 0 0 2px ") && value.includes("var(--press-ack-color,var(--app-focus))");
const PRESS_BASE_CONTRACTS = [
  [PRESS_TARGET, "transform", noTransform],
  [PRESS_TARGET, "scale", unitScale],
  [PRESS_TARGET, "cursor", (value) => value === "pointer"],
  [PRESS_STILL, "transform", noTransform],
  [PRESS_STILL, "scale", unitScale],
  [PRESS_FACE, "transform-origin", (value) => value === "center" || value === "50%" || value === "50% 50%"],
  [PRESS_FACE, "transition", (value) => /^transform(?: |$)/.test(value) && value.includes("var(--app-dur-fast)")],
  [PRESS_ACTIVE, "transform", pressScale],
  [PRESS_ACK, "box-shadow", insetAck],
  [PRESS_PENDING, "box-shadow", insetAck],
  [PRESS_FOCUS, "outline", (value) => value === "2px solid var(--press-focus-color,var(--app-focus))"],
  [PRESS_FOCUS, "outline-offset", (value) => value === "var(--press-focus-offset,3px)"],
];
const PRESS_REDUCED_CONTRACTS = [PRESS_TARGET, PRESS_FACE, PRESS_REDUCED_ACTIVE]
  .flatMap((selector) => [[selector, "transform", noTransform], [selector, "scale", unitScale],
    [selector, "transition", (value) => value === "none"]]);

function pressSelector(value) {
  return value.trim().replace(/\s+/g, " ").replace(/\s*([>,+~])\s*/g, "$1")
    .replace(/\[([\w-]+)=["']([\w-]+)["']\]/g, "[$1=$2]");
}
function pressValue(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/,\s*/g, ",");
}

/** Verify delivery of the actual shared interaction rules, using only the
 * emitted sheets linked by the chosen Today artifact. This deliberately
 * accepts exact root selectors and the direct reduced-motion media block;
 * unrelated, layer-only or other conditional rules cannot establish delivery.
 * It is an emitted-rule guard, not a replacement for browser cascade/hit tests.
 */
export function sharedPressCssContractErrors(stylesheets) {
  const winners = { base: new Map(), reduced: new Map() };
  const errors = [];
  let order = 0;
  for (const { href, css } of stylesheets) {
    let ast;
    try { ast = postcss.parse(css, { from: href }); }
    catch (error) { errors.push(`Cannot parse shared-press stylesheet ${href}: ${error.reason ?? error.message}`); continue; }
    ast.walkRules((rule) => {
      const reduced = rule.parent.type === "atrule" && rule.parent.name.toLowerCase() === "media" &&
        rule.parent.parent?.type === "root" && rule.parent.params.replace(/\s+/g, "").toLowerCase() === "(prefers-reduced-motion:reduce)";
      const scope = rule.parent.type === "root" ? "base" : reduced ? "reduced" : null;
      if (!scope) return;
      const contracts = scope === "base" ? PRESS_BASE_CONTRACTS : PRESS_REDUCED_CONTRACTS;
      for (const rawSelector of rule.selectors) {
        const selector = pressSelector(rawSelector);
        const properties = contracts.filter(([target]) => target === selector).map(([, property]) => property);
        if (!properties.length) continue;
        rule.each((declaration) => {
          if (declaration.type !== "decl") return;
          const property = declaration.prop.toLowerCase();
          for (const affected of property === "all" ? properties : properties.includes(property) ? [property] : []) {
            const key = `${selector}|${affected}`;
            const previous = winners[scope].get(key);
            if (previous?.important && !declaration.important) continue;
            winners[scope].set(key, { value: property === "all" ? null : pressValue(declaration.value),
              important: Boolean(declaration.important), order: order++, href });
          }
        });
      }
    });
  }
  for (const [scope, contracts] of [["base", PRESS_BASE_CONTRACTS], ["reduced", PRESS_REDUCED_CONTRACTS]]) {
    for (const [selector, property, accepts] of contracts) {
      const winner = winners[scope].get(`${selector}|${property}`);
      // An explicit non-unit individual scale still fails. Only absence beside
      // the compiler's identity transform is the accepted lowered shorthand.
      if (property === "scale" && !winner && identityScaleTransform(winners[scope].get(`${selector}|transform`)?.value)) continue;
      if (!winner || typeof winner.value !== "string" || !accepts(winner.value)) errors.push(`Shared press ${scope}: ${selector} ${property} has ${winner ? JSON.stringify(winner.value) : "no qualifying emitted declaration"}`);
    }
  }
  // These equal-specificity face rules must actually override normal motion,
  // including when linked stylesheets split or reverse the rule order.
  for (const [baseSelector, reducedSelector, property] of [
    [PRESS_ACTIVE, PRESS_REDUCED_ACTIVE, "transform"],
    [PRESS_FACE, PRESS_FACE, "transition"],
  ]) {
    const base = winners.base.get(`${baseSelector}|${property}`);
    const reduced = winners.reduced.get(`${reducedSelector}|${property}`);
    if (base && reduced && (base.important && !reduced.important || base.important === reduced.important && base.order > reduced.order)) {
      errors.push(`Shared press reduced: ${reducedSelector} ${property} must override the normal-motion declaration`);
    }
  }
  return errors;
}

function contained(root, path) {
  const inside = relative(root, path);
  return inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside);
}

function stylesheetHrefs(html) {
  const hrefs = [];
  // Next emits quoted rel/href link attributes. Strip script/comment contents
  // so streamed RSC strings or comments cannot masquerade as linked CSS.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  for (const [tag] of markup.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = new Map([...tag.matchAll(/\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
    if (!(attrs.get("rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet")) continue;
    const href = attrs.get("href");
    if (!href) throw new Error("Built Today stylesheet link has no quoted href");
    if (/\bdisabled(?:\s|=|\/?>)/i.test(tag)) continue;
    const media = (attrs.get("media") ?? "").trim().toLowerCase();
    if (media && media !== "all") continue; // Conditional links cannot prove base CSS.
    if (!hrefs.includes(href)) hrefs.push(href);
  }
  return hrefs;
}

function localStylesheetPath(buildRoot, href) {
  let decoded;
  try { decoded = decodeURIComponent(href); }
  catch { throw new Error(`Invalid encoded built stylesheet path: ${href}`); }
  if (!decoded.startsWith("/_next/static/") || /[\\?#]/.test(decoded) || decoded.split("/").some((part) => part === "." || part === "..") ||
      !/^\/_next\/static\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.css$/.test(decoded)) {
    throw new Error(`Built Today stylesheet must be a local /_next/static/*.css asset without traversal, query or hash: ${href}`);
  }
  const path = realpathSync(resolve(buildRoot, decoded.slice("/_next/".length)));
  if (!contained(buildRoot, path) || !statSync(path).isFile()) throw new Error(`Built Today stylesheet escapes current .next output or is not a file: ${href}`);
  return path;
}

function builtArtifactPath(buildRoot, path, label) {
  const actual = realpathSync(resolve(buildRoot, path));
  if (!contained(buildRoot, actual) || !statSync(actual).isFile()) {
    throw new Error(`Built ${label} escapes current .next output or is not a file`);
  }
  return actual;
}

function builtJson(buildRoot, path, label) {
  const value = JSON.parse(readFileSync(builtArtifactPath(buildRoot, path, label), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Built ${label} is not an object`);
  return value;
}

function todayHtmlPath(buildRoot, result) {
  const required = builtJson(buildRoot, "required-server-files.json", "required-server-files manifest");
  const config = required.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Built required-server-files manifest has no config object");
  if (config.adapterPath != null && typeof config.adapterPath !== "string") throw new Error("Built config adapterPath must be a string when set");
  // Match installed Next 16's export/worker useScopedBuildArtifacts predicate.
  // The emitted config can redact the actual adapter path; never import it.
  const scoped = Boolean(config.adapterPath) && config.output !== "export";
  result.layout = scoped ? "scoped-route-cache" : "legacy-app";

  const prerenders = builtJson(buildRoot, "prerender-manifest.json", "prerender manifest");
  const prerender = prerenders.routes?.["/today"];
  if (!prerender || prerender.routeType !== "page" || prerender.response !== "complete" || prerender.compute !== "static" ||
      prerender.dataRoute !== "/today.rsc" || prerenders.notFoundRoutes?.includes("/today") || prerenders.dynamicRoutes?.["/today"] ||
      !(prerender.initialRevalidateSeconds === false || Number.isFinite(prerender.initialRevalidateSeconds) && prerender.initialRevalidateSeconds > 0)) {
    throw new Error("Built /today must be a complete static APP_PAGE prerender with /today.rsc and nonzero revalidation");
  }
  const pathRoutes = builtJson(buildRoot, "app-path-routes-manifest.json", "app-path-routes manifest");
  const appPaths = builtJson(buildRoot, "server/app-paths-manifest.json", "app-paths manifest");
  const sources = Object.entries(pathRoutes).filter(([, pathname]) => pathname === "/today").map(([source]) => source);
  if (sources.length !== 1 || !sources[0].startsWith("/") || !sources[0].endsWith("/page") ||
      typeof appPaths[sources[0]] !== "string" || !appPaths[sources[0]].endsWith("/page.js")) {
    throw new Error("Built /today must have one APP_PAGE owner shared by app-path-routes and app-paths manifests");
  }
  const owner = { kind: "APP_PAGE", sourceRoute: sources[0] };
  if (!isRouteCacheOwner("/today", owner, prerender, config.i18n?.locales)) throw new Error("Built /today prerender source does not match its APP_PAGE owner");
  result.owner = owner;
  // Use Next's pinned key implementation, including route-group source identity.
  const key = getRouteCacheKey("/today", owner);
  result.routeCacheKey = key;
  const html = scoped ? `server${key}.html` : "server/app/today.html";
  result.htmlPath = resolve(buildRoot, html);
  const htmlPath = builtArtifactPath(buildRoot, html, "Today HTML");
  const metaPath = html.replace(/\.html$/, ".meta");
  result.metaPath = resolve(buildRoot, metaPath);
  const meta = builtJson(buildRoot, metaPath, "Today metadata");
  if (meta.routeCache?.key !== key || meta.routeCache?.owner?.kind !== owner.kind ||
      meta.routeCache?.owner?.sourceRoute !== owner.sourceRoute || meta.routeCache?.isFallback !== false) {
    throw new Error("Built Today metadata must match the selected non-fallback route-cache key and APP_PAGE owner");
  }
  return htmlPath;
}

/** Read only manifest-identified Today HTML and the local CSS it actually links.
 * Emitted config selects exactly one Next artifact layout. No legacy rescue,
 * cache scan, source CSS fallback, fetch, adapter execution or regeneration.
 */
export function validateBuiltCssContract(root) {
  const result = { layout: null, owner: null, routeCacheKey: null, htmlPath: null, metaPath: null, stylesheets: [], errors: [] };
  try {
    const buildRoot = realpathSync(resolve(root, ".next"));
    const htmlPath = todayHtmlPath(buildRoot, result);
    const hrefs = stylesheetHrefs(readFileSync(htmlPath, "utf8"));
    if (hrefs.length === 0) throw new Error("Built Today HTML has no unconditional stylesheet links");
    const stylesheets = hrefs.map((href) => {
      const path = localStylesheetPath(buildRoot, href);
      const bytes = readFileSync(path);
      result.stylesheets.push({ href, path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      return { href, css: bytes.toString("utf8") };
    });
    result.errors.push(...chapterCssContractErrors(stylesheets), ...sharedPressCssContractErrors(stylesheets));
  } catch (error) { result.errors.push(`Cannot validate built Today CSS: ${error.message}`); }
  return result;
}
