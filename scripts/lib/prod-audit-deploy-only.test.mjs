import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

function runAudit(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/prod-audit.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        EXPECTED_SHA: "abcdef1234567890",
        REQUIRE_EXPECTED_SHA: "1",
        SKIP_DATA_HEALTH: "1",
        CANARY_TIMEOUT_MS: "2000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("deploy-only canary cannot fail or roll back because public event data is unavailable", async () => {
  let dataRequests = 0;
  const noisyHtml = [
    "<!doctype html><html><head>",
    '<link rel="manifest" href="/manifest.webmanifest">',
    "</head><body><h1>Frederick Radius</h1>",
    "<p>Private Corp CANCELLED</p>",
    '<img src="https://upload.wikimedia.org/test.jpg" alt="test">',
    "<p>Frederick · 200 ft</p>",
    "x".repeat(5_000),
    "</body></html>",
  ].join("");
  const server = createServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(308, { Location: "/today" });
      response.end();
      return;
    }
    if (path === "/manifest.webmanifest") {
      response.writeHead(200, { "Content-Type": "application/manifest+json" });
      response.end(JSON.stringify({ start_url: "/today" }));
      return;
    }
    if (path === "/sw.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      response.end('const CACHE_VERSION = "fr-abcdef1234567890";');
      return;
    }
    if (path.startsWith("/api/")) {
      dataRequests += 1;
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(noisyHtml);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const result = await runAudit(`http://127.0.0.1:${address.port}`);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(dataRequests, 0);
    assert.doesNotMatch(result.stdout, /rendered event deep link/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});
