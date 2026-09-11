import { expect, test } from "@playwright/test";
import { GET as getServiceWorker } from "../src/app/sw.js/route";

test("two builds produce distinct workers that retire the previous cache", async () => {
  const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalFallback = process.env.NEXT_PUBLIC_BUILD_VERSION;

  try {
    delete process.env.NEXT_PUBLIC_BUILD_VERSION;

    process.env.VERCEL_GIT_COMMIT_SHA =
      "1111111111111111111111111111111111111111";
    const firstResponse = getServiceWorker();
    const first = await firstResponse.text();

    process.env.VERCEL_GIT_COMMIT_SHA =
      "2222222222222222222222222222222222222222";
    const secondResponse = getServiceWorker();
    const second = await secondResponse.text();

    expect(first).toContain('const CACHE_VERSION = "fr-111111111111"');
    expect(second).toContain('const CACHE_VERSION = "fr-222222222222"');
    expect(second).not.toBe(first);

    // The browser must revalidate the worker on every return. Once the second
    // worker activates, only caches with its build prefix may survive.
    expect(secondResponse.headers.get("cache-control")).toContain(
      "must-revalidate",
    );
    expect(second).toContain(
      ".filter((k) => !k.startsWith(CACHE_VERSION))",
    );
    expect(second).toContain(".map((k) => caches.delete(k))");
    expect(second).toContain(".then(() => purgeLegacyRuntimeEntries())");

    // A waiting worker is deliberate: the UI offers Refresh/Later and sends
    // SKIP_WAITING only after the person accepts the upgrade.
    const installBlock =
      second.match(
        /self\.addEventListener\("install"[\s\S]*?\n\}\);/,
      )?.[0] ?? "";
    expect(installBlock).not.toMatch(/^\s*self\.skipWaiting\(\)/m);
    expect(second).toContain(
      'event.data.type === "SKIP_WAITING"',
    );
  } finally {
    if (originalSha === undefined) {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
    } else {
      process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
    }
    if (originalFallback === undefined) {
      delete process.env.NEXT_PUBLIC_BUILD_VERSION;
    } else {
      process.env.NEXT_PUBLIC_BUILD_VERSION = originalFallback;
    }
  }
});
