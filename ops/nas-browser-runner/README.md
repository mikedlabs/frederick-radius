# Frederick Radius NAS browser runner

This project runs a second repository-level GitHub Actions runner on the
Synology NAS. Its label is `radius-browser`. It is separate from the
`radius-data` runner because a Next.js build and two Chromium workers need a
larger memory allowance and a different software image.

Only four reviewed, secret-free workflows may target this runner:

- `fair-surge.yml` manually builds and exercises the Fair workspace on loopback only.
- `ux-audit.yml` runs nightly at 05:15 UTC and can be started manually.
- `performance-budget.yml` runs daily at 17:15 UTC and can be started manually.
- `visual-contract.yml` remains manual until reviewed Linux baselines exist.

Pull requests, required checks, publishing, deployments, provider credentials,
and production recovery stay on GitHub-hosted runners or Vercel. The browser
runner is test capacity. It never serves the public application.

## Resource boundary

The runner is capped at 8 GiB of memory and CPUs 2 and 3. Chromium receives a
private 1 GiB shared-memory allocation. The separate data runner remains capped
at 4 GiB and CPUs 0 and 1. Schedules are staggered so both lanes should not use
their full CPU allowances at the same time.

Do not replace these controls with host IPC, host networking, privileged mode,
`SYS_ADMIN`, or an unlimited memory setting. Treat an out-of-memory or browser
launch failure as evidence to review the measured limit.

## Security boundary

- The repository is private and the runner is registered only to
  `mikedlabs/frederick-radius`.
- Every allowed job checks both the exact repository and `refs/heads/main`.
- No allowed workflow has a pull-request or push trigger, references a GitHub
  repository secret, or receives write permission. Its ephemeral
  `GITHUB_TOKEN` is limited to read-only repository contents.
- The container has no published port, Docker socket, host network, privileged
  mode, or access to any NAS share.
- The only writable persistent storage is the Docker named volume
  `frederick-radius-browser-runner-state`, mounted at `/runner`.
- The job process runs as UID/GID 1001. Root is used only at startup to prepare
  that dedicated volume, with the same minimal capabilities as the data runner.
- The root filesystem is read-only. `/tmp` and Chromium shared memory are
  bounded temporary filesystems.

A Docker bridge prevents inbound exposure but is not an outbound LAN firewall.
Do not describe this project as LAN-isolated unless the NAS has a separately
verified egress rule for the container network. The no-secret, trusted-main
boundary is mandatory while that residual access exists.

## Browser image contract

The image pins the Playwright 1.60.0 Noble image by immutable digest because
`package-lock.json` also pins Playwright 1.60.0. The official image supplies the
browsers and operating-system libraries; `npm ci` supplies the project package.
The workflows verify the version contract before launching a browser.

Lighthouse discovers the same Chromium binary through `CHROME_PATH`. Do not add
`npx playwright install --with-deps` to a job. It needs root package changes,
duplicates the reviewed image, and cannot work with this read-only root.

Update Playwright, the image tag and digest, `PLAYWRIGHT_IMAGE_VERSION`, and the
local image revision in one reviewed change.

## DSM setup

1. Keep the existing `frederick-radius-runner` data project running.
2. In GitHub, open **Settings -> Actions -> Runners -> New self-hosted runner**
   for `mikedlabs/frederick-radius`. Choose Linux x64 and copy the one-hour
   registration token. Do not create a personal access token.
3. In Container Manager, create a different Project named
   `frederick-radius-browser-runner` from this directory. Choose **Build** so
   DSM builds the reviewed Dockerfile.
4. Set `RUNNER_TOKEN` only for the first start. GitHub should show
   `radius-browser-nas` with `self-hosted`, `Linux`, `X64`, and
   `radius-browser`.
5. Blank `RUNNER_TOKEN` and recreate only this container. The named volume
   retains the registered identity.

Never copy the data runner's named volume or identity into this project, and
never run two containers with one runner identity.

## Acceptance check

Do not enable a recurring job until all of these are true:

1. GitHub reports exactly one online `radius-browser` runner.
2. A manual UX audit from `main` builds once and completes on
   `radius-browser-nas` without a stored secret or write permission.
3. A manual performance audit produces stable-deployment Lighthouse evidence.
4. A manual Fair surge run builds and passes all three fixed loopback stages.
5. A manual visual `capture` run produces 12 Linux/Chromium review images.
6. Cancelling an audit leaves no Next.js or Chromium process running.
7. Restarting the Project brings the same runner identity back online.
8. The container has no Docker socket and cannot see NAS personal shares.

The visual workflow must stay manual after this acceptance check. Review and
commit all 12 Linux baselines, then prove a manual `compare` run before a later
change proposes a trusted-main schedule.

GitHub does not bill compute minutes for self-hosted runners. Uploaded traces
and reports still use GitHub artifact storage; current retention is seven days.
