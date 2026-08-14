# ADR 003: Source-to-surface data contract

- Status: Accepted
- Date: 2026-08-14
- Owners: Frederick Radius product and engineering

## Context

Radius has deterministic feeds, scheduled collectors, provider-assisted source
discovery, reviewed snapshots, and runtime archives. Those capabilities do not
prove that a user can see the resulting information. A collector can succeed
while its review pull request remains open, an archive worker can finish while
the public read fails, and a discovery provider can identify a useful page
without establishing reuse rights or extracting verified facts.

The product's trust promise requires a single operational definition of data
success. Configuration, reachability, collection, normalization, acceptance,
publication, and a successful public read are separate facts.

## Decision

1. Radius treats every data source as a source-to-surface lifecycle:
   configured, fetched, parsed, normalized, accepted, published, and publicly
   returned.
2. A source is end-to-end healthy only when current evidence exists through
   the public-read stage. A heartbeat or HTTP 200 cannot stand in for that
   proof.
3. Deterministic first-party feeds may use tested automated promotion.
   Search results, rendered-page changes, model extractions, and social signals
   remain review-only until an owner verifies the original source and creates
   an authorized adapter or data correction.
4. Runtime surfaces read durable last-known-good snapshots. A failed refresh
   preserves the last valid data and exposes degraded source health. A small
   fallback response must not replace a healthy shared cache.
5. Public acceptance checks cover volume, source diversity, archive state,
   freshness, and known-record continuity. They run separately from deployment
   integrity so a provider outage cannot roll back healthy application code.
6. Approved provider candidates produce a deterministic implementation handoff
   with source evidence and acceptance checks. Marking a candidate reviewed is
   not publication.
7. Scheduled data pull requests are replaceable candidates. A newer candidate
   may supersede an older one only after its required checks pass. Account-level
   GitHub failures are tracked separately from failures inside Radius code.

## Options considered

### Treat every configured provider as active

This is simple, but it confuses credentials and adapter code with current user
value. It is the failure mode this decision removes.

### Allow provider discoveries to publish automatically

This improves apparent coverage but permits snippets, model claims, ambiguous
rights, and stale social changes to become product truth. Radius rejects that
trade-off.

### Keep reviewed promotion with end-to-end evidence

This adds operational work, but it preserves source transparency while making
collection-to-publication failures visible and actionable. Radius adopts this
option.

## Consequences

- Adding another provider does not improve the product until its full
  source-to-surface path is proven.
- The operator view and post-deploy canaries become part of the data product,
  not optional diagnostics.
- First-party feeds can move quickly, while uncertain facts remain reviewable.
- Provider and GitHub outages degrade honestly without erasing the last known
  good public dataset.

## Required acceptance evidence

- Per-source timestamps and counts for every completed lifecycle stage.
- A current archive or promoted snapshot with no unexplained record loss.
- A public API read above its domain coverage floor.
- Source diversity sufficient to catch a large but one-source-only false green.
- A known-record canary for high-value time-sensitive domains.
- A documented owner and next action for every review-only candidate.
