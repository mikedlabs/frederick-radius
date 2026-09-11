import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const lifecycle = require(
  "../scripts/lib/apify-source-change-radar-issue.cjs",
) as {
  latestExpiryFromBodies: (bodies: readonly unknown[]) => string | undefined;
  updateApifySourceChangeRadarIssue: (
    options: Record<string, unknown>,
  ) => Promise<void>;
};
const { latestExpiryFromBodies, updateApifySourceChangeRadarIssue } = lifecycle;

function signal(generatedAt: string) {
  return {
    schemaVersion: 1,
    marker: "<!-- apify-source-change-radar -->",
    title: "[source-radar] First-party venue pages need review",
    generatedAt,
    expiresAt: "2026-08-20T12:00:00.000Z",
    summary: {
      baseline: 0,
      unchanged: 1,
      cosmetic: 0,
      changed: 0,
      error: 0,
    },
    actionable: false,
    items: [],
  };
}

async function signalFile(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "radius-apify-issue-"));
  const path = join(directory, "signal.json");
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

function harness({
  issueBody,
  commentBodies = [],
}: {
  issueBody?: string;
  commentBodies?: string[];
}) {
  const listForRepo = vi.fn();
  const listComments = vi.fn();
  const createComment = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  const update = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  const create = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  return {
    github: {
      paginate: vi.fn(async (method: unknown) => {
        if (method === listForRepo) {
          return issueBody === undefined
            ? []
            : [{ number: 1467, body: issueBody }];
        }
        if (method === listComments) {
          return commentBodies.map((body) => ({ body }));
        }
        throw new Error("unexpected pagination method");
      }),
      rest: {
        issues: {
          listForRepo,
          listComments,
          createComment,
          update,
          create,
        },
      },
    },
    context: {
      serverUrl: "https://github.com",
      repo: { owner: "mikedlabs", repo: "frederick-radius" },
      runId: 123,
    },
    core: { info: vi.fn(), setFailed: vi.fn() },
    createComment,
    update,
    create,
  };
}

describe("Apify source radar issue lifecycle", () => {
  it("uses only valid machine expiry markers and selects the latest", () => {
    expect(
      latestExpiryFromBodies([
        "<!-- apify-source-change-radar-expires:not-a-date -->",
        "<!-- apify-source-change-radar-expires:2026-08-10T12:00:00.000Z -->",
        "<!-- apify-source-change-radar-expires:2026-08-12T12:00:00.000Z -->",
      ]),
    ).toBe("2026-08-12T12:00:00.000Z");
  });

  it("does not close an unresolved actionable issue after a quiet repeat", async () => {
    const h = harness({
      issueBody:
        "<!-- apify-source-change-radar -->\n<!-- apify-source-change-radar-expires:2026-08-20T12:00:00.000Z -->",
    });
    await updateApifySourceChangeRadarIssue({
      github: h.github,
      context: h.context,
      core: h.core,
      signalPath: await signalFile(signal("2026-08-10T12:00:00.000Z")),
    });

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createComment).toHaveBeenCalledOnce();
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "does not resolve the earlier actionable signal",
    );
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "remains open for human review",
    );
  });

  it("closes only after the latest actionable signal expires", async () => {
    const h = harness({
      issueBody:
        "<!-- apify-source-change-radar -->\n<!-- apify-source-change-radar-expires:2026-08-09T12:00:00.000Z -->",
      commentBodies: [
        "<!-- apify-source-change-radar-expires:2026-08-12T12:00:00.000Z -->",
      ],
    });
    await updateApifySourceChangeRadarIssue({
      github: h.github,
      context: h.context,
      core: h.core,
      signalPath: await signalFile(signal("2026-08-12T12:00:00.000Z")),
    });

    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 1467,
        state: "closed",
        state_reason: "not_planned",
      }),
    );
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "expired 2026-08-12T12:00:00.000Z without a recorded human resolution",
    );
  });

  it("fails safe and leaves a legacy issue open when no expiry marker exists", async () => {
    const h = harness({ issueBody: "<!-- apify-source-change-radar -->" });
    await updateApifySourceChangeRadarIssue({
      github: h.github,
      context: h.context,
      core: h.core,
      signalPath: await signalFile(signal("2026-09-01T12:00:00.000Z")),
    });

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "No valid prior expiry marker was found",
    );
  });
});
