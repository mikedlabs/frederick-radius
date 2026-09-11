import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = new URL("../scripts/verify-credentials.mjs", import.meta.url);

function run(overrides = {}) {
  return spawnSync(process.execPath, [script.pathname], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      NEXT_PUBLIC_MAPBOX_TOKEN: "pk.radius-test-browser-token",
      ASK_AI_RUNTIME_ENABLED: "0",
      ASK_AI_DAILY_CALL_LIMIT: "0",
      ASK_AI_RUNTIME_EMBEDDINGS_ENABLED: "0",
      ASK_AI_EMBEDDING_DAILY_LIMIT: "0",
      RADIUS_SEARCH_SEMANTIC_ENABLED: "0",
      RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT: "0",
      HOURS_REFRESH_CRON: "0",
      BUSINESS_STATUS_CRON: "0",
      GOOGLE_ROUTES_ENABLED: "0",
      GOOGLE_GEOCODING_ENABLED: "0",
      ...overrides,
    },
  });
}

test("passes when optional paid capabilities are explicitly off", () => {
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Ask Radius model runtime.*off/);
  assert.match(result.stdout, /Google Places maintenance.*off/);
  assert.doesNotMatch(result.stdout, /Google photo delivery/);
  assert.match(
    result.stdout,
    /All enabled capabilities have their required credentials/,
  );
});

test("fails when Ask is switched on without its selected key or database", () => {
  const result = run({
    ASK_AI_RUNTIME_ENABLED: "1",
    ASK_AI_DAILY_CALL_LIMIT: "25",
    ASK_AI_PROVIDER: "anthropic",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Ask Radius model runtime.*FAIL|FAIL\s+Ask Radius model runtime/);
  assert.match(result.stdout, /anthropic provider credentials/);
  assert.match(result.stdout, /DATABASE_URL/);
});

test("passes an enabled Ask runtime only with the selected key and database", () => {
  const result = run({
    ASK_AI_RUNTIME_ENABLED: "1",
    ASK_AI_DAILY_CALL_LIMIT: "25",
    ASK_AI_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    DATABASE_URL: "postgres://radius:test@example.test/radius",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /anthropic is enabled behind a 25-call/);
});

test("fails when hours maintenance is enabled without recorded approval", () => {
  const result = run({
    HOURS_REFRESH_CRON: "1",
    GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED: "1",
    GOOGLE_PLACES_API_KEY: "test-places-key",
    DATABASE_URL: "postgres://radius:test@example.test/radius",
    CRON_SECRET: "test-cron-secret",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Google Places maintenance/);
  assert.match(result.stdout, /reviewed written approval/);
});

test("passes fully authorized hours maintenance", () => {
  const result = run({
    HOURS_REFRESH_CRON: "1",
    GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL:
      "written-google-authorization-confirmed",
    GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED: "1",
    GOOGLE_PLACES_API_KEY: "test-places-key",
    DATABASE_URL: "postgres://radius:test@example.test/radius",
    CRON_SECRET: "test-cron-secret",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /authorized hours\/status maintenance has a database destination/,
  );
});
