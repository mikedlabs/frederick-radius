#!/usr/bin/env node
/**
 * Type-scale ratchet. Holds the visual floor while the October 2026 UI and UX
 * review burns down hand-sized type, so no change can quietly add more of it.
 *
 * The product type scale starts at an 11 px caption (docs/brand/BRAND_GUIDE.md,
 * "Product type scale"), and docs/VISUAL_FIRST.md asks for floors enforced with
 * the same ratchet pattern as scripts/style-lint-baseline.json. When this check
 * was added, the app and its components held thousands of bracketed pixel text
 * sizes and hundreds of sizes below the caption floor. That debt is recorded per
 * file in scripts/type-scale-baseline.json, and this check fails when any file
 * under src/app/(app) or src/components grows a count past its baseline:
 *
 *   arbitraryTextSize   a Tailwind text size written as a bracketed length
 *                       (px, rem, em, or a clamp/calc/min/max function)
 *                       instead of a step on the named scale
 *   subElevenFont       any font size below the 11 px caption: a bracketed
 *                       Tailwind text size, a style-object fontSize, a
 *                       style.fontSize assignment, or a CSS font-size
 *   uppercaseTracking   uppercase text that also changes its letter spacing
 *                       (the tracked-caps eyebrow), counted once per class
 *                       string, style object, or CSS rule
 *   activeScale         a press-shrink literal: the Tailwind active-scale
 *                       variant, a whileTap scale, or an :active CSS rule
 *                       that scales by a number
 *   strokeWidthLiteral  a numeric stroke width on an icon or SVG shape
 *   eyebrowClass        a use of a global caps-label class (eyebrow,
 *                       fg-eyebrow, or content-chapter__label) inside a TS
 *                       or TSX string, counted once per class token
 *   moduleUppercase     a CSS module rule that sets text-transform to
 *                       uppercase, with or without added letter spacing
 *
 * The last two hold the "Headings are type" rule in the brand guide: caps
 * belong to date plates, day letters, and the Beta chip, and a section is
 * named by a SectionHeading or a disclosure row in sentence case. A prop or
 * variable that happens to be called eyebrow is not a class use, so only
 * string literals are read for that rule.
 *
 * Counts are per file and per rule, not per line, so moving existing code
 * within a file does not fail the check. Adding another instance does. A count
 * that falls below its baseline is reported so the reduction can be locked in.
 *
 * Deliberately out of scope:
 *   - specs, stories, test fixtures, and type declarations, which quote
 *     these patterns or feed tests rather than ship;
 *   - comments;
 *   - SVG fontSize attributes, whose numbers are viewBox units, not pixels;
 *   - map paint files (MAP_PAINT_FILES below), whose numbers size GL layers
 *     or canvas-drawn marker images rather than type a person reads in the DOM.
 *
 * Usage:
 *   npm run lint:type-scale              check the tree against the baseline
 *   npm run lint:type-scale -- --write   regenerate the baseline from the tree
 *
 * Regenerate the baseline to lock in a reduction, or for an owner-reviewed
 * exception named in the commit message. When several UI branches land
 * together, the integrator regenerates once after the last one and reviews
 * the baseline diff: every number that rose in it is debt someone added.
 *
 * Node built-ins only, so the style job can run it without a build.
 *
 * This file contains no literal example utilities, for the reason given in
 * scripts/check-colors.mjs: Tailwind's content scanner reads scripts too and
 * would mint a utility from one. Brackets in the patterns below are escaped.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const BASELINE_FILE = "scripts/type-scale-baseline.json";
export const SCAN_ROOTS = ["src/app/(app)", "src/components"];

/**
 * Files whose numeric sizes describe map paint: GL layer layout, or marker
 * images drawn on a canvas and handed to the map as sprites. They are not DOM
 * type, so the floor does not apply to them.
 */
export const MAP_PAINT_FILES = new Set([
  "src/components/map/categoryMarkers.ts",
  "src/components/map/countySpotlight.ts",
  "src/components/map/mapboxFieldGuideStyle.ts",
  "src/components/map/mapboxTrafficStyle.ts",
]);

export const RULES = {
  arbitraryTextSize: "Tailwind text size written as a bracketed length instead of a named step",
  subElevenFont: "font size below the 11 px caption floor",
  uppercaseTracking: "uppercase text with changed letter spacing, the tracked-caps eyebrow",
  activeScale: "press-shrink scale literal",
  strokeWidthLiteral: "numeric stroke width literal",
  eyebrowClass: "global caps-label class (eyebrow, fg-eyebrow, content-chapter__label) instead of a heading in sentence case",
  moduleUppercase: "CSS module rule that sets uppercase text",
};
const RULE_NAMES = Object.keys(RULES);

const CAPTION_FLOOR_PX = 11;
const ROOT_FONT_PX = 16;

const SOURCE_FILE = /\.(?:tsx?|css)$/;
const NOT_PRODUCT_SOURCE = /\.(?:spec|test|stories)\.tsx?$|\.d\.ts$|[-.]fixtures?\.tsx?$/;

// --- Patterns ------------------------------------------------------------
// A bracketed Tailwind text size. Variant prefixes (sm, hover, group-hover)
// end in a colon, which the lookbehind allows.
const ARBITRARY_TEXT_SIZE =
  /(?<![\w-])text-\[(?:length:)?(?:(\d*\.?\d+)(px|rem|em)|(?:clamp|calc|min|max)\(\s*(?:(\d*\.?\d+)(px|rem)\b)?)/g;
// A style-object fontSize. The SVG attribute form uses "=" and is not matched.
const STYLE_FONT_SIZE = /(?<![\w-])fontSize\s*:\s*/g;
const DOM_FONT_SIZE = /\.style\.fontSize\s*=(?!=)\s*/g;
const CSS_FONT_SIZE = /(?<![\w-])font-size\s*:\s*(\d*\.?\d+)(px|rem)\b/g;

const UPPERCASE_WORD = /(?<![\w-])uppercase(?![\w-])/;
// Any tracking utility except the reset (normal, or a bracketed zero).
const TRACKING_CLASS = /(?<![\w-])tracking(?=-)(?!-normal(?![\w-])|-\[0(?![.\d]))/;
// Letter spacing other than the reset. The whitespace sits inside the
// lookahead so backtracking cannot step around a "normal" or a zero.
const CSS_LETTER_SPACING = /(?<![\w-])letter-spacing\s*:(?!\s*(?:normal|0(?![.\d])))/;
const STYLE_UPPERCASE = /(?<![\w-])textTransform\s*:\s*["'`]uppercase["'`]/g;
const STYLE_LETTER_SPACING = /(?<![\w-])letterSpacing\s*:(?!\s*["'`]?(?:normal|0(?![.\d])))/;
const CSS_UPPERCASE = /(?<![\w-])text-transform\s*:\s*uppercase\b/;

const ACTIVE_SCALE = /(?<![\w-])active:scale(?=-)/g;
const WHILE_TAP_SCALE = /(?<![\w-])whileTap\s*=\s*\{\{[^}]*(?<![\w-])scale\s*:\s*\d/g;
const CSS_NUMERIC_SCALE = /(?<![\w-])scale\s*(?:\(\s*-?\d*\.?\d|:\s*-?\d*\.?\d)/;

const STROKE_WIDTH = /(?<![\w-])strokeWidth\s*(?:=(?!=)|:)\s*/g;
const KEBAB_STROKE_WIDTH = /(?<![\w-])stroke-width\s*[=:]\s*["']?\s*\d*\.?\d/g;

const SIZE_LITERAL = /^["'`]?\s*(\d*\.?\d+)\s*(px|rem|em)?\s*["'`]?$/;

// A global caps-label class token. The lookarounds keep compound names such
// as a component's own map-finding-eyebrow class out of the count.
const EYEBROW_CLASS = /(?<![\w-])(?:fg-eyebrow|eyebrow|content-chapter__label)(?![\w-])/g;

// --- Helpers -------------------------------------------------------------

function emptyCounts() {
  return Object.fromEntries(RULE_NAMES.map((rule) => [rule, 0]));
}

function emptyLines() {
  return Object.fromEntries(RULE_NAMES.map((rule) => [rule, []]));
}

/** Pixel size of a literal, or null when it is relative or not a literal. */
function toPx(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!unit || unit === "px") return n;
  if (unit === "rem") return n * ROOT_FONT_PX;
  return null;
}

function belowFloor(px) {
  return px !== null && px > 0 && px < CAPTION_FLOOR_PX;
}

/**
 * The value expression that starts at `index`: a braced JSX expression, a
 * quoted string, or plain text up to the next separator.
 */
function valueAt(line, index) {
  const rest = line.slice(index);
  if (rest.startsWith("{")) {
    const end = rest.indexOf("}");
    return rest.slice(1, end === -1 ? undefined : end);
  }
  const quote = rest[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = rest.indexOf(quote, 1);
    return rest.slice(0, end === -1 ? undefined : end + 1);
  }
  return rest.split(/[,;)}\n]/, 1)[0];
}

/**
 * Numeric literals a value expression can produce: the value itself, or each
 * branch of a ternary. Anything computed is ignored.
 */
function literalBranches(expression) {
  return expression
    .split(/[?:]/)
    .map((part) => SIZE_LITERAL.exec(part.trim()))
    .filter(Boolean)
    .map((m) => ({ value: m[1], unit: m[2] }));
}

/**
 * TS/TSX source split into lines with comments blanked. Line-based on purpose:
 * a full lexer would have to understand JSX text, where an apostrophe is not a
 * quote. A block comment counts only when it opens at the start of a line or
 * after whitespace or a JSX brace, so a string such as an image/* accept
 * attribute is never mistaken for one.
 */
function codeLines(source) {
  let inBlock = false;
  return source.split("\n").map((raw) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return "";
      line = " ".repeat(end + 2) + line.slice(end + 2);
      inBlock = false;
    }
    line = line.replace(/(^|[\s{])\/\*.*?\*\//g, (m, lead) => lead + " ".repeat(m.length - lead.length));
    if (line.trimStart().startsWith("//")) return "";
    const open = line.search(/(?:^|[\s{])\/\*/);
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open + (/[\s{]/.test(line[open]) ? 1 : 0));
    }
    return line.replace(/(^|\s)\/\/(?:\s.*)?$/, "$1");
  });
}

/** The innermost brace-delimited object around `index`, or "". */
function enclosingObject(text, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0 && index - i < 4000; i--) {
    const c = text[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return "";
  depth = 0;
  for (let i = start + 1; i < text.length && i - start < 8000; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return text.slice(start, i + 1);
      depth--;
    }
  }
  return text.slice(start);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function record(result, rule, line, times = 1) {
  for (let k = 0; k < times; k++) {
    result.counts[rule]++;
    result.lines[rule].push(line);
  }
}

function matchCount(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function countTextSizes(result, line, n) {
  for (const m of line.matchAll(ARBITRARY_TEXT_SIZE)) {
    record(result, "arbitraryTextSize", n);
    const px = m[1] ? toPx(m[1], m[2]) : m[3] ? toPx(m[3], m[4]) : null;
    if (belowFloor(px)) record(result, "subElevenFont", n);
  }
  for (const m of line.matchAll(CSS_FONT_SIZE)) {
    if (belowFloor(toPx(m[1], m[2]))) record(result, "subElevenFont", n);
  }
}

/**
 * Index ranges of string literal contents in comment-blanked TS/TSX code.
 * Quoted strings end at their line, so a stray apostrophe can only misread the
 * rest of one line. Template literals may span lines, and their ${}
 * expressions are read as code again, so a quoted class inside one is found
 * while an identifier inside one is not.
 */
function stringRanges(code) {
  const ranges = [];
  const stack = [{ kind: "code", braces: 0 }];
  let quote = "";
  let from = -1;
  const close = (to) => {
    if (from !== -1 && to > from) ranges.push([from, to]);
    from = -1;
  };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const top = stack[stack.length - 1];
    if (quote) {
      if (c === "\\" && code[i + 1] !== "\n") i++;
      else if (c === quote || c === "\n") {
        close(i);
        quote = "";
      }
      continue;
    }
    if (top.kind === "template") {
      if (c === "\\") i++;
      else if (c === "`") {
        close(i);
        stack.pop();
      } else if (c === "$" && code[i + 1] === "{") {
        close(i);
        stack.push({ kind: "code", braces: 0 });
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      from = i + 1;
    } else if (c === "`") {
      stack.push({ kind: "template" });
      from = i + 1;
    } else if (c === "{") {
      top.braces++;
    } else if (c === "}") {
      if (top.braces > 0) top.braces--;
      else if (stack.length > 1) {
        // The end of a ${} expression: back inside the template literal.
        stack.pop();
        from = i + 1;
      }
    }
  }
  close(code.length);
  return ranges;
}

/** A lookup from a character index to its 1-based line number. */
function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// --- Counting ------------------------------------------------------------

function countScript(source) {
  const result = { counts: emptyCounts(), lines: emptyLines() };
  const lines = codeLines(source);

  lines.forEach((line, i) => {
    const n = i + 1;
    if (!line.trim()) return;

    countTextSizes(result, line, n);
    for (const pattern of [STYLE_FONT_SIZE, DOM_FONT_SIZE]) {
      for (const m of line.matchAll(pattern)) {
        const branches = literalBranches(valueAt(line, m.index + m[0].length));
        if (branches.some((b) => belowFloor(toPx(b.value, b.unit)))) record(result, "subElevenFont", n);
      }
    }

    // Class strings and inline CSS strings. Style objects are counted below,
    // so their uppercase value is removed here to avoid counting it twice.
    const classText = line.replace(STYLE_UPPERCASE, "");
    const tracked = (text) =>
      UPPERCASE_WORD.test(text) && (TRACKING_CLASS.test(text) || CSS_LETTER_SPACING.test(text));
    if (tracked(classText)) {
      // One per quoted class string that carries both; a cn() call that
      // splits them across strings on one line still counts once.
      const strings = classText.split(/["`]/).filter(tracked).length;
      record(result, "uppercaseTracking", n, Math.max(1, strings));
    }

    record(result, "activeScale", n, matchCount(line, ACTIVE_SCALE) + matchCount(line, WHILE_TAP_SCALE));

    for (const m of line.matchAll(STROKE_WIDTH)) {
      if (literalBranches(valueAt(line, m.index + m[0].length)).length > 0) {
        record(result, "strokeWidthLiteral", n);
      }
    }
    record(result, "strokeWidthLiteral", n, matchCount(line, KEBAB_STROKE_WIDTH));
  });

  const code = lines.join("\n");
  for (const m of code.matchAll(STYLE_UPPERCASE)) {
    if (STYLE_LETTER_SPACING.test(enclosingObject(code, m.index))) {
      record(result, "uppercaseTracking", lineOf(code, m.index));
    }
  }

  const lineAt = lineFinder(code);
  for (const [from, to] of stringRanges(code)) {
    for (const m of code.slice(from, to).matchAll(EYEBROW_CLASS)) {
      record(result, "eyebrowClass", lineAt(from + m.index));
    }
  }
  return result;
}

function countStylesheet(source, isModule = false) {
  const result = { counts: emptyCounts(), lines: emptyLines() };
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

  css.split("\n").forEach((line, i) => {
    const n = i + 1;
    countTextSizes(result, line, n);
    record(result, "strokeWidthLiteral", n, matchCount(line, KEBAB_STROKE_WIDTH));
  });

  // Innermost rule blocks: a selector and a body with no nested braces.
  for (const m of css.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
    const [, selector, body] = m;
    const n = lineOf(css, m.index + m[0].indexOf("{"));
    if (CSS_UPPERCASE.test(body) && CSS_LETTER_SPACING.test(body)) record(result, "uppercaseTracking", n);
    if (isModule && CSS_UPPERCASE.test(body)) record(result, "moduleUppercase", n);
    if (/:active\b/.test(selector) && CSS_NUMERIC_SCALE.test(body)) record(result, "activeScale", n);
  }
  return result;
}

/**
 * Count every rule in one file's source. `file` decides the syntax: .css is
 * read as a stylesheet, anything else as TS/TSX. Only a .module.css file is
 * held to the moduleUppercase rule.
 */
export function countTypeScale(source, file = "source.tsx") {
  return file.endsWith(".css")
    ? countStylesheet(source, file.endsWith(".module.css"))
    : countScript(source);
}

// --- Tree and baseline ---------------------------------------------------

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Product source files the check covers, as sorted repo-relative paths. */
export function listFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (SOURCE_FILE.test(entry.name) && !NOT_PRODUCT_SOURCE.test(entry.name)) {
        const rel = toPosix(relative(root, abs));
        if (!MAP_PAINT_FILES.has(rel)) out.push(rel);
      }
    }
  };
  for (const dir of SCAN_ROOTS) {
    const abs = join(root, dir);
    if (existsSync(abs)) walk(abs);
  }
  return out.sort();
}

/** Nonzero counts for every covered file, plus the lines behind them. */
export function scanTree(root = ROOT) {
  const files = listFiles(root);
  const counts = {};
  const lines = {};
  for (const file of files) {
    const result = countTypeScale(readFileSync(join(root, file), "utf8"), file);
    const nonzero = Object.fromEntries(Object.entries(result.counts).filter(([, c]) => c > 0));
    if (Object.keys(nonzero).length > 0) {
      counts[file] = nonzero;
      lines[file] = result.lines;
    }
  }
  return { fileCount: files.length, counts, lines };
}

/**
 * Per-file, per-rule comparison. A file missing from the baseline has a
 * baseline of zero, so a new file must arrive clean.
 */
export function compareToBaseline(current, baseline) {
  const regressions = [];
  const improvements = [];
  const files = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort();
  for (const file of files) {
    for (const rule of RULE_NAMES) {
      const now = current[file]?.[rule] ?? 0;
      const was = baseline[file]?.[rule] ?? 0;
      if (now > was) regressions.push({ file, rule, was, now });
      else if (now < was) improvements.push({ file, rule, was, now });
    }
  }
  return { regressions, improvements };
}

export function totals(counts) {
  const sum = emptyCounts();
  for (const fileCounts of Object.values(counts)) {
    for (const [rule, c] of Object.entries(fileCounts)) sum[rule] += c;
  }
  return sum;
}

export function baselineDocument(counts) {
  const files = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [file, Object.fromEntries(RULE_NAMES.filter((r) => counts[file][r]).map((r) => [r, counts[file][r]]))]),
  );
  return {
    note:
      "Type-scale debt per file. Counts may fall, never rise. Regenerate with `npm run lint:type-scale -- --write` to lock in a reduction or an owner-reviewed exception. See scripts/check-type-scale.mjs.",
    rules: RULES,
    totals: totals(counts),
    files,
  };
}

function loadBaseline(root) {
  const path = join(root, BASELINE_FILE);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")).files ?? {};
}

function formatTotals(sum) {
  return RULE_NAMES.map((rule) => `${rule} ${sum[rule]}`).join(", ");
}

function main() {
  const write = process.argv.includes("--write") || process.argv.includes("--update");
  const { fileCount, counts, lines } = scanTree(ROOT);

  if (write) {
    writeFileSync(join(ROOT, BASELINE_FILE), JSON.stringify(baselineDocument(counts), null, 2) + "\n");
    console.log(
      `check-type-scale: baseline written for ${Object.keys(counts).length} of ${fileCount} files ` +
        `(${formatTotals(totals(counts))}).`,
    );
    return;
  }

  const { regressions, improvements } = compareToBaseline(counts, loadBaseline(ROOT));

  if (regressions.length > 0) {
    const source = (file, n) => {
      const text = readFileSync(join(ROOT, file), "utf8").split("\n")[n - 1] ?? "";
      return text.trim().slice(0, 120);
    };
    console.error(`check-type-scale: ${regressions.length} count(s) rose above the baseline.`);
    let lastFile = "";
    for (const { file, rule, was, now } of regressions) {
      if (file !== lastFile) console.error(`\n${file}`);
      lastFile = file;
      console.error(`  ${rule} ${was} -> ${now}: ${RULES[rule]}`);
      // Counts are per file, so every matching line is a candidate for the new one.
      for (const n of (lines[file]?.[rule] ?? []).slice(0, 8)) {
        console.error(`    ${n}: ${source(file, n)}`);
      }
    }
    console.error(
      "\nUse a step on the named type scale (docs/brand/BRAND_GUIDE.md, Product type scale) at 11 px or larger,\n" +
        "set caps without added letter spacing, reuse the shared press classes in globals.css instead of a new\n" +
        "scale literal, and leave icon strokes at their default. Name a section with SectionHeading or a\n" +
        "CollapsibleSection row in sentence case instead of an eyebrow class or a CSS module uppercase rule\n" +
        "(docs/brand/BRAND_GUIDE.md, Headings are type). If the addition is an owner-reviewed exception,\n" +
        "run `npm run lint:type-scale -- --write` and name the exception in the commit message.",
    );
    process.exit(1);
  }

  const fell = improvements.length
    ? ` ${improvements.length} count(s) fell below the baseline; run \`npm run lint:type-scale -- --write\` to lock that in.`
    : "";
  console.log(
    `check-type-scale: ${fileCount} files scanned, no count above its baseline (${formatTotals(totals(counts))}).${fell}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
