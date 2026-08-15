export function sameSha(left, right) {
  return (
    Boolean(left) &&
    Boolean(right) &&
    (left.startsWith(right) || right.startsWith(left))
  );
}

export function selectPreviousMainDeployment(payload, expectedSha) {
  const deployments = Array.isArray(payload?.deployments)
    ? payload.deployments
        .filter(
          (deployment) =>
            deployment?.state === "READY" &&
            deployment?.target === "production" &&
            typeof deployment?.url === "string" &&
            typeof deployment?.createdAt === "number" &&
            typeof deployment?.meta?.githubCommitSha === "string",
        )
        .sort((left, right) => right.createdAt - left.createdAt)
    : [];

  const failedIndex = deployments.findIndex((deployment) =>
    sameSha(
      String(deployment.meta.githubCommitSha).toLowerCase(),
      expectedSha,
    ),
  );
  if (failedIndex < 0) {
    return { error: "expected-deployment-missing", candidate: null };
  }

  // A newer READY main deployment means this canary is stale. Never let an
  // older run roll the apex back across a later healthy promotion, even if a
  // workflow cancellation arrives after the recovery process has started.
  const newerMainExists = deployments
    .slice(0, failedIndex)
    .some(
      (deployment) =>
        deployment.meta.githubCommitRef === "main" &&
        !sameSha(
          String(deployment.meta.githubCommitSha).toLowerCase(),
          expectedSha,
        ),
    );
  if (newerMainExists) {
    return { error: "newer-main-deployment-present", candidate: null };
  }

  const candidate =
    deployments
      .slice(failedIndex + 1)
      .find(
        (deployment) =>
          deployment.meta.githubCommitRef === "main" &&
          !sameSha(
            String(deployment.meta.githubCommitSha).toLowerCase(),
            expectedSha,
          ),
      ) ?? null;

  return {
    error: candidate ? null : "previous-main-deployment-missing",
    candidate,
  };
}
