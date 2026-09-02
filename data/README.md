# Data pipeline

This directory holds the data source manifest and, on the
`data-snapshots` branch, the raw and cleaned data the pipeline produces.

The split is deliberate. Plain code in `pipeline/` can fetch, validate, and
transform an operator-requested snapshot. The agent commands in `AGENTS.md` at
the repo root do the judgment work of adding and repairing sources. The
app itself is not yet wired to read this directory; it still reads
`src/data/`. Rewiring the app to consume `data/clean/` is a separate,
later, reviewed change. The GitHub snapshot refresh and freshness check are
therefore manual-only; scheduling data that production does not read wastes
runner time and creates a second freshness story.

## Files

- `data/sources.yaml` is the single source of truth. Every source the
  app uses or may use has a row. The worker only fetches rows with
  `status: active`.
- `schemas/{id}.json` is the JSON Schema for a source response.
- `pipeline/schemas_ts/{id}.ts` is the matching Zod runtime validator.
- `transforms/{id}.ts` is a deterministic function from raw response to
  normalized output.
- `data/raw/{id}/{date}.json` is the stored raw response. It lives on
  the `data-snapshots` branch only.
- `data/clean/{id}.geojson` or `.json` is the normalized output. It
  also lives on the `data-snapshots` branch only.

## How to add a source manually

1. Add a row to `data/sources.yaml`. Start with `status: scaffold` so
   the worker does not run it yet.
2. Create `schemas/{id}.json` describing the response you expect. Keep
   it strict on the fields the transform reads and lenient elsewhere.
3. Create `pipeline/schemas_ts/{id}.ts` exporting `schema`, a Zod
   validator that mirrors the JSON Schema.
4. Create `transforms/{id}.ts` exporting `transform(raw)`. It must be
   pure: no network, no model calls, no randomness. Return
   `{ format: "geojson", data }` for spatial data or
   `{ format: "json", data }` for tabular data. Use the helpers in
   `pipeline/lib/normalize.ts` so coordinates, dates, and addresses
   follow the same rules everywhere.
5. Run the worker locally and confirm the source produces clean output.
6. Change `status` to `active`. Run the snapshot workflow intentionally after
   review; it is not scheduled while production remains disconnected.

## How to run the discovery command

Ask an agent to run `discover-sources`, defined in `AGENTS.md`. It
proposes candidates from the priority list as `pending_approval` rows
in a pull request. It never activates a source. A reviewer flips the
status by hand after checking the license and fit.

## How to debug a failed fetch

1. Read the issue the operator-run Action opened. It includes the tail of the
   worker log with the failing source ids.
2. Look at the latest raw snapshot on the `data-snapshots` branch under
   `data/raw/{id}/`. It is saved before validation, so a validation
   failure still leaves the real response to inspect.
3. Run `diagnose-failure` for that source, defined in `AGENTS.md`. It
   compares the raw response against the schema, finds the drift, and
   opens a pull request that fixes either the schema or the transform.
4. To reproduce locally, run `npm run pipeline:fetch`. The worker
   writes raw and clean output and prints the validation diff for any
   source that failed.

## How the snapshot branch works

An intentional workflow run commits `data/raw/`, `data/clean/`, and the updated
`data/sources.yaml` to a branch named `data-snapshots`, force pushed
each run. This keeps the `main` branch history small while still giving
one place to find the most recent data. `data/raw/` and `data/clean/`
are in `.gitignore` so they never land on `main` by accident.

## Where to find the latest clean data

On the `data-snapshots` branch, under `data/clean/`. Each active source
writes one file there, named by its id, GeoJSON for spatial data and
JSON for tabular data.

## Commands

- `npm run pipeline:fetch` runs the snapshot worker once.
- `npm run pipeline:freshness` checks that active sources are updating
  as often as their `refresh_cadence` claims.
