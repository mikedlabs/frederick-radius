import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchTextWithRetry,
  SourceBodyLimitError,
  SourceHttpError,
} from "../pipeline/lib/fetch_source";

test("retries a transient 403 and returns the recovered body", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const body = await fetchTextWithRetry("https://example.com/feed", {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("blocked", { status: 403 });
      }
      return new Response('{"ok":true}', { status: 200 });
    },
    sleep: async (delay) => {
      delays.push(delay);
    },
    random: () => 0,
  });

  assert.equal(body, '{"ok":true}');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1000, 3000]);
});

test("honors Retry-After for a rate-limited source", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await fetchTextWithRetry("https://example.com/feed", {
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("slow down", {
            status: 429,
            headers: { "retry-after": "7" },
          })
        : new Response("ok", { status: 200 });
    },
    sleep: async (delay) => {
      delays.push(delay);
    },
    random: () => 0,
  });

  assert.deepEqual(delays, [7000]);
});

test("keeps bounded HTTP diagnostics and does not retry a hard 404", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      fetchTextWithRetry("https://example.com/missing", {
        fetchImpl: async () => {
          attempts += 1;
          return new Response("missing body", {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "text/plain" },
          });
        },
        sleep: async () => undefined,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SourceHttpError);
      assert.equal(error.diagnostic.status, 404);
      assert.equal(error.diagnostic.contentType, "text/plain");
      assert.equal(error.diagnostic.body, "missing body");
      assert.equal(error.diagnostic.bodyTruncated, false);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("streams only a bounded diagnostic body", async () => {
  const oversized = "x".repeat(100_000);
  await assert.rejects(
    () =>
      fetchTextWithRetry("https://example.com/huge-error", {
        fetchImpl: async () => new Response(oversized, { status: 404 }),
        sleep: async () => undefined,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SourceHttpError);
      assert.equal(error.diagnostic.body.length, 64 * 1024);
      assert.equal(error.diagnostic.bodyTruncated, true);
      return true;
    },
  );
});

test("does not retry earlier than a server Retry-After beyond the job budget", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await assert.rejects(() =>
    fetchTextWithRetry("https://example.com/rate-limited", {
      fetchImpl: async () => {
        attempts += 1;
        return new Response("wait", {
          status: 429,
          headers: { "retry-after": "120" },
        });
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      random: () => 0,
    }),
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test("rejects an oversized successful response before buffering it without limit", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      fetchTextWithRetry("https://example.com/oversized-success", {
        fetchImpl: async () => {
          attempts += 1;
          return new Response("0123456789", { status: 200 });
        },
        maxResponseBytes: 8,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SourceBodyLimitError);
      assert.equal(error.diagnostic.limitBytes, 8);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("accepts a successful response exactly at the byte limit", async () => {
  const body = await fetchTextWithRetry("https://example.com/exact-success", {
    fetchImpl: async () => new Response("12345678", { status: 200 }),
    maxResponseBytes: 8,
  });

  assert.equal(body, "12345678");
});
