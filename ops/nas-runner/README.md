# Frederick Radius NAS runner

This project runs one repository-level GitHub Actions runner on the Synology
NAS. Its label is `radius-data`. Only explicitly allowlisted generators running
the trusted `main` revision may target it. Publishing, pull-request code,
required checks, deployments, and provider credentials stay on GitHub/Vercel.

The NAS also serves storage and media workloads. Compose caps this runner at
4 GiB of memory and 2 CPUs so a data build cannot take over the appliance.
Treat an out-of-memory failure as a capacity signal; do not remove the limits
while Plex, storage, or another NAS service is active.

## Security boundary

- No ports are published and no router change is needed.
- The container has no Docker socket, host networking, privileged mode, or
  access to homes, photos, media, backups, or other NAS shares.
- The only writable persistent storage is the Docker named volume
  `frederick-radius-runner-state`, mounted at `/runner`.
- The job process runs as UID/GID 1001. Root is used only at container start to
  initialize and repair ownership of that dedicated volume, with only
  `CHOWN`, `DAC_OVERRIDE`, `SETUID`, and `SETGID` capabilities. Those
  capabilities are dropped when the entrypoint switches to UID 1001.
- The named volume contains the runner's private identity. Treat it like a
  credential: only NAS administrators and the runner service should access it.
- Recreating the container keeps the named volume and runner identity.
  Container Manager **Clean**, `docker compose down -v`, or deleting the
  volume can remove that identity. Back it up before deliberate cleanup, and
  remove the runner in GitHub before retiring it.

## DSM setup

1. In DSM Package Center, install **Container Manager** if it is not already
   installed. Use the Package Center version offered for this DS1821+; do not
   sideload another DSM/model build.
2. In GitHub, open **Settings → Actions → Runners → New self-hosted runner** for
   `mikedlabs/frederick-radius`. Choose Linux x64 and copy the one-hour
   registration token. Do not create or store a personal access token.
3. In Container Manager, create a Project named `frederick-radius-runner` from
   this directory's `compose.yaml`, `Dockerfile`, `runner-entrypoint.sh`, and
   `.dockerignore`. The project creates the named volume
   `frederick-radius-runner-state`; do not map another NAS path to `/runner`.
   Set `RUNNER_TOKEN` only for the first start. Choose the Project **Build**
   action so DSM builds the reviewed local Dockerfile; Start or Restart alone
   is not a substitute after an image change.
4. Start the Project. GitHub should show `radius-data-nas` as **Idle**, with the
   default `self-hosted`, `Linux`, and `X64` labels plus `radius-data`.
5. Immediately clear `RUNNER_TOKEN` in the Project and recreate only the
   container. The registered identity persists in the named volume;
   the expired setup token is no longer present in the container definition.

## Existing bind-mounted runner

Use a fresh registration instead of improvising a partial state copy:

1. Stop the old project and make an archival copy of the complete bind-mounted
   state directory, including hidden files. Do not call this a rollback: once
   GitHub removes that runner, its old credentials cannot restore the identity.
2. Remove the stopped runner in GitHub. Never run two copies of one runner
   identity at the same time.
3. Deploy this project and choose **Build**. Its first build creates
   `frederick-radius-runner-state`; do not use Container Manager **Clean**.
4. Obtain a new one-hour registration token, set `RUNNER_TOKEN`, and start the
   project. Verify that GitHub reports the new runner online and idle.
5. Blank `RUNNER_TOKEN`, rebuild/recreate only the container, and confirm the
   same new runner returns online. Keep the old state archive until the
   acceptance check passes, then remove it deliberately.

As an alternative to the fresh-registration flow above, an administrator who
must preserve an existing identity can copy the complete state into the
stopped named volume with Docker volume tooling, preserving all hidden files
and UID/GID 1001. **Do not remove that runner in GitHub first**: removal
invalidates the credentials being preserved. Keep both the old and new
containers stopped during the copy, then start exactly one of them. That path
is intentionally not a File Station procedure; do not expose the private
volume as a general NAS share.

The image pins GitHub Actions runner 2.337.0 and verifies its published Linux
x64 SHA-256 before extracting it. Before rebuilding after a future release,
copy the version and checksum offered by this repository's **New self-hosted
runner** page into both the Dockerfile defaults and `compose.yaml` build args.
Increment the local `-rN` image revision whenever the Dockerfile changes, then
use Project **Build** and repeat the acceptance check. The Ubuntu base tag and
apt packages intentionally receive current Ubuntu 24.04 security updates, so
the complete image is not byte-reproducible; the runner archive itself remains
checksum-pinned. The installed runner may auto-update inside its protected
named volume.

## Acceptance check

Do not route another job until all of these are true:

1. GitHub reports exactly one online `radius-data` runner.
2. A manual `Build MARC schedule` run completes its `build` job on
   `radius-data-nas`.
3. The separate hosted publisher either opens a review PR or reports that the
   generated file is unchanged.
4. Restarting the Project brings the same runner identity back online.
5. The container has no `/var/run/docker.sock` and cannot see NAS personal
   shares.

GitHub does not bill compute minutes for self-hosted runners. Artifact and
cache storage remain GitHub-hosted and may still count toward storage billing;
the pilot uploads one small artifact with one-day retention.

## Independent production monitor

After this change is reviewed, merged, and pulled into the NAS checkout, the
NAS can check production without receiving a GitHub, Vercel, Supabase, or
database credential. This is separate from the Actions runner and remains
useful when a hosted workflow cannot start. It makes one outbound GET request
to `https://frederickradius.app/api/health` and validates the current production
contract. HTTP 200 or a top-level `operational` string alone is not healthy.

This repository change does not create or enable a DSM task. An administrator
must create one Task Scheduler task named **Frederick Radius production
health** only after the code is merged and the NAS checkout is updated:

- run it every five minutes, all day, using the NAS
  `America/New_York` timezone;
- run `npm run monitor:production:nas` from the reviewed `main` checkout;
- use a low-privilege account with read access to the checkout and write access
  only to `scripts/reports`;
- enable DSM notification with run details when the task exits abnormally.

The first unhealthy observation exits normally. A second consecutive unhealthy
observation confirms the incident. The monitor then alerts only on that
transition, once every six hours while it remains unhealthy, and once on
recovery. Its compact state is
`scripts/reports/nas-production-monitor-state.json`, which is gitignored. An
invalid or partial state file is ignored safely instead of inventing a recovery.
Do not delete a valid state file during an incident because it owns the debounce
and reminder clock.

If `SLACK_WEBHOOK_URL` is available to the task, the monitor sends the
transition to that incoming webhook and exits normally only after Slack accepts
it. Keep the value outside the checkout in an owner-readable,
permission-limited DSM secret or environment file; the monitor never prints or
persists it. If the webhook is absent, invalid, unavailable, or rejected, the
due alert exits with code 2 so DSM can deliver the fallback notification. A
monitor implementation or state-write failure exits with code 1. No-alert
checks exit with code 0.

Before enabling the schedule, run one healthy check and one controlled failure
through DSM, verify the expected notification and recovery, and inspect the
state file permissions. This monitor is not a public service. Do not publish a
NAS port, create a router forward, or make the NAS a Radius origin. Keep the
daily GitHub `Production health alert` workflow enabled as an independent
off-site backstop; NAS and GitHub checks never suppress one another.

## Fair watcher tasks

After the runner handoff is accepted, these tasks can also run from the
reviewed `main` checkout and store only private, gitignored review state. They
need outbound web access and no provider token. Set DSM to include run details
on nonzero exits.

| DSM task | In-season cadence (Eastern) | Outside-season cadence | Command | Nonzero signal |
| --- | --- | --- | --- | --- |
| Frederick Radius Fair official pages | Daily at 6:10 a.m.; temporarily every fifteen minutes during published Fair operating hours | Sunday at 6:10 a.m. | `npm run fair:source-watch -- --live --fail-on-change` | Exit 3 means an official page changed; exit 1 means retrieval failed. |
| Frederick Radius Fair community | 12:20 a.m., 6:20 a.m., 12:20 p.m., and 6:20 p.m. | Sunday at 6:20 a.m. | `npm run fair:community-watch -- --live --fail-on-new` | Exit 3 means a new matching public post; exit 1 means retrieval failed. |

Do not run the daily official-page task alongside the temporary fifteen-minute
event-hours task. A nonzero watcher result is a private review prompt, never
authorization to change or publish the Fair guide automatically.
