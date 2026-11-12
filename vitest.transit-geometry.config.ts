/**
 * Opt-in local-fixture projection and DOM hit-target checks, using the real
 * installed map engine. Ordinary unit globs omit this config; CI runs it as a separate browser gate.
 * Cache and JSON/PNG evidence default to a worktree-specific OS temporary
 * directory. RADIUS_TRANSIT_GEOMETRY_CACHE_DIR and
 * RADIUS_TRANSIT_GEOMETRY_PROOF_DIR may override those directories.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineBrowserCommand, playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const worktreeKey = createHash("sha256").update(root).digest("hex").slice(0, 12);
const temporaryRoot = resolve(tmpdir(), "frederick-radius-transit-geometry", worktreeKey);
const cacheDirectory = resolve(process.env.RADIUS_TRANSIT_GEOMETRY_CACHE_DIR ?? resolve(temporaryRoot, "cache"));
const proofDirectory = resolve(process.env.RADIUS_TRANSIT_GEOMETRY_PROOF_DIR ?? resolve(temporaryRoot, "proof"));
type Fixture = {
  stop: { id: string; name: string; lat: number; lng: number };
  vehicle: { id: string; routeId: string; lat: number; lng: number };
  epochSeconds: number;
};
type Ledger = {
  fixtureRequests: Array<{ path: string; method: string }>;
  rejectedExternal: string[];
  rejectedWrites: string[];
  unexpectedLocalApi: string[];
};
const ledgers = new Map<string, Ledger>();
const clearGuards = new Map<string, () => Promise<void>>();

export default defineConfig({
  root,
  publicDir: resolve(root, "public"),
  cacheDir: cacheDirectory,
  resolve: { alias: [
    { find: "@", replacement: resolve(root, "src") },
    { find: "server-only", replacement: resolve(root, "tests/stubs/server-only.ts") },
    { find: /^mapbox-gl$/, replacement: resolve(root, "tests/fixtures/transit-map-geometry-maplib.ts") },
  ] },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "mapbox-gl/dist/mapbox-gl.js"], exclude: ["react-map-gl/mapbox", "@vis.gl/react-mapbox"] },
  server: { fs: { allow: [root, tmpdir(), cacheDirectory, proofDirectory] } },
  test: {
    include: ["tests/transit-map-geometry.browser.tsx"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    retry: 0,
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ["verbose"],
    browser: {
      enabled: true,
      headless: true,
      ui: false,
      api: { host: "127.0.0.1", port: 6346, strictPort: true },
      provider: playwright({
        launchOptions: {
          ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
          args: ["--no-sandbox"],
        },
      }),
      instances: [{ browser: "chromium" }],
      screenshotDirectory: proofDirectory,
      screenshotFailures: true,
      commands: {
        installTransitGeometryTransport: defineBrowserCommand(async ({ context, page, sessionId }, fixture: Fixture) => {
          const ledger: Ledger = { fixtureRequests: [], rejectedExternal: [], rejectedWrites: [], unexpectedLocalApi: [] };
          ledgers.set(sessionId, ledger);
          await clearGuards.get(sessionId)?.();
          const origin = new URL(page.url()).origin;
          await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
          const guard: Parameters<typeof context.route>[1] = async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) {
              ledger.rejectedExternal.push(`${request.method()} ${url.origin}${url.pathname}`);
              await route.abort("blockedbyclient");
              return;
            }
            if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
              ledger.rejectedWrites.push(`${request.method()} ${url.pathname}`);
              await route.abort("blockedbyclient");
              return;
            }
            if (url.pathname === "/api/transit/vehicles") {
              ledger.fixtureRequests.push({ path: url.pathname, method: request.method() });
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
                available: true, status: "ok", feedTimestamp: fixture.epochSeconds,
                vehicles: [{
                  vehicleId: fixture.vehicle.id, routeId: fixture.vehicle.routeId,
                  tripId: "declared-geometry-fixture-trip",
                  lat: fixture.vehicle.lat, lng: fixture.vehicle.lng,
                  timestamp: fixture.epochSeconds, nextStop: fixture.stop,
                }],
              }) });
              return;
            }
            if (url.pathname === "/api/transit/stop-predictions") {
              ledger.fixtureRequests.push({ path: url.pathname, method: request.method() });
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
                available: false, status: "unavailable", predictions: [],
              }) });
              return;
            }
            if (url.pathname.startsWith("/api/")) {
              ledger.unexpectedLocalApi.push(`${request.method()} ${url.pathname}`);
              await route.abort("blockedbyclient");
              return;
            }
            await route.continue();
          };
          await context.route("**/*", guard);
          clearGuards.set(sessionId, () => context.unroute("**/*", guard));
        }),
        readTransitGeometryLedger: defineBrowserCommand(({ sessionId }) => {
          const ledger = ledgers.get(sessionId);
          if (!ledger) throw new Error("The declared geometry network guard was not installed.");
          return ledger;
        }),
        recordTransitGeometryEvidence: defineBrowserCommand(async ({ frame, sessionId }, name: string, proof: Record<string, unknown>) => {
          if (!/^(320|390)-(separated|colocated)(-stop-sheet)?$/.test(name)) throw new Error("Invalid geometry proof name.");
          await mkdir(proofDirectory, { recursive: true });
          const activeFrame = await frame();
          const target = activeFrame.locator(name.endsWith("-stop-sheet")
            ? '[role="dialog"]:has([data-transit-stop-sheet-body])'
            : "[data-transit-geometry-frame]");
          if (await target.count()) await target.screenshot({ path: resolve(proofDirectory, `${name}.png`) });
          const output = resolve(proofDirectory, `${name}.json`);
          await writeFile(output, JSON.stringify({ ...proof, network: ledgers.get(sessionId) }, null, 2));
          return output;
        }),
      },
    },
  },
});
