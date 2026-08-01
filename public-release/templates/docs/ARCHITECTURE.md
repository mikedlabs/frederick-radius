# Public Architecture

This document describes Frederick Radius at a conceptual level. It intentionally omits private source code, provider credentials, internal endpoints, deployment configuration, incident details, and operational procedures.

## Two separate repositories

The public project hub and the production system have different jobs:

1. **Public project hub** — documentation, issue intake, community rules, and the public data boundary.
2. **Private production system** — application code, ingestion, normalization, review tools, infrastructure, assets, and operational history.

Nothing in the public hub is required to build or deploy the production application.

## Conceptual product flow

```text
Published and first-party sources
                |
                v
       collection boundary
                |
                v
 normalization + provenance + review
                |
                v
     publishable application records
                |
                v
 web experiences for local discovery
```

Not every source is collected, stored, or republished. Each integration must be evaluated for permission, reliability, freshness, attribution, and user value before it crosses the publication boundary.

## Trust boundaries

### Visitor boundary

The browser receives only information needed for the public experience. Secrets and privileged provider credentials belong on trusted server-side boundaries, never in public documentation or client-readable configuration unless a provider explicitly defines a restricted public token.

### Source boundary

External information is untrusted input. It may be stale, incomplete, duplicated, malformed, or wrong. Normalization should preserve provenance and avoid silently turning a report into a verified fact.

### Editorial boundary

High-impact or ambiguous information may require human review. Public-safety reports, closures, business status, schedule changes, and time-sensitive events need especially clear status and freshness language.

### Administrative boundary

Internal review and publishing capabilities are separate from public browsing. This hub does not document privileged routes, roles, infrastructure, or recovery procedures.

## Reliability principles

- Fail closed when a source, permission, or verification state is unknown.
- Prefer current first-party and official sources for time-sensitive facts.
- Keep a visible distinction between observed, reported, estimated, and confirmed information.
- Degrade clearly when live data is unavailable; do not present stale fallback data as live.
- Minimize data copied to clients and retained in logs.
- Keep public documentation useful without publishing attack paths or operational secrets.

For the release rules behind this separation, read [DATA_BOUNDARIES.md](DATA_BOUNDARIES.md).
