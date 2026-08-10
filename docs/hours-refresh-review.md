# Hours refresh review

Generated from the committed baseline and the refreshed artifacts at 2026-08-10T10:38:30.852Z.
This report is a review aid. It does not approve, reject, or change a place status.

**No unreviewed public catalog or public closure transition requires manual review.**

## Coverage delta

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public places | 1569 | 1569 | 0 |
| Public places with publishable verified hours | 895 | 1083 | +188 |
| Hours snapshot rows | 1522 | 1522 | 0 |
| Fresh schedule rows in snapshot | 1160 | 1159 | -1 |
| Unmatched database rows ignored | — | 14 | — |

## Public catalog changes

### Removed from public discovery

No public listings were removed.

An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.

### Added to public discovery

No public listings were added.

## Provider status transitions

### Newly closed

| Slug | Place | Public before | From | To | Checked at | Review evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `concettas-main-street-bistro-mount-airy` | Concetta's Main Street Bistro | yes | OPERATIONAL | CLOSED_PERMANENTLY | 2026-08-08T08:00:24.870Z | [Operational correction](https://concettasmainstreet.com/) |

### Reopened

No reopenings were observed.

## Reviewer checklist

- Verify every unreviewed public removal and addition before merging the data PR.
- For a newly closed place, prefer the business's own current notice or another official source over a directory echo.
- Confirm that the coverage gain comes from current schedules and that unmatched rows did not erase a canonical identity.
- Do not edit generated client data by hand. Correct the source or reviewed override, rebuild, and regenerate this report.
