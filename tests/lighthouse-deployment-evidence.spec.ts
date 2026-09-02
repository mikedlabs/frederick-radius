import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deploymentRevisionChange,
  fetchDeploymentRevision,
  parseDeploymentRevision,
} from "../scripts/lib/lighthouse-deployment";

afterEach(() => {
  vi.useRealTimers();
});

describe("Lighthouse deployment evidence", () => {
  it("reads and normalizes the public production revision", async () => {
    const fetchImpl = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe("https://frederickradius.app/api/health");
      expect(init?.cache).toBe("no-store");
      expect(init?.signal?.aborted).toBe(false);
      return new Response(JSON.stringify({
        deployment: { revision: "ABCDEF012345" },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(fetchDeploymentRevision(
      "https://frederickradius.app",
      { fetchImpl },
    )).resolves.toBe("abcdef012345");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or malformed deployment evidence", () => {
    expect(() => parseDeploymentRevision({})).toThrow(
      "no deployment object",
    );
    expect(() => parseDeploymentRevision({
      deployment: { revision: "not-a-sha" },
    })).toThrow("no valid deployment revision");
  });

  it.each([
    {
      response: new Response("unavailable", { status: 503 }),
      error: "returned HTTP 503",
    },
    {
      response: new Response("not json", { status: 200 }),
      error: "returned invalid JSON",
    },
    {
      response: new Response(JSON.stringify({ deployment: {} }), {
        status: 200,
      }),
      error: "no valid deployment revision",
    },
  ])("fails closed when the health probe $error", async ({ response, error }) => {
    await expect(fetchDeploymentRevision("https://frederickradius.app", {
      fetchImpl: async () => response,
    })).rejects.toThrow(error);
  });

  it("actually aborts a stalled health probe at its deadline", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((
      _input: string | URL | Request,
      init?: RequestInit,
    ) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }));

    const pending = fetchDeploymentRevision("https://frederickradius.app", {
      fetchImpl,
      timeoutMs: 250,
    });
    const rejection = expect(pending).rejects.toThrow(
      "timed out after 250ms",
    );
    await vi.advanceTimersByTimeAsync(250);

    await rejection;
  });

  it("keeps the deadline active while the health response body is read", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => ({
      ok: true,
      status: 200,
      json: () => new Promise<unknown>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    }) as Response);

    const pending = fetchDeploymentRevision("https://frederickradius.app", {
      fetchImpl,
      timeoutMs: 250,
    });
    const rejection = expect(pending).rejects.toThrow(
      "timed out after 250ms",
    );
    await vi.advanceTimersByTimeAsync(250);

    await rejection;
  });

  it("distinguishes a stable target from a deployment that changed mid-run", () => {
    expect(deploymentRevisionChange("abc1234", "abc1234")).toBeNull();
    expect(deploymentRevisionChange("abc1234", "def5678")).toBe(
      "Production deployment changed during Lighthouse sampling (abc1234 -> def5678)",
    );
  });
});

describe("mobile performance workflow evidence contract", () => {
  const workflow = parse(readFileSync(
    resolve(".github/workflows/performance-budget.yml"),
    "utf8",
  )) as {
    jobs: {
      lighthouse: {
        steps: Array<{
          name?: string;
          if?: string;
          run?: string;
          with?: Record<string, unknown>;
        }>;
      };
    };
  };
  const steps = workflow.jobs.lighthouse.steps;

  it("keeps audit code identity separate from the stable production target", () => {
    const audit = steps.find((step) =>
      step.name === "Enforce key-route mobile budgets"
    );
    expect(audit?.run).toContain("--url=https://frederickradius.app");
    expect(audit?.run).toContain(
      "--label=production-monitor-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}",
    );
    expect(audit?.run).toContain("--audit-code-revision=${GITHUB_SHA}");
    expect(audit?.run).toContain("--require-stable-deployment");
    expect(audit?.run).toContain("--runs=3");
    expect(audit?.run).toContain("--enforce");
    expect(audit?.run).not.toContain("--label=production-${GITHUB_SHA");
  });

  it("fails the workflow if Lighthouse evidence was not created", () => {
    const upload = steps.find((step) =>
      step.name === "Upload Lighthouse evidence"
    );
    expect(upload?.if).toBe("always()");
    expect(upload?.with?.path).toBe(".perf");
    expect(upload?.with?.["if-no-files-found"]).toBe("error");
  });
});
