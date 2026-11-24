import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmdirSync } from "node:fs";
import { get } from "node:http";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hostname = "127.0.0.1";
const savedTown = "fr_scope=town%3Abrunswick";
const visits = [
  { area: "county", path: "/today" },
  { area: "brunswick", path: "/today", cookie: savedTown },
  { area: "mount-airy", path: "/today?in=mount-airy", cookie: savedTown },
  { area: "nearme", path: "/today?in=nearme" },
];

async function startRenderer() {
  process.once("disconnect", () => process.exit(0));
  if (!globalThis[Symbol.for("frederick-radius.promoted-build-network-guard")]) {
    throw new Error("Promoted network guard missing in the Today renderer");
  }
  // The renderer only accepts inbound requests. Also block direct clients
  // such as database drivers that do not use the shared HTTP/fetch guard.
  Socket.prototype.connect = () => { throw new Error("Outbound socket blocked in the Today renderer"); };
  const root = process.cwd();
  const require = createRequire(join(root, "package.json"));
  const manifest = JSON.parse(readFileSync(join(root, ".next/required-server-files.json"), "utf8"));
  if (!manifest.config) throw new Error("Missing built Next server configuration");
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(manifest.config);
  // Populate Next's dotenv cache without loading an operator's local secrets.
  const emptyDir = mkdtempSync(join(tmpdir(), "radius-today-env-"));
  try {
    require("@next/env").loadEnvConfig(emptyDir);
  } finally {
    rmdirSync(emptyDir);
  }
  const { startServer } = require("next/dist/server/lib/start-server");
  await startServer({ dir: root, isDev: false, port: 0, hostname, allowRetry: false });
  process.send({ port: Number(process.env.PORT) });
}

function readHtml(port, { area, path, cookie }, signal) {
  return new Promise((resolveDocument, reject) => {
    const headers = { accept: "text/html", ...(cookie && { cookie }) };
    const request = get({ hostname, port, path, headers, agent: false, signal }, async (response) => {
      try {
        if (response.statusCode !== 200 || !/^text\/html\b/i.test(response.headers["content-type"] ?? "")) {
          throw new Error(`${area} Today returned HTTP ${response.statusCode} (${response.headers["content-type"] ?? "no content type"})`);
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response) {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) throw new Error(`${area} Today exceeded the document limit`);
          chunks.push(chunk);
        }
        const html = Buffer.concat(chunks).toString("utf8");
        if (!response.complete || !/<\/html>\s*$/i.test(html)) {
          throw new Error(`${area} Today returned an incomplete document`);
        }
        resolveDocument({ area, path, html });
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    request.once("error", reject);
  });
}

export async function readProductionTodayDocuments(root, env) {
  if (env.RADIUS_DATA_MODE !== "promoted" || !env.RADIUS_DATA_VERSION ||
      env.RADIUS_DATA_VERSION !== env.NEXT_PUBLIC_RADIUS_DATA_VERSION) {
    throw new Error("Today document checks require the matching promoted build version");
  }
  const guard = pathToFileURL(resolve(root, "scripts/promoted-build-network-guard.mjs"));
  const child = fork(fileURLToPath(import.meta.url), ["--serve-today"], {
    cwd: root,
    execArgv: [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
    env: {
      NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `--import=${guard.href}`,
      RADIUS_DATA_MODE: "promoted", RADIUS_DATA_VERSION: env.RADIUS_DATA_VERSION,
      NEXT_PUBLIC_RADIUS_DATA_VERSION: env.NEXT_PUBLIC_RADIUS_DATA_VERSION,
    },
  });
  const closed = new Promise((done) => child.once("close", done));
  const signal = AbortSignal.timeout(60_000);
  try {
    const [ready] = await Promise.race([
      once(child, "message", { signal }),
      closed.then((code) => { throw new Error(`Today renderer exited before startup (code ${code})`); }),
    ]);
    if (!Number.isInteger(ready.port) || ready.port < 1 || ready.port > 65535) {
      throw new Error(ready.error || "Today renderer did not report a loopback port");
    }
    const documents = [];
    for (const visit of visits) documents.push(await readHtml(ready.port, visit, signal));
    return documents;
  } finally {
    child.kill("SIGTERM");
    const stop = setTimeout(() => child.kill("SIGKILL"), 1500);
    await closed;
    clearTimeout(stop);
  }
}

if (process.send && process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--serve-today") {
  startRenderer().catch((error) => {
    process.send({ error: error.message }, () => process.exit(1));
  });
}
