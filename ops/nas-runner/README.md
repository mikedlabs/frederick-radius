# Frederick Radius NAS runner

This directory defines the hardened replacement for the live repository-level
GitHub Actions runner on the Synology NAS. The live runner must be treated as
active until an administrator completes the migration below. Merging these
files does not change the running DSM project by itself.

The only retained scheduling label is `radius-data`. Four inventoried
trusted-main generators may request it. Publishing, pull-request code,
required checks, deployments, and provider write credentials stay on
GitHub-hosted or Vercel infrastructure.

The NAS also serves storage and media workloads. The job listener remains
capped at 4 GiB of memory and two CPUs. Treat an out-of-memory failure as a
capacity signal; do not remove those limits while other NAS services are
active.

## Enforced boundary

- No service publishes a port. No container has the Docker socket, host
  networking, privileged mode, or a NAS share.
- The listener joins only the internal `runner-private` bridge. Its startup
  firewall drops every direct outbound connection except TCP to the fixed
  proxy address on port 3128 and explicitly rejects Docker's embedded DNS
  address before allowing other loopback traffic. The unprivileged job cannot
  change those rules.
- Only the proxy joins an uplink network. Squid accepts clients only from the
  two fixed runner addresses, allows only CONNECT to port 443, rejects private,
  loopback, link-local, documentation, multicast, and reserved destinations,
  and applies the hostname allowlist before resolving a requested destination,
  closing denied-hostname DNS exfiltration. Its bootstrap
  explicitly selects the declared `172.31.254.1` uplink gateway before dropping
  every capability, so Docker cannot silently choose the internal bridge as
  its default route.
- The checksum-verified runner executable stays under
  `/opt/actions-runner` in the read-only image. It is never copied to a job
  volume.
- Registration identity uses `frederick-radius-runner-identity-v2`. The
  one-shot registration service is the only service that mounts it writable.
  The listener mounts the same volume read-only. Registration does not mount or
  reset the listener's scratch volume, so rerunning the initializer cannot
  erase an active job.
- Job work, HOME, downloaded actions, tool cache, and npm cache use the
  separate `frederick-radius-runner-scratch-v2` volume. Before each listener
  cycle, the privileged bootstrap deletes that volume's contents and recreates
  the fixed directories. The scratch root is not a NAS bind mount.
- The listener invokes the immutable `Runner.Listener` binary directly with
  `run --once`. After one job completes, the process and container exit. Docker
  restarts it, which kills any remaining process and runs scratch cleanup
  before another job can be accepted. Do not replace this with stock `run.sh`;
  that wrapper writes inside the runner root and can internally restart without
  invoking container cleanup.
- Registration uses `--no-default-labels` and `--disableupdate`. Image updates
  are deliberate reviewed rebuilds. Every privileged bootstrap capability is
  removed from the bounding, inheritable, and ambient sets before config or job
  code runs.
- `RUNNER_TOKEN` is present only in the one-shot registration service. The
  long-running listener refuses to start if that variable is present.
- Runner diagnostics also go to container stdout so Docker's capped log files
  retain evidence across disposable listener cycles.

## Egress allowlist

The proxy permits only the current requirements for:

- GitHub listener, checkout/action downloads, release assets, logs, and
  artifacts;
- Node setup and `registry.npmjs.org`;
- the MTA MARC endpoint, its current exact S3 redirect, and the Frederick
  TransIT feed;
- the reviewed Fair calendar, Fair website API, and EventHub pages; and
- the browser-safe Supabase Data API host family.

The complete list is in `runner-egress.conf`. Changes to a generator's network
destinations must update that file and the contract test in the same review.
GitHub's required domains can change. Compare the policy with GitHub's
self-hosted-runner communication reference at least weekly and before each
runner image update.

The proxy is a software control on the same NAS, not a replacement for an
outer router ACL, destination-filtered VLAN, or separate low-value runner
host. A proxy vulnerability could weaken this layer. The hostname allowlist
also controls destinations, not content: approved GitHub, npm, and Supabase
hosts can still serve attacker-controlled material. Keep dependency and action
review controls in place.

## Known runner compatibility boundary

GitHub's runner hardcodes registration files next to `Runner.Listener`. The
image redirects those named files through immutable symlinks to the identity
volume. Current runner 2.337.0 may try to rewrite identity if GitHub requests a
server-side runner rename or configuration/auth migration. The read-only mount
will reject that write. Monitor logs for `Cannot update the settings file` or
`Failed to update runner` and perform a controlled fresh registration if one
appears. Never make the listener identity writable to silence the error.

If GitHub reports that the runner no longer exists, the upstream listener may
try and fail to delete its local read-only identity, then restart against the
same stale credential. Stop the project, retire that v2 identity volume, and
perform a fresh registration. Do not expect this condition to self-heal.

The job runs under the same upstream OS identity that reads the runner
credential files. Read-only mounting prevents overwrite and persistence, but
does not make those credentials unreadable to a compromised job. GitHub's
fully ephemeral JIT model with external log forwarding remains the stronger
long-term design. The pinned runner still supports `--once`, but GitHub marks
that switch deprecated, so every runner version update must retest the
single-job exit contract.

## Before the live migration

1. Confirm the current `radius-data-nas` runner is idle and no data job is
   queued. Use a short maintenance window; a job queued during the cutover can
   wait safely.
2. In Container Manager, confirm `172.31.255.0/29` and `172.31.254.0/29` do not
   overlap an existing Docker network or routed LAN. If either does, stop and
   change both affected network declarations, the fixed client/proxy addresses,
   the explicitly declared uplink gateway, both entrypoint constants, and the
   Squid client ACL together. Re-run the repository contract test and Compose
   validation.
3. Record DSM Container Manager's Docker/Moby engine version and confirm it
   includes the fix for Moby GHSA-mq39-4gv4-mvpx. The advisory lists 23.0.11,
   25.0.5, and 26.0.0-rc3 as patched branch points; a Synology-vendored build
   needs explicit backport evidence if its version does not make that clear.
   The runner also blocks Docker's embedded DNS directly; do not rely on that
   application rule as a reason to keep a vulnerable engine.
4. Preserve an administrator-only archive of the old
   `frederick-radius-runner-state` volume. It contains a credential. Do not put
   it in a general share, support ticket, or repository.
5. Obtain a fresh one-hour repository registration token from GitHub. Do not
   create or store a personal access token.
6. Keep the old GitHub runner registration in place but stop its DSM container.
   Verify it is offline before starting the replacement. Never run two
   containers with the same identity.

## Live migration and fresh registration

1. Deploy this directory from the exact reviewed commit to the existing
   Container Manager project. Set `RUNNER_TOKEN` and choose **Build**. An image
   change requires Build, not only Start or Restart.
2. Compose starts the proxy, then the one-shot `radius-data-register` service.
   That service creates a fresh identity named `radius-data-nas-v2` in the new
   identity volume and exits. The listener starts only after registration exits
   successfully.
3. In GitHub, confirm the old runner is offline and exactly one new runner is
   online and idle. The new runner must show only `radius-data`. If
   `self-hosted`, `Linux`, or `X64` appears, stop the new project and do not run
   a job.
4. Blank `RUNNER_TOKEN` in the Container Manager project and build/recreate the
   project. A restart alone does not prove the token was removed from service
   metadata. The registration initializer should report that the identity is
   already complete, and the listener should return online with the same v2
   identity.
5. Run the manual **Build MARC schedule** pilot. Confirm checkout, Node setup,
   `npm ci`, MTA download, validation, and artifact upload succeed. Confirm the
   hosted publisher remains on `ubuntu-latest` and receives only the expected
   artifact.
6. Run the job a second time. The listener log must show `Resetting disposable
   runner work and caches` before each new listening cycle. No prior checkout,
   downloaded action, HOME file, tool, or npm cache may remain.
7. Only after all acceptance checks pass, remove the old offline runner in
   GitHub. Then deliberately retire the old container and state volume. Before
   GitHub removal, rollback is possible by stopping v2 and restarting the old
   container. After removal, the old credential cannot restore that identity.

Do not use `--replace`, copy the old identity into v2, mount the old complete
runner tree, or let the registration and listener services share a writable
identity mount. An incomplete v2 identity fails closed and requires removal of
that new v2 volume plus another fresh registration.

## Runtime network acceptance

Perform these checks from the final job context without recording addresses or
tokens in logs:

1. Confirm direct TCP attempts to the NAS management plane, another LAN host,
   the Docker bridge gateway, and a link-local address fail.
2. Confirm the same NAS/LAN targets are denied when explicitly sent through
   the proxy. Confirm an unlisted public HTTPS host, raw IPv4 CONNECT
   authority, and bracketed IPv6 CONNECT authority are denied without upstream
   DNS/PTR lookups.
3. Confirm GitHub API, action download, npm registry, and each public data feed
   required by the four jobs works through the proxy. The installed Node 22
   must resolve to 22.21.0 or later, where `NODE_USE_ENV_PROXY=1` covers the
   built-in HTTP client and `fetch`; fail the pilot if it does not.
4. Confirm the listener has no DNS or direct HTTPS route when proxy variables
   are unset in a test process. Try an arbitrary unique hostname and confirm it
   does not appear in the upstream DNS logs. The kernel OUTPUT rule and the
   proxy's pre-resolution hostname denial, not application cooperation, must
   cause the denial.
5. Review proxy logs for only approved CONNECT destinations and review runner
   logs for update, identity-write, or restart errors.

The repository can prove the intended topology and allowlist. It cannot prove
the deployed DSM network path. Record these results during the migration. If a
required destination is missing, stop and review the exact hostname before
adding it. Do not add a broad Internet wildcard to make the pilot green.

## Full acceptance check

Do not route unattended work until all of these are true:

1. GitHub reports the old runner offline and exactly one v2 runner online with
   only `radius-data`.
2. The registration token is absent from the recreated project and listener
   environment.
3. The manual MARC pilot and a second run succeed through the proxy.
4. Direct and proxied DSM/LAN probes fail while required public endpoints work.
5. `/opt/actions-runner` and `/runner/identity` reject a UID 1001 write, while
   `/runner/scratch/work` accepts it.
6. A marker written anywhere in scratch is absent after the listener container
   restarts. The v2 identity remains present and unchanged.
7. The deployed scratch filesystem has a DSM/storage quota with tested
   headroom for checkout plus `npm ci`. A bounded fill reaches `ENOSPC` without
   consuming the host pool. Do not substitute an arbitrary large RAM-backed
   tmpfs or mount a broad user-data share.
8. Kill the listener in a disposable test cycle and confirm its health becomes
   unhealthy before restart; a health command must not match itself.
9. The container has no Docker socket, NAS share, host network, published port,
   or privileged mode.
10. Proxy and runner logs are retained and an operator knows how to stop,
   de-register, rebuild, and freshly register after an anomaly.

## Reviewed updates

The image pins GitHub Actions runner 2.337.0 and verifies its published Linux
x64 SHA-256 before extraction. For an update, copy the version and checksum
offered by the repository's **New self-hosted runner** page into both runner
build definitions, increment the local `-rN` image revision, and rebuild. Do
not re-enable automatic update. GitHub requires a disabled-update runner to be
updated within 30 days of a new runner release and may block job queueing
immediately for a critical security update. Treat the upstream runner release
feed as an operational alert, not optional maintenance.

Before deploying a new version, re-run the tests for configuration paths,
`--no-default-labels`, `--disableupdate`, direct `Runner.Listener run --once`,
single-job exit, read-only identity behavior, proxy requirements, and scratch
cleanup. Preserve the existing v2 identity only if the new binary remains
compatible. Otherwise stop and use a fresh versioned identity volume.

GitHub does not bill compute minutes for self-hosted runners. Artifact storage
remains GitHub-hosted and may still count toward storage billing.
