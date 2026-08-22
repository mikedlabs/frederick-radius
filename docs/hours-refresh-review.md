# Hours refresh review

Generated from the committed baseline and the refreshed artifacts at 2026-08-22T09:45:32.097Z.
This report is a review aid. It does not approve, reject, or change a place status.

**No unreviewed public catalog or public closure transition requires manual review.**

## Held back tonight

These changes were detected by the refresh and are WAITING for evidence rather than blocking it. Each slug was kept at its previously reviewed value; everything else in this artifact shipped. Record evidence in `src/data/place-status-overrides.json` and the hold releases on the next nightly run.

| Slug | Reason |
| --- | --- |
| `green-valley-harvesters-woodsboro` | public listing addition awaiting evidence |
| `mt-airy-mocha-new-market` | public listing removal awaiting evidence |
| `pour-decisions-restaurant-bar-music-new-market` | public listing removal awaiting evidence |

## Coverage delta

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public places | 1568 | 1568 | 0 |
| Public places with publishable verified hours | 1085 | 1086 | +1 |
| Hours snapshot rows | 1522 | 1522 | 0 |
| Fresh schedule rows in snapshot | 1160 | 1160 | 0 |
| Unmatched database rows ignored | — | 14 | — |

## Public catalog changes

### Removed from public discovery

No public listings were removed.

An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.

### Added to public discovery

No public listings were added.

## Provider status transitions

### Newly closed

No new closed statuses were observed.

### Reopened

No reopenings were observed.

## Reviewer checklist

- Verify every unreviewed public removal and addition before merging the data PR.
- For a newly closed place, prefer the business's own current notice or another official source over a directory echo.
- Confirm that the coverage gain comes from current schedules and that unmatched rows did not erase a canonical identity.
- Do not edit generated client data by hand. Correct the source or reviewed override, rebuild, and regenerate this report.
