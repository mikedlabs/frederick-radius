# Frederick Radius NAS runner

This project runs one repository-level GitHub Actions runner on the Synology
NAS. Its label is `radius-data`. Only explicitly allowlisted generators running
the trusted `main` revision may target it. Publishing, pull-request code,
required checks, deployments, and provider credentials stay on GitHub/Vercel.

## Security boundary

- No ports are published and no router change is needed.
- The container has no Docker socket, host networking, privileged mode, or
  access to homes, photos, media, backups, or other NAS shares.
- The only NAS mount is the dedicated runner-state directory.
- The job process runs as UID/GID 1001. Root is used only at container start to
  initialize and repair ownership of that dedicated directory, with only
  `CHOWN`, `DAC_OVERRIDE`, `SETUID`, and `SETGID` capabilities. Those
  capabilities are dropped when the entrypoint switches to UID 1001.
- The state directory contains the runner's private identity. Treat it like a
  credential: only NAS administrators and the runner service should access it.
- Never use Container Manager **Clean** or delete the state directory unless
  deliberately retiring and removing the runner in GitHub first.

## DSM setup

1. In DSM Package Center, install **Container Manager** if it is not already
   installed. Use the Package Center version offered for this DS1821+; do not
   sideload another DSM/model build.
2. In File Station, create the dedicated folder
   `/volume1/docker/frederick-radius-runner/state`. If Container Manager uses a
   different volume, change `RUNNER_STATE_PATH` in the project environment.
3. In GitHub, open **Settings → Actions → Runners → New self-hosted runner** for
   `mikedlabs/frederick-radius`. Choose Linux x64 and copy the one-hour
   registration token. Do not create or store a personal access token.
4. In Container Manager, create a Project named `frederick-radius-runner` from
   this directory's `compose.yaml`, `Dockerfile`, and `runner-entrypoint.sh`.
   Set `RUNNER_TOKEN` only for the first start.
5. Start the Project. GitHub should show `radius-data-nas` as **Idle**, with the
   default `self-hosted`, `Linux`, and `X64` labels plus `radius-data`.
6. Immediately clear `RUNNER_TOKEN` in the Project and recreate only the
   container. The registered identity persists in the dedicated state folder;
   the expired setup token is no longer present in the container definition.

The image pins GitHub Actions runner 2.337.0 and verifies its published Linux
x64 SHA-256 before extracting it. Before rebuilding after a future release,
copy the version and checksum offered by this repository's **New self-hosted
runner** page into both the Dockerfile defaults and `compose.yaml` build args.
The installed runner may auto-update inside its protected state directory.

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
