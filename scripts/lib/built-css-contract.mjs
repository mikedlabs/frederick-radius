import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import postcss from "postcss";
import { JSDOM } from "jsdom";
import { require as loadTypeScript } from "tsx/cjs/api";
import { readProductionTodayDocuments, todayDeploymentId } from "./production-today-documents.mjs";

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

function stylesheetHrefs(document) {
  const hrefs = new Set();
  for (const link of document.querySelectorAll("link[rel]")) {
    if (!link.rel.toLowerCase().split(/\s+/).includes("stylesheet") || link.hasAttribute("disabled") || link.closest("noscript")) continue;
    const media = link.media.trim().toLowerCase();
    if (media && media !== "all") continue;
    const href = link.getAttribute("href");
    if (!href) throw new Error("Built Today stylesheet link has no href");
    hrefs.add(href);
  }
  return [...hrefs];
}

function localStylesheetPath(buildRoot, href, deploymentId) {
  // Next can append the exact build's deployment token for skew protection.
  if (deploymentId && /^[a-z0-9_-]+$/i.test(deploymentId)) {
    const suffix = `?dpl=${deploymentId}`;
    if (href.endsWith(suffix)) href = href.slice(0, -suffix.length);
  }
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

function todayOwner(buildRoot, env) {
  const required = builtJson(buildRoot, "required-server-files.json", "required-server-files manifest");
  const config = required.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Built required-server-files manifest has no config object");
  const prerenders = builtJson(buildRoot, "prerender-manifest.json", "prerender manifest");
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!record(prerenders.routes) || !record(prerenders.dynamicRoutes) || !Array.isArray(prerenders.notFoundRoutes)
      || config.output === "export" || Object.hasOwn(prerenders.routes, "/today")
      || Object.hasOwn(prerenders.dynamicRoutes, "/today") || prerenders.notFoundRoutes.includes("/today")) {
    throw new Error("Built /today must render its exact request area as a server page");
  }
  const routes = builtJson(buildRoot, "app-path-routes-manifest.json", "app-path-routes manifest");
  const appPaths = builtJson(buildRoot, "server/app-paths-manifest.json", "app-paths manifest");
  const sources = Object.keys(routes).filter(source => routes[source] === "/today");
  const [sourceRoute] = sources;
  if (sources.length !== 1 || !sourceRoute.startsWith("/") || !sourceRoute.endsWith("/page")
      || appPaths[sourceRoute] !== `app${sourceRoute}.js`) {
    throw new Error("Built /today must have one APP_PAGE owner shared by app-path-routes and app-paths manifests");
  }
  builtArtifactPath(buildRoot, `server/${appPaths[sourceRoute]}`, "Today page bundle");
  const id = todayDeploymentId(config, env);
  return { owner: { kind: "APP_PAGE", sourceRoute }, deploymentId: config.supportsImmutableAssets ? undefined : id };
}

const expectedPaths = { county: "/today", brunswick: "/today", "mount-airy": "/today?in=mount-airy", nearme: "/today?in=nearme" };
const loopbackOrigin = "http://127.0.0.1";

function matchesImage(image, expected) {
  if (!image?.alt || !image.getAttribute("src")) return false;
  const url = new URL(image.getAttribute("src"), loopbackOrigin);
  if (url.origin !== loopbackOrigin) return false;
  return url.pathname === "/_next/image" ? url.searchParams.get("url") === expected : decodeURIComponent(url.pathname) === expected;
}

function checkArea(document, area, subjects) {
  const scenes = [...document.querySelectorAll("main [data-today-local-discovery]")].filter(scene => !scene.closest("[hidden], [inert], [aria-hidden=true], noscript"));
  if (scenes.length !== 1) throw new Error(`Expected one visible server-rendered discovery section for ${area}`);
  const [scene] = scenes;
  const photo = scene.querySelector("[data-today-feature-photo] img");
  const map = scene.querySelector("[data-today-map-link]");
  if (area === "county") {
    const link = photo?.closest("a[href]");
    const url = new URL(link?.getAttribute("href") ?? "/", loopbackOrigin);
    url.searchParams.delete("returnTo");
    if (map || url.origin !== loopbackOrigin || !subjects.walks.some(guide =>
      matchesImage(photo, guide.downtown) && url.pathname + url.search === guide.downtownHref)) {
      throw new Error("County document lost its published walk photograph or destination");
    }
  } else if (subjects.places[area]) {
    const expected = subjects.places[area];
    const place = scene.querySelector("[data-today-geographic-place]");
    const url = new URL(place?.getAttribute("href") ?? "/", loopbackOrigin);
    if (photo || map || !matchesImage(place?.querySelector("img"), expected.src)
        || place?.getAttribute("data-today-geographic-place") !== expected.slug || url.origin !== loopbackOrigin
        || url.pathname !== `/places/${expected.slug}` || url.searchParams.get("in") !== area) {
      throw new Error(`Document for ${area} lost its published place photograph or destination`);
    }
  } else {
    const url = new URL(map?.getAttribute("href") ?? "/", loopbackOrigin);
    const chart = map?.querySelector("[data-county-locator]");
    const marks = chart?.querySelectorAll("[data-locator-selection]");
    if (photo || !chart?.querySelector('svg[role="img"]') || url.origin !== loopbackOrigin || url.pathname !== "/map" || url.searchParams.get("in") !== area
        || (area === "nearme" ? marks.length !== 0 : marks.length !== 1 || marks[0].getAttribute("data-locator-selection") !== "Town center" || !chart.querySelector("figcaption")?.textContent.includes("Town center: Mount Airy"))) {
      throw new Error(`Expected the correct county map, selection and destination for ${area}`);
    }
  }
}

/** Check only assets linked, in cascade order, by actual documents from this
 * build. CSS and page bundles must resolve under its emitted artifact root. */
export function validateBuiltCssContract(root, documents, subjects, env = {}) {
  const result = { layout: "request-rendered", owner: null, documents: [], stylesheets: [], errors: [] };
  try {
    const buildRoot = realpathSync(resolve(root, ".next"));
    const { owner, deploymentId } = todayOwner(buildRoot, env);
    result.owner = owner;
    if (!Array.isArray(documents) || documents.length !== Object.keys(expectedPaths).length
        || new Set(documents.map(doc => doc.area)).size !== documents.length) throw new Error("Missing or duplicate Today request area");
    const assets = new Map();
    const analyzedOrders = new Set();
    for (const { area, path, html } of documents) {
      if (!Object.hasOwn(expectedPaths, area) || path !== expectedPaths[area]) throw new Error(`Unexpected Today request area or path: ${area}`);
      const dom = new JSDOM(html);
      let hrefs;
      try {
        checkArea(dom.window.document, area, subjects);
        hrefs = stylesheetHrefs(dom.window.document);
      } finally { dom.window.close(); }
      if (!hrefs.length) throw new Error(`Built Today HTML for ${area} has no unconditional stylesheet links`);
      result.documents.push({ area, path, hrefs });
      const order = JSON.stringify(hrefs);
      if (analyzedOrders.has(order)) continue;
      analyzedOrders.add(order);
      for (const href of hrefs) {
        if (assets.has(href)) continue;
        const asset = localStylesheetPath(buildRoot, href, deploymentId);
        const bytes = readFileSync(asset);
        if (!bytes.length) throw new Error(`Built Today stylesheet is empty: ${href}`);
        result.stylesheets.push({ href, path: asset, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        assets.set(href, { href, css: bytes.toString("utf8") });
      }
      const sheets = hrefs.map(href => assets.get(href));
      result.errors.push(...chapterCssContractErrors(sheets), ...sharedPressCssContractErrors(sheets));
    }
  } catch (error) { result.errors.push(`Cannot validate built Today CSS: ${error.message}`); }
  return result;
}

export async function verifyProductionToday(root, buildEnv) {
  try {
    // Validate the owner and emitted config before booting any code from the build.
    todayOwner(realpathSync(resolve(root, ".next")), buildEnv);
    const { downtownFeatureForToday } = loadTypeScript(resolve(root, "src/lib/today/local-outing-guides.ts"), import.meta.url);
    const { localDiscoveryPlaces } = loadTypeScript(resolve(root, "src/lib/today/discovery-places.ts"), import.meta.url);
    const started = new Date();
    const documents = await readProductionTodayDocuments(root, buildEnv);
    // The clock can cross a daypart or date boundary while the requests run.
    const walks = [downtownFeatureForToday(started), downtownFeatureForToday(new Date())];
    const places = {};
    for (const town of ["brunswick", "mount-airy"]) {
      const [place] = localDiscoveryPlaces(`town:${town}`);
      if (place) places[town] = { slug: place.slug, src: place.photoPlan.sources[0].src };
    }
    return validateBuiltCssContract(root, documents, { walks, places }, buildEnv);
  } catch (error) {
    return { errors: [`Cannot verify production Today documents: ${error.message}`] };
  }
}
