# Repository cleanup plan

Frederick Radius is close to its tracked-size ceiling and has accumulated
generated data, deployable media, local build output, and many old worktrees.
They are different problems and must not be removed with one broad cleanup
command.

## Safety boundary

- Never use `git clean`, a hard reset, or a history rewrite as routine cleanup.
- Untracked release files must be classified before removal. The current
  release's original untracked files are referenced source, tests, migrations,
  or generated runtime artifacts; they are not disposable cache.
- Dirty worktrees belong to active work. Do not remove them.
- Production database retention requires a current backup and an explicit
  operator action. It is not a repository cleanup step.
- Each phase below gets its own pull request, validation, and rollback point.

## Current measured state

- Tracked working tree: about 228.6 MB of the 235 MB hard ceiling.
- Non-runtime brand, poster, social, and handoff exports under `public/`: about
  33 MB that can be moved without changing the product once references are
  verified.
- Local ignored output includes several gigabytes of `.next`, test, and build
  caches. These do not affect Git or Vercel deployment size, but they consume
  disk on development machines.
- Generated provider snapshots are the main source of Git-history growth.
- There are many linked worktrees. Clean worktrees can be retired only after
  their branches and unique commits are inventoried; dirty worktrees stay.

## Immediate release recovery

Do not begin the structural phases below inside the current release. First,
restore one predictable path from reviewed code to production:

1. Freeze feature work. Classify the mixed working tree and commit one concern
   at a time. Never commit every dirty file merely to make the tree look clean.
2. Ship the paid-usage limits and automation ownership changes before another
   design or data expansion. These changes stop duplicate builds, duplicate
   collectors, and unbounded provider work.
3. Keep the global photo-artifact removal out of that release. It removes the
   current Google-backed photos, venue credits, and photo-derived colors. That
   is a separate policy and visual decision requiring owned-media fallbacks and
   screenshot review.
4. Restore GitHub Actions billing, then require `verify` and `style-lint` to
   pass for the exact candidate SHA. Local Node 25 results do not replace the
   repository's Node 22/npm 10 release contract.
5. Let Vercel build the merged `main` revision once. Verify Today, Map, Events,
   Ask, Saved, `/api/health`, and the apex SHA. Do not manually redeploy the
   same revision.

Until that release is live, do not delete Supabase rows, enable Mapbox Search
Box, rewrite Git history, move public assets, or start another broad UI pass.
Those actions solve different problems and each needs its own evidence and
rollback point.

## Phase 1: low-risk source cleanup

1. Remove modules only after zero-import proof and focused tests.
2. Remove dependencies only after a lockfile-safe install and a complete build.
3. Keep `test:all` authoritative for helper and public-hub tests.
4. Create one documentation index and archive stale duplicate operating notes.
5. Keep the repository-size gate fixed; do not raise it to make a failure go
   away.

Candidate modules and dependencies remain hypotheses until a dedicated change
proves they are unused. No removal is approved by this document alone.

## Phase 2: stop deploying design archives

1. Inventory runtime references to every file under `public/brand`.
2. Keep the small runtime subset in `public`.
3. Move source exports and handoff copies to the existing shared design archive
   or object storage.
4. Add a test that blocks non-runtime export formats from returning to
   `public`.

Expected result: regain roughly 33 MB of tracked and deployment headroom
without changing the live brand.

## Phase 3: stop versioning provider snapshots as application source

1. Assign each dataset one canonical source, one collector, and one public
   read model.
2. Store raw observations and large snapshots in Supabase or object storage.
3. Commit only a small version manifest or bounded deployable projection.
4. Teach loaders to use the versioned store with a known-good fallback.
5. Migrate one dataset at a time; events and place-derived artifacts should not
   move in the same release.

This is the durable fix for repository growth. Deleting current JSON without
the loader migration would break production.

## Phase 4: reduce build multiplication

1. Review the large static place-page expansion and measure whether all slugs
   need build-time generation.
2. Keep important pages server-rendered and indexable while moving the long
   tail to bounded revalidation where evidence supports it.
3. Compare build time, output size, crawler output, and request cost before and
   after. Do not trade discoverability for a smaller build without measuring
   both.

## Phase 5: local workspace retirement

1. List every worktree, branch, upstream, last commit, dirty state, and unique
   commit count.
2. Present clean retirement candidates for approval.
3. Remove only approved clean worktrees through Git's worktree command.
4. Prune ordinary caches after confirming no active dev server or test run owns
   them.

## Destructive history migration

A Git-history rewrite is optional and last. It requires a verified bundle or
mirror backup, a contributor cutover, rewritten branch protections, and an
explicit approval. The preventive changes above deliver most of the ongoing
value without that risk.
