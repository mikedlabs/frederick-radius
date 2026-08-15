# Hours refresh review

Generated from the committed baseline and the refreshed artifacts at 2026-08-14T20:57:48.593Z.
This report is a review aid. It does not approve, reject, or change a place status.

**No unreviewed public catalog or public closure transition requires manual review.**

## Coverage delta

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public places | 1569 | 1568 | -1 |
| Public places with publishable verified hours | 875 | 1098 | +223 |
| Hours snapshot rows | 1522 | 1522 | 0 |
| Fresh schedule rows in snapshot | 1159 | 1159 | 0 |
| Unmatched database rows ignored | — | 14 | — |

## Public catalog changes

### Removed from public discovery

| Slug | Place | Category | Town | New status | Checked at | Status evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `emmitsburg-farmers-market-emmitsburg` | Emmitsburg Farmers Market | market | emmitsburg | CLOSED_TEMPORARILY | 2026-08-13T08:01:03.490Z | [Recorded](https://homegrownfrederick.com/farmers-markets/) |

An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.

### Added to public discovery

No public listings were added.

## Provider status transitions

### Newly closed

| Slug | Place | Public before | From | To | Checked at | Review evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `brainstorm-comics` | brainstorm-comics | no | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | 2026-08-14T08:01:19.941Z | Not public |
| `emmitsburg-farmers-market-emmitsburg` | Emmitsburg Farmers Market | yes | OPERATIONAL | CLOSED_TEMPORARILY | 2026-08-13T08:01:03.490Z | [Recorded](https://homegrownfrederick.com/farmers-markets/) |

### Reopened

No reopenings were observed.

## Reviewer checklist

- Verify every unreviewed public removal and addition before merging the data PR.
- For a newly closed place, prefer the business's own current notice or another official source over a directory echo.
- Confirm that the coverage gain comes from current schedules and that unmatched rows did not erase a canonical identity.
- Do not edit generated client data by hand. Correct the source or reviewed override, rebuild, and regenerate this report.
