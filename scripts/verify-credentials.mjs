/**
 * Check the credentials that are supposed to protect money and visibility.
 *
 * Presence checks are close to worthless here, because every one of these
 * failure modes is a variable that LOOKS set or a fallback that quietly keeps
 * the app working while the protection is off:
 *
 *   - NEXT_PUBLIC_MAPBOX_TOKEN unset falls back to a token hardcoded in
 *     src/lib/mapbox.ts. The map keeps rendering, so nothing looks wrong,
 *     and the credential in the bundle is the one in git history.
 *   - MAPBOX_SERVER_TOKEN unset falls back to the browser token, so lifting
 *     the public token out of the JS also spends the routing budget.
 *   - SLACK_WEBHOOK_URL unset makes detailed anomaly delivery a console.warn.
 *     Production health issues still have the non-expiring GitHub Actions
 *     channel. GITHUB_ALERTS_TOKEN is used for the weekly digest and only for
 *     duplicate Vercel health delivery when that path is explicitly enabled.
 *
 * So this asks the sharper question in each case: is the value present, is it
 * DIFFERENT from the fallback it is meant to replace, and where a cheap
 * read-only probe exists, does the credential actually work?
 *
 * Never prints a secret. Tokens are reported as a short fingerprint.
 * Exit code is 1 if any REQUIRED check fails, so this can gate a deploy.
 *
 *   npm run verify:credentials            # local .env / shell
 *   npm run verify:credentials -- --probe # also make live read-only calls
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PROBE = process.argv.includes("--probe");

// Kept in sync with src/lib/mapbox.ts by reading it, so this check cannot rot
// when the fallback is finally deleted.
function bundledFallbackToken() {
  try {
    const source = readFileSync("src/lib/mapbox.ts", "utf8");
    const match = source.match(/"(pk\.[A-Za-z0-9._-]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

const results = [];
function record(name, required, status, detail) {
  results.push({ name, required, status, detail });
}

const env = (key) => process.env[key]?.trim() || "";

// ── Mapbox browser token ────────────────────────────────────────────────
const fallback = bundledFallbackToken();
const clientToken = env("NEXT_PUBLIC_MAPBOX_TOKEN");
if (!clientToken) {
  record(
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    true,
    "fail",
    fallback
      ? `unset — the app is serving the hardcoded fallback (${fingerprint(fallback)}), which is in git history and unrestricted`
      : "unset",
  );
} else if (fallback && clientToken === fallback) {
  record(
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    true,
    "fail",
    "set to the SAME value as the hardcoded fallback — rotate it in Mapbox and set the new one",
  );
} else if (!clientToken.startsWith("pk.")) {
  record(
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    true,
    "fail",
    "does not look like a publishable pk. token",
  );
} else {
  record("NEXT_PUBLIC_MAPBOX_TOKEN", true, "ok", `pk token ${fingerprint(clientToken)}`);
}

// ── Mapbox server token ─────────────────────────────────────────────────
const serverToken = env("MAPBOX_SERVER_TOKEN");
if (!serverToken) {
  record(
    "MAPBOX_SERVER_TOKEN",
    true,
    "fail",
    "unset — server routing, isochrone, and static images fall back to the browser token",
  );
} else if (serverToken === clientToken || (fallback && serverToken === fallback)) {
  record(
    "MAPBOX_SERVER_TOKEN",
    true,
    "fail",
    "identical to the browser token — a leaked public token would also drain the server APIs",
  );
} else {
  record(
    "MAPBOX_SERVER_TOKEN",
    true,
    "ok",
    `${serverToken.startsWith("sk.") ? "secret sk" : "token"} ${fingerprint(serverToken)}`,
  );
}

// ── Alert delivery ──────────────────────────────────────────────────────
const slack = env("SLACK_WEBHOOK_URL");
if (!slack) {
  record(
    "SLACK_WEBHOOK_URL",
    true,
    "fail",
    "unset — anomalies are written to a server log and nothing else",
  );
} else if (!slack.startsWith("https://hooks.slack.com/")) {
  record("SLACK_WEBHOOK_URL", true, "fail", "not a hooks.slack.com webhook URL");
} else {
  record("SLACK_WEBHOOK_URL", true, "ok", `webhook ${fingerprint(slack)}`);
}

const ghToken = env("GITHUB_ALERTS_TOKEN");
const directHealthGitHub = env("VERCEL_GITHUB_ALERTS_ENABLED") === "1";
record(
  "GITHUB_ALERTS_TOKEN",
  directHealthGitHub,
  ghToken ? "ok" : directHealthGitHub ? "fail" : "warn",
  ghToken
    ? `token ${fingerprint(ghToken)}, repo ${env("GITHUB_ALERTS_REPO") || "mikedlabs/frederick-radius"}; weekly digest available${directHealthGitHub ? "; direct Vercel health delivery enabled" : ""}`
    : directHealthGitHub
      ? "unset — disable VERCEL_GITHUB_ALERTS_ENABLED or add a probed Issues token"
      : "unset — the weekly digest is skipped; production health issues still use the automatic Actions token",
);

// ── Optional but load-bearing ───────────────────────────────────────────
const kv = env("KV_REST_API_URL") && env("KV_REST_API_TOKEN");
record(
  "KV_REST_API_*",
  false,
  kv ? "ok" : "warn",
  kv
    ? "durable rate-limit buckets active"
    : "unset — rate limits degrade to per-instance counters, so the effective limit is multiplied by the number of warm Lambdas",
);

// ── Live probes ─────────────────────────────────────────────────────────
async function probe() {
  if (!PROBE) return;

  // Mapbox tokens: a styles list is a cheap authenticated read. 401/403 means
  // the credential is wrong or lacks scope; a URL-restricted pk token also
  // 403s here without a Referer, which is itself the answer we want.
  for (const [name, token] of [
    ["NEXT_PUBLIC_MAPBOX_TOKEN", clientToken],
    ["MAPBOX_SERVER_TOKEN", serverToken],
  ]) {
    if (!token) continue;
    try {
      const res = await fetch(
        `https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(token)}`,
      );
      record(
        `probe ${name}`,
        false,
        res.ok ? "ok" : "warn",
        res.ok
          ? "accepted by the Mapbox API"
          : `Mapbox returned HTTP ${res.status} (403 on a pk token can mean the URL restriction is doing its job)`,
      );
    } catch (error) {
      record(`probe ${name}`, false, "warn", `probe failed: ${error.message}`);
    }
  }

  if (ghToken) {
    const repo = env("GITHUB_ALERTS_REPO") || "mikedlabs/frederick-radius";
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      record(
        "probe GITHUB_ALERTS_TOKEN",
        false,
        res.ok ? "ok" : "warn",
        res.ok ? `can read ${repo}` : `GitHub returned HTTP ${res.status} for ${repo}`,
      );
    } catch (error) {
      record("probe GITHUB_ALERTS_TOKEN", false, "warn", `probe failed: ${error.message}`);
    }
  }
}

await probe();

const ICON = { ok: "PASS", warn: "WARN", fail: "FAIL" };
let failed = 0;
console.log("\nCredential check\n");
for (const r of results) {
  if (r.status === "fail" && r.required) failed += 1;
  console.log(`  ${ICON[r.status].padEnd(5)} ${r.name.padEnd(26)} ${r.detail}`);
}
console.log(
  `\n${failed === 0 ? "All required credentials are configured." : `${failed} required credential(s) not configured.`}`,
);
if (!PROBE) console.log("Re-run with --probe to test them against the live APIs.\n");
process.exit(failed === 0 ? 0 : 1);
