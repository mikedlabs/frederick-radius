/**
 * Check the credentials that are supposed to protect money and visibility.
 *
 * Presence checks are close to worthless here, because every one of these
 * failure modes is a variable that LOOKS set or a fallback that quietly keeps
 * the app working while the protection is off:
 *
 *   - NEXT_PUBLIC_MAPBOX_TOKEN unset leaves the interactive map without a
 *     provider token. A browser token is public by design, but it must still
 *     be a dedicated credential restricted to Radius origins.
 *   - MAPBOX_SERVER_TOKEN is intentionally separate from the browser token.
 *     Unset server routes fail closed on cache misses instead of borrowing a
 *     credential that is visible in client JavaScript.
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

const PROBE = process.argv.includes("--probe");

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

const results = [];
function record(name, required, status, detail) {
  results.push({ name, required, status, detail });
}

const env = (key) => process.env[key]?.trim() || "";
const databaseConfigured = Boolean(
  env("DATABASE_URL") || env("POSTGRES_URL") || env("SUPABASE_DB_URL"),
);
const cronSecretConfigured = Boolean(env("CRON_SECRET"));

function boundedInteger(raw, maximum) {
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function missingList(items) {
  return items.filter(Boolean).join(", ");
}

// ── Mapbox browser token ────────────────────────────────────────────────
const clientToken = env("NEXT_PUBLIC_MAPBOX_TOKEN");
if (!clientToken) {
  record(
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    true,
    "fail",
    "unset — map rendering fails visibly instead of borrowing a credential from source control",
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
// The interactive base map uses only the browser token. A server token is a
// release requirement only when at least one paid server API can actually run.
const switchOn = (name) => env(name) === "1";
const capAllowsWork = (name) => env(name) !== "0";
const enabledMapboxServerFeatures = [
  switchOn("MAPBOX_GEOCODING_ENABLED") && "permanent geocoding",
  switchOn("MAPBOX_SEARCH_BOX_ENABLED") && "Search Box",
  switchOn("MAPBOX_MATRIX_ENABLED") &&
    capAllowsWork("MAPBOX_MATRIX_DAILY_ELEMENT_CAP") &&
    "Matrix",
  switchOn("MAPBOX_DIRECTIONS_ENABLED") &&
    capAllowsWork("MAPBOX_DIRECTIONS_DAILY_REQUEST_CAP") &&
    "Directions",
  switchOn("MAPBOX_ISOCHRONE_ENABLED") &&
    capAllowsWork("MAPBOX_ISOCHRONE_DAILY_REQUEST_CAP") &&
    "Isochrone",
  switchOn("MAPBOX_STATIC_MAPS_ENABLED") &&
    capAllowsWork("MAPBOX_STATIC_DAILY_REQUEST_CAP") &&
    "Static Images",
].filter(Boolean);
const serverTokenRequired = enabledMapboxServerFeatures.length > 0;
const serverToken = env("MAPBOX_SERVER_TOKEN");
if (!serverToken) {
  record(
    "MAPBOX_SERVER_TOKEN",
    serverTokenRequired,
    serverTokenRequired ? "fail" : "warn",
    serverTokenRequired
      ? `unset — enabled server work cannot run: ${enabledMapboxServerFeatures.join(", ")}`
      : "unset — safe while every paid Mapbox server feature is off",
  );
} else if (!serverToken.startsWith("pk.") && !serverToken.startsWith("sk.")) {
  record(
    "MAPBOX_SERVER_TOKEN",
    true,
    "fail",
    "does not look like a Mapbox pk. or sk. access token",
  );
} else if (serverToken === clientToken) {
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
    serverToken.startsWith("pk.") ? "ok" : "warn",
    `${serverToken.startsWith("pk.") ? "dedicated public-scope" : "secret-scope"} token ${fingerprint(serverToken)}${serverTokenRequired ? `; powers ${enabledMapboxServerFeatures.join(", ")}` : "; all paid server features are off"}${serverToken.startsWith("sk.") ? "; current APIs need no secret account scope, so rotate to a distinct server-only pk. token when practical" : ""}`,
  );
}

if (serverTokenRequired) {
  record(
    "Mapbox usage counter",
    true,
    databaseConfigured ? "ok" : "fail",
    databaseConfigured
      ? "database-backed daily ceilings are available"
      : `enabled server work needs DATABASE_URL (or an accepted equivalent) before it may spend: ${enabledMapboxServerFeatures.join(", ")}`,
  );
}

// ── Scheduled Radius semantic vectors ───────────────────────────────────
const searchSemanticRequested =
  env("RADIUS_SEARCH_SEMANTIC_ENABLED") === "1";
const searchSemanticCapRaw =
  env("RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT");
const searchSemanticCap = Number(searchSemanticCapRaw);
const searchSemanticCapValid =
  Number.isSafeInteger(searchSemanticCap) &&
  searchSemanticCap > 0 &&
  searchSemanticCap <= 512;
const openAiKeyConfigured = Boolean(env("OPENAI_API_KEY"));
if (searchSemanticRequested) {
  const missing = [
    !openAiKeyConfigured && "OPENAI_API_KEY",
    !searchSemanticCapValid &&
      "RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT from 1 to 512",
    !databaseConfigured && "DATABASE_URL",
    !cronSecretConfigured && "CRON_SECRET",
  ].filter(Boolean);
  record(
    "Radius search vectors",
    true,
    missing.length === 0 ? "ok" : "fail",
    missing.length === 0
      ? `enabled behind a ${searchSemanticCap}-document Eastern-day ceiling`
      : `requested but missing ${missing.join(", ")}`,
  );
} else {
  record(
    "Radius search vectors",
    false,
    searchSemanticCap > 0 ? "warn" : "ok",
    searchSemanticCap > 0
      ? "switch is off; the nonzero allowance is inert but should be reset to 0 for a clear operator state"
      : "off — the required Postgres full-text index runs without OpenAI spend",
  );
}

// ── Public Ask model runtime ────────────────────────────────────────────
const askRuntimeRequested = switchOn("ASK_AI_RUNTIME_ENABLED");
const askDailyCap = boundedInteger(env("ASK_AI_DAILY_CALL_LIMIT"), 1_000);
const askProviderRaw = env("ASK_AI_PROVIDER") || "gateway";
const askProviderSupported = ["gateway", "anthropic", "openai"].includes(
  askProviderRaw,
);
const askProviderCredential =
  askProviderRaw === "gateway"
    ? Boolean(env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN"))
    : askProviderRaw === "anthropic"
      ? Boolean(env("ANTHROPIC_API_KEY"))
      : askProviderRaw === "openai"
        ? openAiKeyConfigured
        : false;
const askCanSpend = askRuntimeRequested && (askDailyCap ?? -1) > 0;
if (askCanSpend) {
  const missing = missingList([
    !askProviderSupported && "a supported ASK_AI_PROVIDER",
    !askProviderCredential && `${askProviderRaw} provider credentials`,
    askDailyCap === null && "ASK_AI_DAILY_CALL_LIMIT from 0 to 1000",
    !databaseConfigured && "DATABASE_URL",
  ]);
  record(
    "Ask Radius model runtime",
    true,
    missing ? "fail" : "ok",
    missing
      ? `requested but missing ${missing}`
      : `${askProviderRaw} is enabled behind a ${askDailyCap.toLocaleString()}-call Eastern-day ceiling`,
  );
} else {
  const malformed = askRuntimeRequested && askDailyCap === null;
  record(
    "Ask Radius model runtime",
    malformed,
    malformed ? "fail" : "ok",
    malformed
      ? "requested with an invalid ASK_AI_DAILY_CALL_LIMIT; use an integer from 0 to 1000"
      : "off — deterministic Frederick answers remain available without model spend",
  );
}

// ── Visitor-time Ask embeddings ─────────────────────────────────────────
const askEmbeddingsRequested = switchOn("ASK_AI_RUNTIME_EMBEDDINGS_ENABLED");
const askEmbeddingCap = boundedInteger(
  env("ASK_AI_EMBEDDING_DAILY_LIMIT"),
  500,
);
const askEmbeddingsCanSpend =
  askEmbeddingsRequested && (askEmbeddingCap ?? -1) > 0;
if (askEmbeddingsCanSpend) {
  const missing = missingList([
    !openAiKeyConfigured && "OPENAI_API_KEY",
    askEmbeddingCap === null && "ASK_AI_EMBEDDING_DAILY_LIMIT from 0 to 500",
    !databaseConfigured && "DATABASE_URL",
  ]);
  record(
    "Ask Radius runtime embeddings",
    true,
    missing ? "fail" : "ok",
    missing
      ? `requested but missing ${missing}`
      : `enabled behind a ${askEmbeddingCap.toLocaleString()}-attempt Eastern-day ceiling`,
  );
} else {
  const malformed = askEmbeddingsRequested && askEmbeddingCap === null;
  record(
    "Ask Radius runtime embeddings",
    malformed,
    malformed ? "fail" : "ok",
    malformed
      ? "requested with an invalid ASK_AI_EMBEDDING_DAILY_LIMIT; use an integer from 0 to 500"
      : "off — Postgres full-text retrieval remains available without embedding spend",
  );
}

// ── Google Maps Platform paid maintenance ───────────────────────────────
const googleApproval =
  env("GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL") ===
  "written-google-authorization-confirmed";
const googleRuntime = switchOn("GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED");
const googlePlacesMaintenanceRequested =
  switchOn("HOURS_REFRESH_CRON") || switchOn("BUSINESS_STATUS_CRON");
if (googlePlacesMaintenanceRequested) {
  const missing = missingList([
    !googleApproval && "reviewed written approval",
    !googleRuntime && "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1",
    !env("GOOGLE_PLACES_API_KEY") && "GOOGLE_PLACES_API_KEY",
    !databaseConfigured && "DATABASE_URL",
    !cronSecretConfigured && "CRON_SECRET",
  ]);
  record(
    "Google Places maintenance",
    true,
    missing ? "fail" : "ok",
    missing
      ? `requested but missing ${missing}`
      : "authorized hours/status maintenance has a database destination and cron authentication",
  );
} else {
  record(
    "Google Places maintenance",
    false,
    "ok",
    "off — existing place data remains readable; no hours/status maintenance request can start",
  );
}

const googleRoutesRequested = switchOn("GOOGLE_ROUTES_ENABLED");
if (googleRoutesRequested) {
  const missing = missingList([
    !googleApproval && "reviewed written approval",
    !googleRuntime && "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1",
    !env("GOOGLE_ROUTES_API_KEY") && "GOOGLE_ROUTES_API_KEY",
    !databaseConfigured && "DATABASE_URL",
  ]);
  record(
    "Google Routes",
    true,
    missing ? "fail" : "ok",
    missing
      ? `requested but missing ${missing}`
      : "authorized and protected by the shared database-backed element ceiling",
  );
} else {
  record("Google Routes", false, "ok", "off — local distance estimates remain available");
}

const googleGeocodingRequested = switchOn("GOOGLE_GEOCODING_ENABLED");
if (googleGeocodingRequested) {
  const missing = missingList([
    !googleApproval && "reviewed written approval",
    !googleRuntime && "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1",
    !env("GOOGLE_GEOCODING_API_KEY") && "GOOGLE_GEOCODING_API_KEY",
    !databaseConfigured && "DATABASE_URL",
    !cronSecretConfigured && "CRON_SECRET",
  ]);
  record(
    "Google event geocoding",
    true,
    missing ? "fail" : "ok",
    missing
      ? `requested but missing ${missing}`
      : "authorized as a bounded fallback after the official Frederick County address service",
  );
} else {
  record(
    "Google event geocoding",
    false,
    "ok",
    "off — the official Frederick County address service remains first and free",
  );
}

// ── Alert delivery ──────────────────────────────────────────────────────
const slack = env("SLACK_WEBHOOK_URL");
if (!slack) {
  record(
    "SLACK_WEBHOOK_URL",
    false,
    "warn",
    "unset — detailed anomalies stay in server logs; the independent GitHub production-health channel remains available",
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

  // A browser token must accept Radius and reject unrelated/no origins. This
  // proves the URL restriction instead of merely proving that the token is
  // syntactically valid. The style document is a cheap read-only probe.
  if (clientToken) {
    try {
      const url =
        "https://api.mapbox.com/styles/v1/mapbox/standard" +
        `?access_token=${encodeURIComponent(clientToken)}`;
      const [radius, unrelated, noOrigin] = await Promise.all([
        fetch(url, { headers: { Referer: "https://frederickradius.app/" } }),
        fetch(url, { headers: { Referer: "https://example.com/" } }),
        fetch(url),
      ]);
      const restricted =
        radius.ok &&
        [401, 403].includes(unrelated.status) &&
        [401, 403].includes(noOrigin.status);
      record(
        "probe NEXT_PUBLIC_MAPBOX_TOKEN",
        true,
        restricted ? "ok" : "fail",
        restricted
          ? "accepted Radius and rejected unrelated/no-origin requests"
          : `URL restriction failed (Radius ${radius.status}, unrelated ${unrelated.status}, no origin ${noOrigin.status})`,
      );
    } catch (error) {
      record(
        "probe NEXT_PUBLIC_MAPBOX_TOKEN",
        true,
        "fail",
        `probe failed: ${error.message}`,
      );
    }
  }

  // Server features are usage-priced and do not share one cheap,
  // service-agnostic probe. Do not create a bill merely to verify syntax here;
  // each route fails closed and is checked when its individual switch is
  // deliberately enabled.
  if (serverToken) {
    record(
      "probe MAPBOX_SERVER_TOKEN",
      false,
      "warn",
      "not called — provider validation would consume a metered API request; verify the exact route after intentionally enabling its switch",
    );
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
  `\n${failed === 0 ? "All enabled capabilities have their required credentials." : `${failed} enabled capability check(s) failed.`}`,
);
if (!PROBE) console.log("Re-run with --probe to test them against the live APIs.\n");
process.exit(failed === 0 ? 0 : 1);
