# Hours refresh review

Compared committed baseline with the current artifacts. Provider snapshot timestamp: 2026-08-22T17:16:36.471Z; this does not redate retained observations or first-party evidence.
This report is a review aid. It does not approve, reject, or change a place status.

**Manual review required:** 1 unreviewed public listing addition(s).

## Coverage delta

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public places | 1571 | 1572 | +1 |
| Public places with publishable verified hours | 37 | 37 | 0 |
| Public places with qualified schedules | 3 | 3 | 0 |
| Hours snapshot rows | 1522 | 1522 | 0 |
| Fresh schedule rows in snapshot | 1160 | 1160 | 0 |
| Unmatched database rows ignored | — | 14 | — |

Qualified schedules retain their service or admission conditions and do not establish venue opening. They are excluded from the general verified-hours total and Open now coverage.

## Public catalog changes

### Removed from public discovery

No public listings were removed.

An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.

### Added to public discovery

| Slug | Place | Category | Town | Provider status | Review evidence |
| --- | --- | --- | --- | --- | --- |
| `sailing-through-the-winter-solstice` | Sailing Through the Winter Solstice | park | frederick | — | Review required |

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
