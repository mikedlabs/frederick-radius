# Agent commands

These are the judgment tasks in the data pipeline. Plain code in
`pipeline/` runs the daily routine. An agent runs the three commands
below. None of them activate a source on their own. A human promotes a
source to `active` in `data/sources.yaml` after review.

Each command states what it reads, what it produces, and an example.

## audit-sources

Purpose. Find data source references that landed in the app code but
never made it into `data/sources.yaml`, so the manifest stays the true
inventory.

Input contract.
- The repository working tree.
- The current `data/sources.yaml`.

What it does.
- Scans `src/lib/integrations/`, `src/lib/ingest/`, `src/app/api/`, and
  `scripts/` for fetch calls, URL constants, and environment variables.
- Compares the discovered endpoints against the manifest by URL host
  and id.
- Lists endpoints in code that are missing from the manifest, and
  manifest rows whose code reference appears to be gone.

Output contract.
- A pull request that adds the missing sources to `data/sources.yaml`
  with `status: scaffold` and a note describing where each was found.
- A short diff summary in the pull request body. No source is set to
  `active`.

Example invocation.
- "Run audit-sources. Open a PR with any source references in code that
  are not yet in data/sources.yaml."

## discover-sources

Purpose. Propose new candidate sources from a fixed priority list, for
human review.

Input contract.
- The current `data/sources.yaml`.
- Priority list: Frederick County ArcGIS Hub, Maryland iMAP, US Census
  ACS, NWS API, AirNow, USGS Water Services, FEMA flood maps,
  OpenStreetMap via Overpass.

What it does.
- For each candidate not already in the manifest, gathers name, URL,
  format, refresh cadence, license, and a one paragraph fit
  justification.

Output contract.
- A pull request that adds each candidate to `data/sources.yaml` with
  `status: pending_approval` and the gathered fields filled in.
- Never sets a source to `active`. Human approval is required, and the
  reviewer flips the status by hand.

Example invocation.
- "Run discover-sources. Propose candidates from the priority list as
  pending_approval entries in a PR."

## diagnose-failure

Purpose. Given a failing source from the daily Action, find the drift
and propose a fix.

Input contract.
- A source id.
- The most recent raw snapshot for that source under
  `data/raw/{id}/{date}.json`.
- That source's current JSON Schema in `schemas/` and Zod validator in
  `pipeline/schemas_ts/`, if they exist.

What it does.
- Compares the current raw response against the schema.
- Identifies the exact fields that drifted: renamed, retyped, removed,
  or newly required.
- Decides whether the correct fix is a schema update or a transform
  update, and prepares that change.

Output contract.
- A pull request that updates either the schema and Zod validator or
  the transform for that one source.
- The pull request body includes the field level diff and a one line
  statement of the root cause. The source stays at its current status
  until a human confirms the fix.

Example invocation.
- "Run diagnose-failure for mdot_chart using the latest raw snapshot.
  Open a PR with the schema or transform fix and the field diff."
