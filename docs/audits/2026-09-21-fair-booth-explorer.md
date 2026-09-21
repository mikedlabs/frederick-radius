# Fair booth explorer release

## Scope

The owner authorized use of the public exhibitor and layout material on
September 21, 2026. The release JSON records that attestation, source check,
source markup and artwork hashes, and the exact public-only review scope.
It is not an independently verified license or a claim of Fair partnership.

The reviewed source contains 155 exhibitors, 511 shapes and 411 resolved
vendor-to-booth references. One shape has no source number or exhibitor.
The three source pages contain seven separate diagrams, not contiguous map
tiles. Radius must not stitch them into invented GPS booth positions.

## Visitor experience

The existing whole-fair map remains the geographic overview for reviewed
gates, buildings, animals, stages, services, parking, transit, and events.
Its search also finds the complete reviewed exhibitor directory and numbered
booths. Selecting a booth opens an image-space neighborhood, with a return to
the whole Fair. The returning overview preserves the visitor's search.

Booth close-ups use original Radius vector styling and source-derived
structural context. The official document artwork is an optional reference,
not the default canvas. Source rectangle positions, numbers, rotations and
vendor assignments remain unchanged. Tiny map targets have a full-size list
alternative. Typing does not move the camera. Shared booth links contain only
the public booth selection, never a private plan or search text.

Only the 12 separately reviewed vendor profiles have rich menu and My Day
integration. Every exhibitor has source identity and assigned booth details;
none gains invented menus, inventory, operating hours, or walking directions.

## Load and repository budgets

The directory is about 90KB and loads from the same origin when the Fair map
opens. The custom vector view does not load the original artwork. The three
optional original PNGs total exactly 2,701,298 bytes and are retained unchanged
for dependable reference and hash verification. Each is below the existing
1MiB per-file rule. Measured prospective repository size was 241,562,847 bytes
before the final context file. The total allowance increases from 239MB to
242MB for these specific reviewed assets and their implementation; no per-file
or category limit is relaxed.

## Release and recovery

The recurring collector remains review-only. A refresh cannot overwrite this
public snapshot without explicit manual review and promotion. No database,
Google Cloud, paid API, or provider configuration change is needed.

The loader validates schema and reciprocal IDs, caps the response size, times
out, and exposes retry plus the official guide on failure. Failed optional
artwork does not remove the booth list. Release through the normal reviewed
GitHub merge and automatic Vercel build. Verify the exact production SHA and
the booth journey before calling this live. If the new journey breaks, revert
this isolated change through the same release path; leave the independently
working grounds guide and existing rich profiles available.

## Verification record

The refined version passes 7,745 unit tests with two skipped, all 50 public
accessibility/interaction checks, and 14 connected Fair browser tests (nine
booth cases and five existing vendor regressions). Checks include all three
source sections, custom vectors by default, optional original artwork, Back,
shared booth reloads, cross-section lookup, unassigned numbered booths, and
phone widths 320/375/390/430. Production dependency audit reports zero
vulnerabilities. TypeScript, scoped lint, style checks, and reviewed-data
integrity checks pass. Eight real-data Storybook browser/accessibility states
cover the new component; full GitHub gates and exact-SHA production checks
remain the final publication gate.
