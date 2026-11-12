import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolve, join } from "node:path";

/** Offline compiled-asset regression hook. No server or provider requests.
 * Run after the candidate build with --baseline=/private/baseline.json.
 * Chunk hashes are outputs, never hard-coded acceptance identities. */
const root = process.cwd();
const baselineArgument = process.argv.find((arg) => arg.startsWith("--baseline="));
const baseline = baselineArgument ? JSON.parse(readFileSync(resolve(baselineArgument.slice(11)), "utf8")) : null;
const results = {};
const failures = [];
for (const route of ["today", "map"]) {
  const html = readFileSync(join(root, ".next/server/app", `${route}.html`), "utf8");
  const paths = [...new Set([...html.matchAll(/<script[^>]+src="([^"?]+\.js)/g)].map((match) => match[1]))];
  const assets = paths.map((path) => {
    if (!/^\/_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js$/.test(path)) throw new Error("Unexpected compiled asset path.");
    const bytes = readFileSync(join(root, ".next", path.slice("/_next/".length)));
    const code = bytes.toString("utf8");
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const legacyPolyfill = new RegExp(`<script(?=[^>]*src="${escaped}")(?=[^>]*noModule)[^>]*>`, "i").test(html);
    const transitDataset = (code.includes("shapeVariants") && code.includes("stopRoutes")) || (code.includes("fareFree") && code.includes("staticFeed") && code.includes("generatedAt"));
    const radiusInterface = code.includes("Adjust the radius") && code.includes("Travel mode");
    if (route === "map" && (transitDataset || radiusInterface)) failures.push({ route, path, transitDataset, radiusInterface });
    return { path, bytes: bytes.length, gzip_estimate_bytes: gzipSync(bytes, { level: 9 }).length, sha256: createHash("sha256").update(bytes).digest("hex"), legacy_polyfill: legacyPolyfill };
  });
  const modern = assets.filter((asset) => !asset.legacy_polyfill);
  const raw = modern.reduce((sum, asset) => sum + asset.bytes, 0);
  const compressed = modern.reduce((sum, asset) => sum + asset.gzip_estimate_bytes, 0);
  results[route] = { modern_script_count: modern.length, modern_raw_bytes: raw, modern_gzip_estimate_bytes: compressed,
    ...(baseline?.routes?.[route] ? { raw_delta_from_baseline: raw - baseline.routes[route].modern_raw_bytes, gzip_estimate_delta_from_baseline: compressed - baseline.routes[route].modern_gzip_estimate_bytes } : {}), assets };
}
console.log(JSON.stringify({ status: failures.length ? "failed" : "passed", measurement: "compiled initial HTML scripts; not browser transfers or a production certificate", routes: results, forbidden_initial_dependencies: failures }, null, 2));
if (failures.length) process.exitCode = 1;
