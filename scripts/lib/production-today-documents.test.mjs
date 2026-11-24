import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { readProductionTodayDocuments } from "./production-today-documents.mjs";

const root = resolve(import.meta.dirname, "../..");
const env = {
  RADIUS_DATA_MODE: "promoted",
  RADIUS_DATA_VERSION: "test",
  NEXT_PUBLIC_RADIUS_DATA_VERSION: "test",
  OPERATOR_TEST_VALUE: "must stay in the parent",
};

async function productionFixture(t, failure = "", config = {}) {
  const dir = await mkdtemp(join(tmpdir(), "radius-today-render-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of [".next", "scripts", "node_modules/next/dist/server/lib"]) {
    await mkdir(join(dir, name), { recursive: true });
  }
  await symlink(join(root, "node_modules/@next"), join(dir, "node_modules/@next"));
  await copyFile(join(root, "scripts/promoted-build-network-guard.mjs"), join(dir, "scripts/promoted-build-network-guard.mjs"));
  await writeFile(join(dir, ".env.local"), "LOCAL_TEST_VALUE=must-stay-in-dotenv\n");
  await writeFile(join(dir, ".next/required-server-files.json"), JSON.stringify({ config: { failure, ...config } }));
  await writeFile(join(dir, "node_modules/next/dist/server/lib/start-server.js"), `
    exports.startServer = async ({ dir, isDev, port, hostname }) => {
      require("@next/env").loadEnvConfig(dir);
      if (process.env.OPERATOR_TEST_VALUE || process.env.LOCAL_TEST_VALUE) throw Error("Private env reached renderer");
      const { failure, experimental } = JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG);
      if (experimental?.runtimeServerDeploymentId && !process.env.NEXT_DEPLOYMENT_ID) throw Error("Missing Next runtime deployment ID");
      if (process.env.VERCEL_DEPLOYMENT_ID) throw Error("Raw platform environment leaked");
      if (isDev || port !== 0 || hostname !== "127.0.0.1") throw Error("Unexpected listener");
      require("node:assert/strict").throws(() => new (require("node:net").Socket)().connect(1, hostname), /Outbound socket blocked/);
      const server = require("node:http").createServer((req, res) => {
        res.writeHead(failure === "redirect" ? 307 : 200, { "content-type": "text/html" });
        const document = "<html>" + JSON.stringify([req.url, req.headers.cookie || "", process.pid, process.env.NEXT_DEPLOYMENT_ID]) + "</html>";
        res.end(failure === "incomplete" ? "<html>" : document);
      });
      await new Promise(resolve => server.listen(port, hostname, resolve));
      process.env.PORT = server.address().port;
    };
  `);
  return dir;
}

test("visits real loopback URLs in order, protects the environment, and stops the private renderer", async (t) => {
  const dir = await productionFixture(t);
  const documents = await readProductionTodayDocuments(dir, env);
  const visits = documents.map(({ area, path, html }) => {
    const [receivedPath, cookie, pid] = JSON.parse(html.slice("<html>".length, -"</html>".length));
    assert.equal(receivedPath, path);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    return [area, path, cookie];
  });
  assert.deepEqual(visits, [
    ["county", "/today", ""],
    ["brunswick", "/today", "fr_scope=town%3Abrunswick"],
    ["mount-airy", "/today?in=mount-airy", "fr_scope=town%3Abrunswick"],
    ["nearme", "/today?in=nearme", ""],
  ]);
});

test("rejects a redirect and a truncated HTML document", async (t) => {
  for (const [failure, message] of [["redirect", /HTTP 307/], ["incomplete", /incomplete document/]]) {
    const dir = await productionFixture(t, failure);
    await assert.rejects(readProductionTodayDocuments(dir, env), message);
  }
});

test("supplies only the effective public Next identity when the emitted runtime config redacts it", async t => {
  const dir = await productionFixture(t, "", { deploymentId: "", experimental: { runtimeServerDeploymentId: true } });
  for (const [variables, id] of [
    [{ NEXT_DEPLOYMENT_ID: "dpl_next", VERCEL_DEPLOYMENT_ID: "dpl_platform" }, "dpl_next"],
    [{ VERCEL_DEPLOYMENT_ID: "dpl_platform" }, "dpl_platform"],
  ]) {
    const docs = await readProductionTodayDocuments(dir, { ...env, ...variables });
    for (const { html } of docs) assert.equal(JSON.parse(html.slice(6, -7))[3], id);
  }
  await assert.rejects(readProductionTodayDocuments(dir, env), /requires its public/);
  await assert.rejects(readProductionTodayDocuments(dir, { ...env, NEXT_DEPLOYMENT_ID: "id?wrong=1" }), /requires its public/);
});
