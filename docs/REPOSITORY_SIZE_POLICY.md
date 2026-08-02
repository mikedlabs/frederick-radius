# Repository size policy

Issue #1473 identified continued Git-history growth from provider snapshots,
review artifacts, and exported campaign assets. The preventive gate is:

```sh
npm run audit:repo-size
```

CI runs the same command. It examines only Git-tracked working-tree files, so
local build output, `.next`, screenshots, and other ignored files do not affect
the result. It does not delete files, use Git LFS, or rewrite history.

## Budgets

- An ordinary tracked file may not exceed 1 MiB.
- The complete tracked working tree may not exceed 200,000,000 bytes.
- Every existing file above 1 MiB is listed explicitly in
  `config/repository-size-budget.json` with a classification, provenance,
  per-file cap, deployment status, and regeneration command when one exists.
- Each exception category also has a combined cap. This prevents several
  allowlisted files from growing together while remaining under their
  individual limits.

The four classifications are:

| Classification | Meaning |
| --- | --- |
| `source-of-truth` | An approved input that cannot truthfully be regenerated from another tracked artifact. |
| `deployment-required-snapshot` | A generated or optimized snapshot that production currently imports or serves. |
| `generated-artifact` | A reproducible review or pipeline output that is not required at runtime. |
| `design-archive` | A reproducible marketing or handoff export retained temporarily in the repository. |

The policy deliberately classifies only oversized exceptions. Smaller source,
code, and asset files remain subject to the default and total budgets without
creating a maintenance registry for every tracked path.

## Responding to a failure

Do not automatically increase a budget.

1. For a new oversized file, prefer Supabase or Blob for production data and
   short-lived GitHub artifacts for reports, screenshots, and review exports.
2. For an existing exception that grew, regenerate a slimmer form, split the
   data behind a server loader, or move the artifact out of Git.
3. Add or raise an exception only when the file must remain tracked. The same
   change must state its provenance, truthful regeneration command, runtime
   requirement, and narrowly sized cap.
4. If an exception falls below 1 MiB or is removed, delete its policy entry in
   the same change. Stale allowances fail the gate.

Some regeneration commands use paid providers or an external owned-photo
source. The policy records those commands for provenance; the size audit never
runs them.

## History migration boundary

This check stops future growth. Removing existing objects from Git history is a
separate destructive migration. It requires a verified backup, explicit owner
approval, a contributor cutover plan, and its own issue or pull request. Do not
run a history rewrite as part of routine size-budget maintenance.
