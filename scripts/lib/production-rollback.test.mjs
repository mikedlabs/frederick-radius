import assert from "node:assert/strict";
import test from "node:test";

import {
  sameSha,
  selectPreviousMainDeployment,
} from "./production-rollback.mjs";

const deployment = ({
  sha,
  createdAt,
  ref = "main",
  state = "READY",
  target = "production",
}) => ({
  state,
  target,
  createdAt,
  url: `${sha}.vercel.app`,
  meta: {
    githubCommitSha: sha,
    githubCommitRef: ref,
  },
});

test("sameSha accepts the short SHA emitted by the service worker", () => {
  assert.equal(sameSha("abcdef1234567890", "abcdef1"), true);
  assert.equal(sameSha("abcdef1", "abcdef1234567890"), true);
  assert.equal(sameSha("abcdef1", "1234567"), false);
});

test("selects the immediately preceding healthy main deployment", () => {
  const failed = deployment({ sha: "badbadbadbad", createdAt: 300 });
  const preview = deployment({
    sha: "previewpreview",
    createdAt: 250,
    ref: "feature",
  });
  const previous = deployment({ sha: "goodgoodgood", createdAt: 200 });
  const older = deployment({ sha: "olderolder12", createdAt: 100 });

  const result = selectPreviousMainDeployment(
    { deployments: [older, preview, failed, previous] },
    "badbadb",
  );

  assert.equal(result.error, null);
  assert.equal(result.candidate?.meta.githubCommitSha, "goodgoodgood");
});

test("never guesses when the failed release is absent", () => {
  const result = selectPreviousMainDeployment(
    {
      deployments: [
        deployment({ sha: "goodgoodgood", createdAt: 200 }),
      ],
    },
    "missing",
  );

  assert.equal(result.error, "expected-deployment-missing");
  assert.equal(result.candidate, null);
});

test("ignores non-ready and non-production candidates", () => {
  const failed = deployment({ sha: "badbadbadbad", createdAt: 300 });
  const result = selectPreviousMainDeployment(
    {
      deployments: [
        deployment({
          sha: "notreadynow1",
          createdAt: 250,
          state: "ERROR",
        }),
        deployment({
          sha: "previewonly12",
          createdAt: 200,
          target: null,
        }),
        failed,
      ],
    },
    "badbadbadbad",
  );

  assert.equal(result.error, "previous-main-deployment-missing");
  assert.equal(result.candidate, null);
});
