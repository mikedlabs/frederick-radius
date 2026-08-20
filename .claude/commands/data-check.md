---
description: Is the county data currently correct and fresh? Runs the tripwires and checks the steward pipeline.
---

Answer one question: **can the app truthfully tell someone what is open right
now, and is the rest of the data inside its own freshness windows?**

This exists because on 2026-08-18 every open/closed claim in the app was dark
for days and nothing surfaced it: the bot PR that refreshes hours had been open
and unmerged for two weeks, while the daily workflow showed red for an unrelated
`transit` job that made it look like the hours job was broken.

Pre-computed:

- Steward PR: !`gh pr list --state open --search "steward in:title" --json number,title,updatedAt --limit 5 2>/dev/null`
- Recent steward runs: !`gh run list --workflow=data-steward.yml --limit 6 --json conclusion,createdAt 2>/dev/null`
- Hours artifact last committed: !`git log --format='%ad %h %s' --date=short -1 -- src/data/places-client-hours.json`

Then measure, do not assume:

1. **The tripwire board.** Run `curatedFreshnessAnomalies()` from
   `src/lib/quality/curated-freshness.ts` for today's verdict. It is prescriptive
   — read its `detail` text, it names the remedy.

2. **Can any place assert an open state?** Import `clientPlaces()` and count how
   many have `open_status.state` other than `"unknown"`. Zero means the app is
   blind county-wide. Cross-check the newest `hours_updated_at` in
   `src/data/places-client-hours.json` against `HOURS_MAX_AGE_DAYS` (7) in
   `src/lib/hours-freshness.ts`.

3. **If hours are dark, find WHICH link broke** — the chain is:
   cron `/api/cron/hours-refresh` (daily 08:00 UTC, needs `HOURS_REFRESH_CRON=1`,
   a Google key, a DB, and migration 0024) → the `place_hours_refresh` table →
   the `data-steward` workflow (daily 09:17 UTC) → the `bot/data-steward` PR →
   **a human merging it** → deploy.
   The merge is the only manual link, and it is the one that has failed before.
   Check the open steward PR's own copy of `places-client-hours.json` before
   concluding the pipeline is broken — if its newest timestamp is fresh, the
   data is fine and merging is the whole fix.
   Note the bucket math is sound and not the suspect: `HOURS_REFRESH_CYCLE_DAYS`
   is 6 with a `BATCH_CAP` of 400, and the largest real bucket is 286.

4. **Answer quality:** `npm run eval:coverage` and `npm run eval:ask`.

Report: a plain verdict on whether the app can answer "what's open now", the
tripwire list, and — for anything red — whether the fix is code, a merge, or
owner/ops access (env vars, DB, cron). Do not merge anything yourself.
