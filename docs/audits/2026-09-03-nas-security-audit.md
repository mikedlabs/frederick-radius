# NAS security audit — 2026-09-03

- Status: point-in-time security review
- Repository baseline: origin/main at 0530f1161b760b5cd514e76e3082ed97934a0e13
- Hardening branch: claude/nas-security-audit-sep03 (tracked controls are not
  live until the DSM project is migrated and accepted)
- NAS platform: Synology DSM
- Assessment type: verified DSM observations, baseline runner/workflow review,
  and non-deployed repository hardening

## Executive decision

No evidence of an active compromise was found. This is not an all-clear. The
`radius-data-nas` GitHub Actions runner is already registered, online, and idle
in the verified live snapshot. The baseline repository's statement that it had
not gone live was stale. Until an administrator stops or replaces it, its three
original design weaknesses are active exposure rather than pre-activation
theory: unrestricted bridge egress, shared writable runner identity/executable
and job storage, and GitHub's default scheduling labels.

This hardening branch implements repository-side mitigations for those three
issues: a TLS-only destination-filtering proxy plus a kernel egress rule, a
two-stage registration/runtime image with read-only executable and identity
state plus purged scratch, and a no-default-label configuration with a complete
direct-job runner-target inventory. Those controls have not been built, run, or
accepted on DSM. They do not protect the currently online runner merely because
they exist in Git.

The NAS itself also has high-priority open controls. DSM Firewall is off while
a Synology Drive router mapping exists. The active administrator does not use
2FA, and logs show recent successful password-only DSM sign-ins including from
an external-network source. The guest account has repeatedly accessed `homes`
over SMB from local clients. Hyper Backup and Snapshot Replication are now
installed, but no off-device backup task or restore test exists; `homes` and
most other shares still have no snapshot schedule.

Several controls were safely improved during the verified DSM review. Auto
Block is now enabled with a one-day expiry, DoS protection is enabled for LAN1,
HTTP requests now redirect to HTTPS, warning notifications are enabled, the
first Work/business Security Advisor scan completed, and Package Center no
longer lists pending updates. Storage Manager reports a healthy volume and all
eight disks healthy. One locked immutable `docker` snapshot and a daily
schedule now exist. These are current positive controls, not proof of off-device
recovery for the 39 TB dataset.

## Scope, evidence, and limits

This report separates four evidence classes:

- **Verified DSM observation** means the setting or result was observed in the
  live DSM session on 2026-09-03.
- **Verified repository evidence** means the statement is supported by the
  baseline commit or by the reviewed hardening branch, as stated in the
  finding. Branch controls are design evidence, not deployment evidence.
- **Inference** means the configuration permits a risk, but the relevant
  network or attack path was not exercised.
- **Unknown** means the audit did not obtain enough evidence to call the
  control present or absent.

The report and hardening branch did not alter DSM, GitHub, the router, or the
NAS. The safe DSM changes summarized above were completed and verified in the
live administration session that supplied the final snapshot. The current
runner inventory was also verified live. No credentials, API-key values,
identities, public or client IP addresses, certificate identifiers, or router
port numbers are recorded here.

The baseline control-plane document incorrectly said the runner was not live.
The branch corrects that claim and documents a fresh v2 migration
(docs/CONTROL_PLANE.md; ops/nas-runner/README.md). Live deployment and runtime
acceptance remain unknown.

Severity meanings:

| Severity | Meaning |
| --- | --- |
| Critical | A demonstrated path to immediate remote compromise or catastrophic loss |
| High | A credible compromise, persistence, or unrecoverable-loss path requiring urgent containment |
| Medium | A material hardening or governance gap that should be scheduled promptly |
| Low | Defense in depth, operational assurance, or a bounded evidence gap |

## Finding summary

| ID | Severity | Finding | State |
| --- | --- | --- | --- |
| NAS-001 | High | DSM Firewall is off while a Synology Drive router mapping exists | Open |
| NAS-002 | High | The active administrator is not protected by enforced 2FA | Open |
| NAS-003 | High | No off-device data backup or restore has been demonstrated | Open |
| NAS-004 | Medium | DSM 7.4.1 remains pending after package updates completed | Open, intentionally deferred |
| NAS-005 | High | The live runner lacks a verified DSM/LAN network-isolation policy | Active; branch mitigation not deployed |
| NAS-006 | High | The live runner uses mutable shared runner/job storage | Active; branch mitigation not deployed |
| NAS-007 | Medium | The live runner's default labels bypass the custom-label allowlist | Active; branch mitigation not deployed |
| NAS-008 | High | Guest is actively accessing `homes` over SMB | Open |
| NAS-009 | Medium | Synology Office can use an OpenAI integration without a documented data-governance boundary | Open evidence gap |
| NAS-010 | Low | Password policy allows short and common passwords | Open |
| NAS-011 | Low | Spectre/Meltdown protection is disabled on a host proposed for CI work | Open |
| NAS-012 | Low | Alert receipt, recurring Security Advisor cadence, and remote-access policy are unverified | Partially remediated |
| NAS-013 | Medium | RAID data scrubbing has never run and has no schedule | Deferred pending recovery evidence |
| NAS-014 | Medium | Runner scratch has no verified storage quota | Branch residual; block v2 activation pending quota test |

There are no Critical findings. The online runner, single-factor administrator
access, guest share access, absent off-device recovery proof, and unfiltered NAS
service exposure still warrant urgent containment.

## Detailed findings

### NAS-001 — DSM Firewall is off while a Synology Drive router mapping exists

**Severity:** High

**Evidence class:** verified DSM observation; external reachability remains
unverified

The DSM Firewall is disabled. Router Configuration shows one active TCP mapping
for Synology Drive. QuickConnect is enabled, relay is disabled, and no DDNS
configuration was observed. The mapping is unrelated to the proposed Actions
runner: that runner publishes no ports, as documented at
ops/nas-runner/README.md:13-17.

Auto Block and LAN1 DoS protection are now enabled, which reduces brute-force
and denial-of-service risk. Neither replaces service allowlisting at the NAS
boundary. A nonstandard external port is also not an access control.

**Impact:** If the router mapping is reachable from the public Internet, the
Drive service is exposed without a host-level firewall policy limiting source
addresses or services. The audit did not probe the public address, so it does
not claim the mapping is currently reachable.

**Remediation:**

1. Identify who still needs direct Synology Drive access and test a replacement
   path before changing the mapping. Tailscale is installed and may be a safer
   application-access path, but its connection state, ACLs, device approvals,
   subnet routes, and administrator protections must be reviewed first.
2. Remove the router mapping if it is not required. If it must remain, restrict
   it at the router and DSM to the smallest practical source and service scope.
3. Stage a DSM firewall profile with explicit allow rules before enabling its
   default deny. Keep a working local administrator session and a second tested
   recovery path open while applying it. Rule order matters.
4. From an authorized network outside the LAN, verify that only the intended
   application path is reachable. Record the result without publishing port or
   address details.

**Close when:** the mapping is removed or its business need, reachable surface,
source restrictions, and DSM firewall rules are documented and tested.

### NAS-002 — The active administrator is not protected by enforced 2FA

**Severity:** High

**Evidence class:** verified DSM observation

The default admin account is deactivated and there is one named active
administrator, both positive controls. The current administrator has 2FA
disabled, and DSM-wide 2FA enforcement is off. Adaptive MFA for administrators
is on, but Synology documents it as conditional on signals such as an
unrecognized device and an external-network sign-in; it is not equivalent to
2FA on every administrator login. DSM also permits stay-signed-in sessions and
trusted devices that can skip 2FA.

Log Center shows recent successful password-only DSM logins by the named
administrator, including an external-network source. This is evidence that the
single-factor path is actively used; no identity or address is retained here.
DSM time is verified as Eastern Time and NTP reports normal synchronization to
`time.google.com`, so clock readiness is not the remaining 2FA blocker.

Auto Block is now enabled at 10 failures within five minutes with a one-day
expiry. Account Protection status was not captured and remains unknown.

**Impact:** A stolen or reused administrator password can become a
single-factor path to all NAS data and settings, particularly from a recognized
device or a path that does not trigger Adaptive MFA.

**Remediation:**

1. Confirm a local recovery route, recovery codes, accurate time
   synchronization, and a second authorized administrator recovery method.
2. Enroll the named administrator in 2FA and prove login and recovery from a
   second browser before closing the current session.
3. Then enforce 2FA for the administrators group. Check compatibility first for
   Hyper Backup or rsync-over-SSH workflows because Synology calls out service
   limitations.
4. Review trusted-device and stay-signed-in policy for administrators. Keep the
   15-minute inactivity logout.
5. Verify Account Protection separately; do not change Auto Block to a
   permanent lockout.

**Close when:** every active administrator has tested 2FA and recovery, and
administrator-group enforcement is enabled.

### NAS-003 — No off-device data backup or restore has been demonstrated

**Severity:** High

**Evidence class:** verified DSM observation plus explicit unknown

Automatic DSM configuration backup is enabled, encrypted, and last succeeded
on 2026-09-02 at 18:24:51. That is useful for settings recovery. Hyper Backup
4.1.2 is now installed and started successfully, but no off-device Hyper Backup
task exists and no restore test has been performed.

Snapshot Replication and Replication Service are also installed. Their first
view reported 39 TB entirely unprotected. The `docker` shared folder now has a
daily schedule retaining the latest 30 snapshots, seven-day immutability, and
one immediate snapshot verified locked and immutable at 15:44 on 2026-09-03.
That is a meaningful ransomware and rollback control for one share. `homes`
alone contains 34.6 TB and, together with the other shares, remains without a
verified snapshot schedule. A same-NAS snapshot and a DSM configuration backup
must not be represented as an off-device recoverable data backup.

**Impact:** A disk event, ransomware, accidental deletion, package failure, or
major-update problem could cause material data loss with no demonstrated
recovery point.

**Remediation:**

1. Inventory critical shared folders, packages, databases, and application
   state, prioritizing `homes` and any irreplaceable media or Office content.
2. Configure a versioned Hyper Backup task to an off-device destination that
   is not continuously writable from the NAS. Keep its encryption key and
   recovery material separate.
3. Expand Snapshot Replication only after confirming capacity and workload
   impact. Preserve the current immutable `docker` schedule; do not mistake it
   for the off-device copy.
4. Confirm the latest backup job in its logs, then restore representative files
   and application state into a safe alternate location.
5. Record the recovery owner, recovery-point objective, recovery-time
   objective, encryption-key custody, and alert path.

**Close when:** a current data backup and a sampled restore are both evidenced.
Complete this before the DSM major update or runner activation.

### NAS-004 — DSM 7.4.1 remains pending after package updates completed

**Severity:** Medium

**Evidence class:** verified DSM observation

DSM 7.2.1-69057 Update 8 is installed and DSM 7.4.1-90080 is offered. Automatic
installation for updates within the current DSM version is enabled for Friday
at 05:30, but the major upgrade remains manual. Security Advisor reports DSM as
out of date.

During the verified review, Package Center's Update All completed for Active
Insight, Cloud Sync, Synology Application Service, and the Node.js v22
dependency. The Cloud Sync update explicitly included a security-vulnerability
fix. Package Center then showed no outstanding package-update list, so outdated
packages are no longer an open finding.

No CVE-to-version analysis or package-compatibility test was performed, so this
report does not claim that the installed DSM version is exploitable.

**Remediation:** First close NAS-003, read the DSM and installed-package release
notes, verify drive/volume health and application compatibility, and schedule a
local-access maintenance window. Then install the supported major update and
repeat service, backup, notification, and external-access checks. DSM major
updates are not rollback-equivalent, so the current deliberate deferral is
safer than updating before backup evidence exists.

**Close when:** the supported DSM update is installed and the post-update
service checks pass, or a dated risk acceptance documents a specific
compatibility blocker and review date.

### NAS-005 — The live runner lacks a verified DSM/LAN network-isolation policy

**Severity:** High

**Evidence class:** verified live runner state; verified baseline and branch
repository evidence; runtime enforcement remains unverified

**State:** active exposure; branch mitigation awaiting DSM deployment

The currently online runner was deployed from the baseline design. That design
attached the job container to an ordinary bridge and defined no destination
allowlist, LAN deny rule, proxy, or separate VLAN (baseline
0530f116:ops/nas-runner/compose.yaml:30-31,55-57). Its positive inbound
controls were real: it published no ports and mounted no NAS share or Docker
socket.

The branch replacement gives only `runner-egress-proxy` an uplink. Registration
and listener services join an internal bridge at fixed client addresses. At
startup their OUTPUT chain drops every direct path except TCP to the fixed proxy
address; job code receives no network capability. The proxy accepts only those
two clients, CONNECT, TLS port 443, public destinations, and an explicit
GitHub/npm/public-feed hostname list before a final deny. No proxy port is
published (ops/nas-runner/compose.yaml:4-44,82-84,105-180,182-196;
ops/nas-runner/runner-entrypoint.sh:58-70;
ops/nas-runner/runner-egress.conf:10-78). The proxy explicitly selects the
declared uplink gateway and drops capabilities before serving requests
(ops/nas-runner/proxy-entrypoint.sh:4-28). Negative topology, DNS, capability,
allowlist, and ordering assertions are at
tests/workflow-data-contract.spec.ts:286-400.

Every proposed NAS job installs and executes the repository dependency graph:

- Build MARC schedule: .github/workflows/build-marc-schedule.yml:21-39
- Data steward: .github/workflows/data-steward.yml:34-67,97-179
- Fair data steward: .github/workflows/fair-data-steward.yml:17-43
- Transit steward: .github/workflows/transit-steward.yml:27-74

GitHub warns that self-hosted runners can be persistently compromised and asks
operators to consider what sensitive services the runner can reach. The
configuration shown here does not prove that the container can reach DSM or
other LAN hosts, but it also contains no control that would stop that path.

**Impact:** Until cutover, a compromised dependency, action, or trusted-main
script may probe or attack NAS management and other LAN services from a host
that also stores media and data. Read-only repository permissions do not
restrict network activity.

**Remediation:**

1. Confirm no job is running, stop the current runner in a short maintenance
   window, and perform the fresh v2 registration/cutover in
   ops/nas-runner/README.md. Do not copy or `--replace` the old identity.
2. Before accepting work, prove direct TCP to DSM, other LAN addresses, the
   bridge gateway, and link-local addresses fails from the job context. Prove
   those targets and an unlisted public HTTPS host also fail through Squid.
   Confirm an arbitrary denied hostname creates no upstream DNS query and the
   DSM Docker/Moby engine includes the GHSA-mq39-4gv4-mvpx fix.
3. Prove GitHub listener/action/artifact, npm, and every required public feed
   still work. Review proxy logs for the exact CONNECT hosts; add no wildcard to
   make a failed pilot green.
4. Add a router-enforced destination ACL or runner VLAN when practical. The
   same-host proxy is a useful compensating control, not independence from the
   storage appliance.
5. If the branch topology cannot be built or enforced by DSM Container Manager,
   leave the runner stopped and use hosted compute or a separate low-value host.

**Close when:** the old runner is offline and a recorded v2 job-context test
proves required egress works while DSM and LAN targets are unreachable both
directly and through the proxy.

### NAS-006 — The live runner uses mutable shared runner/job storage

**Severity:** High

**Evidence class:** verified live runner state; verified baseline and branch
repository evidence; runtime behavior remains unverified

**State:** active exposure; branch mitigation awaiting DSM deployment

The live runner uses the baseline design: its root filesystem is read-only, but
the complete `/runner` directory is one writable named volume (baseline
0530f116:ops/nas-runner/compose.yaml:19-32). First boot copies the runner
installation into that volume, recursively gives the job OS user ownership,
and starts `run.sh` there (baseline
0530f116:ops/nas-runner/runner-entrypoint.sh:13-36,62-63).

The branch replacement has distinct registration and runtime image targets.
Only a no-job initializer mounts `runner-identity-v2` writable; it configures in
a disposable image overlay and copies exactly `.runner`, `.credentials`, and
`.credentials_rsaparams`. The listener's executable remains in its read-only,
checksum-verified image and mounts identity read-only. HOME, work, actions, tool
cache, npm cache, and diagnostics use a separate scratch volume that the root
bootstrap purges before each listener cycle. The listener then drops all
capability sets and invokes `Runner.Listener run --once` directly, so Docker
restart is the boundary between jobs. Static controls are asserted in
ops/nas-runner/Dockerfile:42-81,
ops/nas-runner/compose.yaml:46-103,105-180,
ops/nas-runner/runner-entrypoint.sh:22-56,73-185, and
tests/workflow-data-contract.spec.ts:198-284.

**Impact:** Code executed by one job can modify the listener, scripts, cached
packages, actions, or later worktrees and survive container recreation. This
turns a one-job compromise into persistent execution on the NAS. It also means
the reviewed runner version and checksum describe only the initial copy, not
necessarily the code that later runs.

**Remediation:**

1. Cut over only through fresh `radius-data-nas-v2` registration. Keep the old
   runner offline but registered until rollback is no longer needed; never let
   both listeners run with one identity.
2. Run two manual MARC cycles. Verify the executable and three identity hashes
   are unchanged, each scratch canary disappears, no `run-helper.sh` appears,
   and the same v2 agent reconnects after exactly one completed job.
3. From job UID 1001, prove writes fail under `/opt/actions-runner` and
   `/runner/identity` and succeed only in scratch. Remove or truncate one
   identity file in a disposable acceptance volume and prove startup fails
   closed before the listener is online.
4. Keep automatic updates disabled, rebuild within GitHub's required release
   window, and freshly register after any identity-write, authentication
   migration, stale-registration, or integrity anomaly. Never make identity
   writable to hide an upstream error.
5. Plan eventual JIT/ephemeral registration with external logs or a separate
   low-value host. The upstream listener, worker, and job share UID 1001; the
   job can still read and exfiltrate read-only runner credentials. Read-only
   identity prevents mutation, not disclosure.

**Close when:** the old mutable runner is offline and live acceptance proves a
first-job canary cannot modify executable/identity state or leave work, HOME,
action, tool, or npm-cache state visible to a second job. Credential-read risk
must remain documented until JIT registration or process isolation removes it.

### NAS-007 — The live runner's default labels bypass the custom-label allowlist

**Severity:** Medium

**Evidence class:** verified live runner state; verified baseline and branch
repository evidence; GitHub v2 label state remains unverified

**State:** active exposure; branch mitigation awaiting DSM deployment

The live baseline registration adds `radius-data` without suppressing GitHub's
default `self-hosted`, OS, and architecture labels (baseline
0530f116:ops/nas-runner/runner-entrypoint.sh:38-56). Its test inventories jobs
that contain `radius-data`, but not jobs targeting another retained label
(baseline 0530f116:tests/workflow-data-contract.spec.ts:78-137). A new workflow
can therefore reach that runner without appearing in the intended allowlist.

The branch registration adds `--no-default-labels` and accepts exactly
`radius-data`. The four reviewed jobs now request that label alone. The contract
test inventories every direct workflow job with `runs-on`, requires every
non-NAS job to equal `ubuntu-latest`, requires exactly four guarded NAS jobs,
and rejects `self-hosted`, `Linux`, and `X64` anywhere in requested labels
(ops/nas-runner/runner-entrypoint.sh:106-122;
tests/workflow-data-contract.spec.ts:78-180).

**Impact:** An accidental or insufficiently reviewed workflow can bypass the
repository's intended static allowlist and execute on the NAS. Labels route
jobs; they are not a permission boundary.

**Remediation:**

1. Stop the current runner and register v2 without default labels. In GitHub,
   verify its metadata shows only `radius-data`; if a default label appears,
   stop it before dispatching any job.
2. Keep the expanded all-workflow inventory test required. Any new direct job,
   hosted target change, matrix/dynamic runner expression, or NAS job must cause
   an explicit reviewed inventory update.
3. Protect .github/workflows and ops/nas-runner with required review/ruleset
   enforcement. The tracked CODEOWNERS file names the sole owner globally
   (.github/CODEOWNERS:1-4), but this audit did not verify that GitHub requires
   code-owner approval.
4. If the GitHub account tier supports a runner group restricted to selected
   repositories or workflows, use it as another boundary; do not substitute it
   for the no-default-label and static-test fixes.

**Close when:** GitHub shows only the custom label on v2, the old runner is
offline, the inventory test passes, and a default-label-only probe stays queued.

### NAS-008 — Guest is actively accessing `homes` over SMB

**Severity:** High

**Evidence class:** verified DSM and Log Center observation

The built-in guest row shows Status Normal. Log Center records repeated access
by `guest` to the `homes` shared folder over SMB from local clients. This
confirms active effective access; it is no longer only an account-status
inference. The audit did not retain client addresses or user identities, and it
did not establish whether the activity is intended legacy access, anonymous
mapping by an SMB client, or misuse.

**Impact:** Anonymous or weakly attributed access to a large user-data share
bypasses individual accountability and can expose or alter data according to
the guest ACL. Repeated local-source activity does not make that access safe.

**Remediation:** Before disabling access, identify the affected SMB workflow
from approved client and audit records and confirm a named replacement account
works, so a legitimate transfer is not stranded. Then disable guest, remove its
explicit and inherited `homes` permission, disconnect existing guest sessions,
and retest from the former clients. If a documented exception is unavoidable,
deny every other share/application and restrict the exact read-only path and
client network; a named account remains preferred.

**Close when:** guest is disabled and former clients use named least-privilege
accounts, or a documented exception proves the narrow effective ACL and owner.

### NAS-009 — Synology Office can use an OpenAI integration without a documented data-governance boundary

**Severity:** Medium

**Evidence class:** verified DSM observation plus explicit unknown

Synology AI Console and Tailscale are installed. AI Console has one OpenAI
integration applied to Synology Office; no Gemini integration is configured.
No credential value was viewed or retained in this report.

The audit did not establish which Office users can invoke the integration, what
document content is sent, whether prompts or responses are logged, the OpenAI
account's retention or organization settings, or what content classifications
are permitted. Installation alone is not a vulnerability, but the applied
Office integration creates a third-party data-egress path that needs an owner
and policy.

**Impact:** Users could send confidential, personal, contractual, or
credential-bearing Office content to an external processor without a documented
approval, retention, or incident-response boundary.

**Remediation:** Inventory the enabled AI features and authorized users; define
prohibited data classes; verify provider account ownership, access controls,
retention, and logging; rotate the integration credential on owner or scope
change; and test that unapproved users cannot invoke it. Disable the Office
assignment until those controls are understood if sensitive documents are in
scope.

**Close when:** the data flow, allowed content, authorized users, provider
settings, key owner, logs, and revocation procedure are documented and tested.

### NAS-010 — Password policy allows short and common passwords

**Severity:** Low

**Evidence class:** verified DSM observation

Password rules exclude the username and require mixed case and a number, which
are positive. The minimum is eight characters, common-password blocking is
off, special characters are not required, and password history is off.

The material issues are length and known-common passwords. Special-character
composition and forced periodic changes should not be treated as substitutes
for long unique passwords and 2FA.

**Remediation:** Enable common-password blocking and require a longer
passphrase baseline appropriate to users and legacy-client compatibility.
Require unique password-manager-generated credentials for administrators and
service accounts. Decide separately whether a small history prevents actual
reuse; do not force routine rotation without compromise or policy reason.

**Close when:** new passwords reject common choices and meet the documented
length baseline, and active administrators have unique credentials plus 2FA.

### NAS-011 — Spectre/Meltdown protection is disabled on a host proposed for CI work

**Severity:** Low

**Evidence class:** verified DSM observation; exploitability unknown

DSM's Spectre/Meltdown protection toggle is off. The proposed Actions runner
would execute a large Node dependency graph on the same physical appliance as
storage and media workloads. The audit did not identify the exact CPU
mitigation state, a working exploit, or the performance cost of enabling the
DSM control.

**Remediation:** Check the model/DSM release guidance and current mitigation
state, then enable the control in a maintenance window if supported. Benchmark
the storage, media, and runner workloads before and after. Network and runner
isolation remain higher-priority controls.

**Close when:** the DSM control is enabled, or a dated hardware-specific risk
acceptance records why an equivalent mitigation is present or the control is
not viable.

### NAS-012 — Alert receipt, recurring Security Advisor cadence, and remote-access policy are unverified

**Severity:** Low

**Evidence class:** partially verified DSM observation

Synology Account warning alerts were enabled and DSM reported that a test email
was sent, but receipt has not been confirmed. No push service is configured.
Security Advisor had not previously been configured; its first Work/business
scan completed on 2026-09-03 with no malware found, two system warnings, two
account settings not enabled, and three network changes. Its recurring schedule
and escalation owner were not captured.

Tailscale is installed, but tailnet ownership, MFA, ACLs, approved devices,
subnet/exit-node settings, update state, and actual use are unknown.

**Remediation:** Confirm the test email reached the intended monitored mailbox,
trigger and receive one safe warning-class test if DSM supports it, set a
documented Security Advisor cadence, and assign an owner for warning review.
Audit Tailscale before relying on it for NAS-001; remove it if unused.

**Close when:** alert delivery, review ownership, recurring scan cadence, and
the remote-access policy are evidenced.

### NAS-013 — RAID data scrubbing has never run and has no schedule

**Severity:** Medium

**Evidence class:** verified DSM observation

Storage Manager reports the system healthy, all eight HDDs healthy, and an SHR
storage pool with two-drive fault tolerance. The 42.9 TB volume has 19.9 TB
free. These are useful current-health signals, but Data Scrubbing reports Ready
and “Never performed yet,” and Storage Manager reports no task schedule.

**Impact:** RAID redundancy does not detect or repair every latent consistency
or checksum problem on its own. With no completed scrub and no schedule, the
array lacks evidence of a full periodic consistency pass. A first scrub is also
a substantial workload on a large storage pool and should not be started before
recovery evidence exists.

**Remediation:** Complete NAS-003's off-device backup and sampled restore first.
Then schedule the first data scrub in an off-hours window, monitor pool health
and service latency, and retain its completion result. Establish a recurring
cadence appropriate to Synology guidance and the media workload. Synology notes
that data scrubbing and RAID resynchronization can affect system performance;
do not run the first pass concurrently with a DSM major update or backup seed.

**Close when:** a scrub completes without unresolved storage errors and a
monitored off-hours recurring schedule is enabled.

### NAS-014 — Runner scratch has no verified storage quota

**Severity:** Medium

**Evidence class:** verified branch configuration plus deployment unknown

The branch purges `runner-scratch-v2` between listener cycles and caps CPU,
memory, PIDs, `/tmp`, and logs. The scratch named volume itself has no portable
Compose size limit (ops/nas-runner/compose.yaml:119-180,198-202). A buggy or compromised job can therefore consume Docker
storage during its one allowed job before restart cleanup. A memory-backed
`tmpfs` is not assumed safe here: the current checkout plus dependencies is
large enough that an arbitrary RAM-backed limit could trade disk exhaustion for
NAS memory pressure.

**Remediation:** Before starting v2, place the scratch volume on a dedicated
quota-backed DSM/Docker storage surface sized from two successful pilots. Prove
a bounded fill receives `ENOSPC` without consuming the host pool or affecting
DSM services. Keep identity in a different volume, and do not solve this by
binding a broad media or user-data share into the job.

**Close when:** the deployed scratch filesystem has an evidenced limit, a fill
test cannot exhaust host storage, and two real jobs still fit with headroom.

## Verified positive controls

### DSM

- Browser IP checking is retained; the compatibility option that skips IP
  checking is off.
- CSRF protection and CSP are on, DSM embedding in an iframe is blocked, saved
  sessions clear on restart, and inactivity logout is 15 minutes.
- Default admin is deactivated; one named administrator is active.
- Auto Block is on at 10 failed attempts in five minutes, with automatic
  unblock after one day.
- DoS protection is on for LAN1.
- Telnet, SSH, and SNMP are off.
- HTTP-to-HTTPS redirect is on and the web server returned after the change.
- TLS uses the intermediate profile and old backward compatibility is off.
- The observed QuickConnect and default Synology certificates were not expired:
  their observed expiries were 2026-10-24 and 2027-05-04 respectively. Service
  assignment and hostname trust remain unverified.
- Automatic encrypted DSM configuration backup is on and has a recent success.
- Storage Manager reports the system and all eight HDDs healthy. The SHR pool
  has two-drive fault tolerance; the 42.9 TB volume has 19.9 TB free.
- Hyper Backup 4.1.2 and Snapshot Replication with Replication Service are
  installed. The `docker` share has a daily snapshot schedule, retains the
  latest 30, and has seven-day immutability; one immediate locked immutable
  snapshot was verified. These do not replace an off-device backup.
- Eastern Time is configured and NTP synchronization to `time.google.com`
  reports Normal. Scheduled-task displays changed from their earlier local
  times accordingly; future maintenance records should use the verified zone.
- SSD Cache Advisor was already running from 2026-09-01; no new start was
  required during this review.
- Synology Account warning alerts are on and DSM accepted the test-email send.
- The first Work/business Security Advisor scan completed and reported no
  malware.
- Package Center completed its offered updates and showed no remaining update
  list.
- QuickConnect relay is off and no DDNS configuration was observed.

### Repository and workflow design

- The branch proxy/listener design publishes no port and uses no host network,
  privileged mode, Docker socket, or NAS-share bind mount.
- The listener uses a read-only root, read-only identity volume,
  no-new-privileges, capability drop, PID/resource limits, and capped logs.
  Every startup capability is removed before untrusted job code runs.
- The listener is attached only to an internal bridge. Its kernel OUTPUT policy
  permits only the fixed proxy, while the proxy applies public-address, method,
  port, and hostname restrictions. The explicit uplink route prevents Docker's
  dual-network default-gateway choice from stranding or bypassing the proxy.
- Registration has a separate image target and is the only service that mounts
  identity writable. It does not mount listener scratch. The token is absent
  from the listener, and an incomplete identity fails closed.
- The runner archive is pinned to 2.337.0 and verified by exact Linux x64
  SHA-256 before extraction. The listener invokes that immutable binary with
  `run --once`; `--disableupdate` prevents in-volume auto-update.
- Exactly four tracked jobs request only `radius-data`. Each is schedule/manual
  only, guards trusted main, grants read-only contents access, checks out the
  exact triggering SHA, and disables persisted checkout credentials.
- No repository secret reference occurs in those four NAS jobs. Data steward
  passes only the browser-safe Supabase repository variables
  (.github/workflows/data-steward.yml:69-111).
- Every external action reference is covered by a full-SHA pin test
  (tests/workflow-data-contract.spec.ts:56-76).
- The contract test inventories every direct `runs-on` job across all workflow
  files, requires every non-NAS target to remain exactly `ubuntu-latest`, and
  rejects every requested default self-hosted label.
- Repository mutation stays on a GitHub-hosted reusable publisher with
  write-scoped permission only there
  (.github/workflows/publish-automated-pr.yml:1-6,49-63). It checks out a clean
  revision, rejects symbolic links and non-allowlisted paths, caps artifact
  sizes, parses JSON, and rejects unexpected worktree changes
  (.github/workflows/publish-automated-pr.yml:169-233). It also rechecks main
  before publication and limits the created PR to the allowed paths
  (.github/workflows/publish-automated-pr.yml:235-354).
- The check dispatcher runs on GitHub-hosted infrastructure, does not check out
  or execute repository code, maps bot branches to exact allowed paths, and
  binds dispatch to the exact head SHA
  (.github/workflows/automated-pr-checks.yml:1-10,24-34,42-130).

## Tracked NAS runner and workflow inventory

| File | Security-relevant purpose | Key lines |
| --- | --- | --- |
| ops/nas-runner/compose.yaml | Split registration/runtime services, mounts, internal/proxy networks, capabilities, resources | 4-202 |
| ops/nas-runner/Dockerfile | Verified runner install and separate registration/runtime targets | 3-81 |
| ops/nas-runner/Dockerfile.proxy | Minimal read-only Squid image and parse-time policy check | 3-29 |
| ops/nas-runner/runner-entrypoint.sh | Scratch reset, OUTPUT policy, capability drop, fresh identity, one-job listener | 21-185 |
| ops/nas-runner/proxy-entrypoint.sh | Explicit uplink route and proxy privilege drop | 4-28 |
| ops/nas-runner/runner-egress.conf | CONNECT/443, public-address and hostname allowlist policy | 10-79 |
| ops/nas-runner/.env.example | Fresh-registration token and v2 volume contract | 1-7 |
| ops/nas-runner/.dockerignore | Secret/state/log build-context exclusions | 1-3 |
| ops/nas-runner/README.md | Active-runner warning, fresh migration, runtime acceptance, recovery and residual risk | 1-242 |
| .github/workflows/build-marc-schedule.yml | Monthly keyless MARC generator and hosted publish handoff | 9-83 |
| .github/workflows/data-steward.yml | Nightly browser-safe Supabase materializer and hosted publish handoff | 16-317 |
| .github/workflows/fair-data-steward.yml | Review-only Fair candidate collector | 6-52 |
| .github/workflows/transit-steward.yml | Public GTFS generator and hosted publish handoff | 13-138 |
| .github/workflows/publish-automated-pr.yml | Hosted credentialed artifact validator and PR publisher | 1-373 |
| .github/workflows/automated-pr-checks.yml | Hosted exact-branch/SHA/path check dispatcher | 1-179 |
| tests/workflow-data-contract.spec.ts | Action pins, complete runner-target inventory, mounts/flags/network policy, CPU/RAM caps | 56-400 |
| docs/CONTROL_PLANE.md | Corrected live state and v2 acceptance boundary | 26-44 |
| .github/CODEOWNERS | Global sole-owner assignment; enforcement not proved by file | 1-4 |

## Important unknowns

These are questions, not claims that a control is absent:

- Is the Synology Drive router mapping reachable from an untrusted external
  network, and which users still require it?
- Is DSM Account Protection enabled, and what are its trusted/untrusted-client
  thresholds?
- Are any QuickConnect permissions broader than required?
- What are Tailscale's tailnet owner, MFA, ACL, device approval, route, and
  update settings?
- Which approved client workflow is using guest SMB access, and what are the
  guest account's complete inherited/effective share and application rights?
- Which certificate is assigned to each externally reachable service, and do
  clients use a matching hostname?
- What off-device Hyper Backup destination, version retention, monitoring,
  encryption-key custody, and sampled restore will protect the data?
- Which shares besides `docker` need snapshots, and what capacity-safe schedule
  protects `homes` and other critical content?
- Are encrypted volumes, shared-folder encryption, SMART test schedules, UPS
  shutdown, and recovery-key custody configured?
- Is the current DSM administrator password unique and stored in a password
  manager?
- Is the router mapping manual, UPnP-created, or managed by DSM, and can it
  reappear after removal?
- What caused each Security Advisor system/account/network result, and which
  remain after the completed remediations?
- Does the deployed v2 runner match the branch image digest, carry only
  `radius-data`, omit its registration token, preserve immutable identity, and
  purge scratch across two complete jobs?
- Does v2 lack Docker socket/share visibility and fail to reach DSM/LAN targets
  both directly and through its proxy at runtime?
- Can DSM enforce a quota on the v2 scratch storage without exposing a NAS
  user-data share or exhausting the runner's memory cgroup?
- What Office content can reach the OpenAI integration, under which user,
  provider, retention, and logging controls?

## Lockout-safe remediation order

1. **Preserve access and stop new runner exposure.** Confirm physical/local
   recovery, the current NTP state, a still-open administrator session, and no
   runner job in progress. Stop the live runner container while it is idle;
   leave its GitHub registration intact for rollback. Queued jobs can wait. Do
   not reuse or copy its credential.
2. **Confirm alerts and identify dependencies.** Confirm receipt of the warning
   email. Identify the intended SMB clients behind active guest access, active
   Drive clients, backup destinations, Office AI users, and every remote path.
3. **Replace guest access with named access.** Prove a least-privilege named SMB
   account works for each legitimate client, then disable guest, remove its
   effective `homes` access, terminate guest sessions, and retest. Do not cut
   off an unexplained active workflow without a recovery path.
4. **Protect the named administrator.** With the first session still open,
   enroll and test 2FA and recovery from a second browser, then enforce 2FA for
   administrators. Review Account Protection and trusted-device policy. Keep
   Auto Block's one-day expiry while validating access.
5. **Reduce direct exposure and stage the DSM firewall.** Move required remote
   Drive use to a reviewed private path where practical and remove the router
   mapping if unneeded. Build explicit local-administration and required-service
   allow rules before default deny. Test from a second local client and an
   authorized external network before ending the first session.
6. **Prove data recovery.** Configure a versioned off-device Hyper Backup task,
   verify monitoring and key custody, and complete a sampled restore. Keep the
   verified immutable `docker` snapshot schedule, then plan snapshots for
   `homes` and other critical shares with capacity monitoring.
7. **Establish storage maintenance.** After backup/restore evidence, run the
   first data scrub off-hours and retain its result. Do not overlap the initial
   backup seed, first scrub, and DSM upgrade.
8. **Upgrade DSM deliberately.** Review release notes and package compatibility,
   take a local-access maintenance window, install the supported DSM update,
   and repeat service, storage, backup, notification, and external-access
   checks.
9. **Deploy the hardened runner only if still justified.** Build this exact
   reviewed commit, configure a quota-backed scratch surface, and freshly
   register `radius-data-nas-v2` with a short-lived repository token. Keep the
   old container stopped and its registration available; never run both with a
   shared identity.
10. **Accept two cycles, then retire v1.** Blank the token and recreate the
    project. Verify only the custom label, exact image/version, network denials,
    proxy allowlist, identity/root immutability, bounded scratch, accurate
    health failure, two-cycle cleanup, and hosted publisher. Only then remove
    the old GitHub registration and retire its sensitive state volume.
11. **Finish lower-priority governance.** Strengthen password length and
    common-password policy, document the Office/OpenAI boundary, audit
    Tailscale, and establish Security Advisor/alert ownership. Consider HSTS
    only after every administrative path uses a stable certificate-valid
    hostname and tested recovery.

## Runner activation gate

Activation is acceptable only when all of the following have evidence:

- NAS-001, NAS-002, NAS-003, NAS-005, NAS-006, NAS-007, NAS-008, and NAS-014
  are closed or have an explicit owner-approved time-bounded risk acceptance.
- Exactly one repository runner is online and carries only the intended
  non-default routing label.
- Required GitHub/feed egress works; DSM and other LAN services are unreachable
  from the job context.
- The first job cannot leave executable, cache, credential, or worktree state
  visible to the second.
- Scratch cannot exhaust host storage, and a listener failure makes the
  container unhealthy before restart.
- The four approved generator jobs remain the only matchable jobs, and a
  deliberate unapproved/default-label test stays queued.
- The registration token is absent after first start.
- The runner has no Docker socket, privileged mode, host network, published
  port, or NAS share.
- The manual MARC job hands only the exact artifact to the hosted publisher;
  repository write credentials never enter the NAS job.
- Restart, alert, log, cleanup, de-registration, and incident-rebuild procedures
  have named owners.

If those conditions are more operationally expensive than the workload
justifies, the safer release decision is to keep using hosted compute or a
separate low-value runner host.

## Official references

- [Synology: enhance NAS security](https://kb.synology.com/en-us/DSM/tutorial/How_to_add_extra_security_to_your_Synology_NAS)
- [Synology: DSM account security, 2FA, Adaptive MFA, and Account Protection](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/connection_security_account?version=7)
- [Synology: DSM firewall](https://kb.synology.com/DSM/help/DSM/AdminCenter/connection_security_firewall)
- [Synology: DSM system update](https://kb.synology.com/en-us/DSM/help/DSM/AdminCenter/system_dsmupdate?version=7)
- [Synology: notification email](https://kb.synology.com/en-af/DSM/help/DSM/AdminCenter/system_notification_email?version=7)
- [Synology: external access quick start](https://kb.synology.com/en-eu/DSM/tutorial/Quick_Start_External_Access)
- [Synology: back up a NAS](https://kb.synology.com/en-global/DSM/help/DSM/Tutorial/backup_backup)
- [Synology: data scrubbing](https://kb.synology.com/en-us/DSM/help/DSM/StorageManager/storage_pool_data_scrubbing?version=7)
- [Synology: RAID resynchronization speed and performance](https://kb.synology.com/en-sg/DSM/help/DSM/StorageManager/storage_pool_adjust_resync_speed?version=7)
- [GitHub: secure use of Actions and self-hosted runners](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub: self-hosted runner software updates](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [GitHub: self-hosted runner labels and no-default-labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)
- [GitHub Actions runner 2.337.0 source](https://github.com/actions/runner/tree/v2.337.0)
- [Moby: internal-network DNS forwarding advisory](https://github.com/moby/moby/security/advisories/GHSA-mq39-4gv4-mvpx)
- [Squid: ACL configuration reference](https://www.squid-cache.org/Doc/config/acl/)
- [Node.js: enterprise network proxy configuration](https://nodejs.org/en/learn/http/enterprise-network-configuration)

## Recommended reassessment

Re-run this audit after the DSM firewall, administrator 2FA, guest migration,
off-device backup restore, first data scrub, DSM major update, Tailscale/AI
Console review, and hardened-runner migration are complete. Capture live
evidence for every activation item rather than treating tracked intent as
deployed proof.
