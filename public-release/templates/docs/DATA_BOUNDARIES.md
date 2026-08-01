# Public Data Boundary

Frederick Radius uses a simple rule for this repository: publish what helps people understand and improve the product, but do not publish production material, personal information, secrets, or content that Frederick Radius may not redistribute.

## Allowed in this public hub

- newly written product and architecture overviews;
- public support, security, conduct, and contribution guidance;
- high-level data-quality and provenance principles;
- issue forms that ask for the minimum useful information; and
- rights and attribution notices written for this hub.

## Excluded from this public hub

- production application source and configuration;
- secrets, tokens, identifiers tied to accounts, environment files, and internal endpoints;
- place, event, deal, transit, emergency, scanner, or business datasets;
- cached or enriched provider responses, reviews, ratings, hours, photos, map data, and scraped feeds;
- user submissions, analytics exports, logs, support messages, and precise location histories;
- photographs, design source files, brand masters, videos, audio, and generated campaign assets;
- deployment workflows, internal audits, incident records, backups, and recovery instructions; and
- branches, commits, authorship metadata, pull-request history, or any other history copied from the private production repository.

## Rules for local information

### Provenance

A factual record should retain enough source context to explain where it came from. A link alone does not grant permission to copy or redistribute the linked content.

### Freshness

Time-sensitive information needs a meaningful observed, updated, or verified time. Unknown freshness should be shown as unknown, not replaced with a convenient default.

### Status

Reported, predicted, scheduled, observed, and confirmed are different states. The interface and copy should preserve that distinction.

### Minimization

Collect and expose only what the feature needs. Public issue forms should not request exact home addresses, live location, credentials, private messages, or data about another person.

### Correction and removal

People should have a clear way to report an error or rights concern. A correction request is evaluated against source quality and publication rights; it is not accepted or rejected automatically.

## Release gate

The public-hub generator uses an exact manifest. It rejects unknown template files, modified template content, symlinks, unexpected output files, and non-empty destinations. A release should also receive human review for accuracy, tone, rights, privacy, and current contact information before a repository is published.
