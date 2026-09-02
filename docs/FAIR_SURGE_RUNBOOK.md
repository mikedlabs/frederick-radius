# Fair Day local surge runbook

This harness measures the Fair page on the same machine that runs it. It is a
bounded application-origin check, not a public traffic generator and not a
substitute for Vercel production monitoring.

## Safety boundary

- The target must be `localhost`, `127.0.0.0/8`, or IPv6 `::1`. DNS results for
  `localhost` are pinned only after every answer is confirmed as loopback.
- Frederick Radius, Vercel, Etix, EventHub, LAN, NAS, wildcard, and other public
  or remote hostnames are refused. On the NAS, run the app and this command in
  the same isolated job and still target `127.0.0.1`.
- The harness issues `GET` only. It sends no credentials or cookies, follows no
  redirects, uses no query strings, and never opens ticket or floorplan links.
- Stages are fixed at 100, 500, and 1,000 one-shot page requests with maximum
  concurrency of 10, 25, and 50. One run can never exceed 1,613 requests,
  including HTML and critical-resource preflight checks.
- A failed status, content type, stable marker hash, reviewed Fair pack, critical
  resource, p95/p99 budget, 100-to-1,000-user latency regression, or stage
  deadline stops all higher stages. Local HTML must remain at or below 250 ms
  p95 and 500 ms p99, and the 1,000-user p95 cannot exceed twice the 100-user
  baseline.

## Run it

Build and serve the production application on loopback in one terminal:

```sh
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

Review the immutable plan without sending a request:

```sh
npm run perf:fair:surge -- --dry-run
```

Use the 100-user stage as the first host check:

```sh
npm run perf:fair:surge -- --through 100
```

After that evidence passes and the host has healthy CPU, memory, temperature,
and disk latency, run the full fail-fast sequence:

```sh
npm run perf:fair:surge
```

JSON and Markdown evidence is written under
`.perf/fair-surge/<timestamp>/`. The folder is ignored by Git. Preserve the
evidence outside the runner before an ephemeral job is removed.

After the isolated `radius-browser` NAS runner is accepted, an owner can run
the manual **Fair loopback surge gate** workflow from `main`. It builds and
serves the same revision inside one job, targets only `127.0.0.1`, uploads the
bounded evidence for seven days, and always stops the local server. It has no
schedule, secrets, pull-request trigger, or public load-test target.

## Read the result

The result proves that one local application instance returned stable reviewed
Fair HTML under the stated request envelope. Compare p50, p95, p99, throughput,
CPU, memory, temperature, and request failures across runs. Keep operational
headroom instead of treating a single maximum pass as the normal load target.

Public Fair traffic should continue to terminate at Vercel CDN/ISR. Do not
expose the NAS or this harness as a public origin. Validate the production
deployment separately with the Fair release smoke checks and normal Vercel
observability.
