import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve("src");
const SOURCE_ROOTS = [resolve("src/app"), resolve("src/components"), resolve("src/hooks")];
const OUT = resolve("design-review/probes/token-source-evidence.json");
const INCLUDED_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const EXCLUDED_PARTS = [
  "/api/",
  "/admin/",
  "/auth/",
  "/pitch/",
  "/proto/",
  "/(marketing)/",
  "/__tests__/",
  "/test/",
  "/tests/",
  "/data/",
  "/generated/",
  "/vendor/",
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (INCLUDED_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function inScope(path) {
  const normalized = `/${relative(ROOT, path).replaceAll("\\\\", "/")}`;
  return !EXCLUDED_PARTS.some((part) => normalized.includes(part));
}

const rules = {
  fontSize: [
    /(?:text-\[(?:clamp\([^\]]+\)|-?\d*\.?\d+(?:px|rem|em))\])/g,
    /(?:font-size\s*:\s*(?:clamp\([^;]+\)|-?\d*\.?\d+(?:px|rem|em)))/g,
    /(?:fontSize\s*:\s*["'`](?:clamp\([^"'`]+\)|-?\d*\.?\d+(?:px|rem|em))["'`])/g,
  ],
  fontWeight: [
    /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
    /(?:font-weight\s*:\s*[1-9]00)/g,
    /(?:fontWeight\s*:\s*["'`]?[1-9]00["'`]?)/g,
  ],
  rawColor: [
    /#[0-9a-fA-F]{3,8}\b/g,
    /\b(?:rgb|rgba|hsl|hsla|oklch|color)\([^;\n]+?\)/g,
    /color-mix\([^;\n]+?\)/g,
    /\b(?:text|bg|border|ring|fill|stroke)-(?:white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)(?:-\d{2,3})?(?:\/\d+)?\b/g,
  ],
  arbitraryLayout: [
    /\b(?:p[trblxy]?|m[trblxy]?|gap[xy]?|space-[xy]|inset[xy]?|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h)-\[[^\]]+\]/g,
    /(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height)\s*:\s*[^;\n}]+/g,
  ],
  radius: [
    /\brounded(?:-[trbl]{1,2})?-\[[^\]]+\]/g,
    /(?:border-radius|borderRadius)\s*:\s*[^;\n},]+/g,
    /\brounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\b/g,
  ],
  shadow: [
    /\bshadow-\[[^\]]+\]/g,
    /(?:box-shadow|boxShadow)\s*:\s*[^;\n}]+/g,
    /\bshadow-(?:none|sm|md|lg|xl|2xl)\b/g,
  ],
  motion: [
    /\bduration-\[[^\]]+\]/g,
    /\bduration-\d+\b/g,
    /(?:transition-duration|animation-duration)\s*:\s*[^;\n}]+/g,
    /\bduration\s*:\s*\d*\.?\d+/g,
    /\b(?:ease|easing)\s*:\s*(?:["'`][^"'`]+["'`]|\[[^\]]+\])/g,
    /cubic-bezier\([^\)]+\)/g,
  ],
};

const files = (await Promise.all(SOURCE_ROOTS.map(walk))).flat().filter(inScope).sort();
const findings = Object.fromEntries(Object.keys(rules).map((key) => [key, []]));
const definedTokens = new Set();
const tokenUses = [];

for (const path of files) {
  const source = await readFile(path, "utf8");
  const lines = source.split(/\r?\n/);
  const file = relative(process.cwd(), path).replaceAll("\\\\", "/");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) definedTokens.add(match[1]);
    for (const match of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
      tokenUses.push({ token: match[1], file, line: index + 1, source: line.trim() });
    }
    for (const [category, patterns] of Object.entries(rules)) {
      const seen = new Set();
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const value = match[0];
          if (seen.has(value)) continue;
          seen.add(value);
          findings[category].push({
            value,
            file,
            line: index + 1,
            tokenDefinition: /--[a-zA-Z0-9_-]+\s*:/.test(line),
            source: line.trim(),
          });
        }
      }
    }
  }
}

const projectToken = /^(?:--app-|--state-|--paper(?:-|$)|--ink(?:-|$)|--clay(?:-|$)|--moss$|--z-)/;
const undefinedTokenUses = tokenUses.filter(({ token }) => projectToken.test(token) && !token.endsWith("-") && !definedTokens.has(token));
const result = {
  generatedAt: new Date().toISOString(),
  methodology: "Static candidate inventory for in-scope runtime CSS/TS/TSX. Each record is a source match, not necessarily a defect. Responsive formulas, Mapbox paint values, category palettes, optical nudges, and token definitions require human classification.",
  scope: {
    root: relative(process.cwd(), ROOT),
    fileCount: files.length,
    excludedPathParts: EXCLUDED_PARTS,
  },
  counts: Object.fromEntries(Object.entries(findings).map(([key, values]) => [key, values.length])),
  undefinedTokenUses,
  matches: findings,
};

await writeFile(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ out: OUT, files: files.length, counts: result.counts, undefinedTokens: undefinedTokenUses.length }, null, 2));
