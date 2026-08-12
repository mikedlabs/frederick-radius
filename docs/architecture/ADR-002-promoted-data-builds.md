# ADR 002: Promoted data builds

- Status: Accepted
- Date: 2026-08-12
- Owners: Frederick Radius product and engineering

## Context

Application deployment previously regenerated the source registry and public
place projection before Next.js compiled the product. Static event and map
routes could also contact current publisher feeds and the optional database.
That coupled an unrelated interface release to ingestion availability and made
the exact data shipped by a deployment difficult to identify.

Radius already has a safer promotion mechanism: scheduled or manually approved
workflows materialize committed JSON snapshots, run their domain gates, and
open allowlisted review pull requests. This decision extends that boundary
instead of adding a second data platform.

## Decision

1. `src/data/data-release.json` records the digest, byte count, record count,
   and promotion time for the existing snapshot streams: basemap, places,
   sources, transit, and venue events.
   The places stream covers both published client projections and every static
   server input used to compose place detail facts: the curated TypeScript
   spine, imported catalogs, enrichment and override snapshots, policy lists,
   business information, field notes, and local page-context records. Static
   TypeScript data modules are byte-hashed with no invented record count.
2. Each stream remains independently refreshable. Its existing workflow runs
   quality checks, refreshes only that stream's release entry, and sends the
   artifacts plus manifest through the same review PR.
3. An application build validates every protected artifact before compilation.
   It never regenerates the source registry or public place projection.
4. The build launcher computes one deterministic aggregate data version from
   the protected artifact digests and exposes it as build metadata.
5. The county PMTiles extract, glyphs, and sprites are committed promoted
   artifacts with their own digest manifest. Builds verify them locally and
   never invoke the separate candidate-materialization command.
6. During compilation, application `fetch` calls fail closed and optional
   database clients remain unavailable. A new static route therefore cannot
   quietly restore a live publisher dependency.
7. Static event rendering uses reviewed curated events plus the committed venue
   event snapshot. Runtime refreshes continue to use the full unified event
   assembly and its existing cache, source-health, and archive paths.

## Promotion contract

Generated data is a candidate until its domain checks pass and the matching
release stream is refreshed. Any later byte-level change without a release
update fails the application build with the artifact and stream named. The
aggregate data version changes only when protected data changes; promotion
timestamps alone do not create a new version.

## Consequences

- A failed publisher or optional database query cannot block compilation.
- UI releases consume the last reviewed snapshots and have a traceable data
  version even when ingestion is unhealthy.
- Failed ingestion leaves the active committed data untouched.
- Build-time event pages honestly carry a degraded source-health marker until
  their normal runtime regeneration incorporates live feeds.
- Concurrent place, transit, and event refreshes can update separate manifest
  sections without sharing credentials or generator worktrees.

Tracking the approximately 30 MB county extract is a deliberate repository-size
tradeoff: it prevents both a blank map and an external dependency at build
time. A future immutable artifact host may replace the repository copy only
after its availability, Range behavior, digest verification, and rollback path
are proven independently.
