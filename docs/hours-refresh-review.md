# Hours refresh review

Generated from the committed baseline and the refreshed artifacts at 2026-08-01T10:51:07.606Z.
This report is a review aid. It does not approve, reject, or change a place status.

**No unreviewed public catalog or public closure transition requires manual review.**

## Coverage delta

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public places | 1575 | 1573 | -2 |
| Public places with publishable verified hours | 332 | 784 | +452 |
| Hours snapshot rows | 450 | 1082 | +632 |
| Fresh schedule rows in snapshot | 345 | 831 | +486 |
| Unmatched database rows ignored | — | 14 | — |

## Public catalog changes

### Removed from public discovery

| Slug | Place | Category | Town | New status | Checked at | Status evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `mazako` | Mazako | restaurant | frederick | CLOSED_PERMANENTLY | 2026-08-01T08:00:33.740Z | [Recorded](https://mocoshow.com/2026/04/13/mazako-to-close-in-frederick-just-months-after-opening/) |
| `sabor-casero-bakery-frederick-frederick` | Sabor Casero Bakery Frederick | bakery | frederick | CLOSED_PERMANENTLY | 2026-07-29T08:00:10.704Z | [Recorded](https://www.frederickcountymd.gov/DocumentCenter/View/344522) |

An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.

### Added to public discovery

No public listings were added.

## Provider status transitions

### Newly closed

| Slug | Place | Public before | From | To | Checked at | Review evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `atomic-97-beer-wine` | atomic-97-beer-wine | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `distillery-lane-ciderworks-burkittsville` | distillery-lane-ciderworks-burkittsville | no | — | CLOSED_TEMPORARILY | 2026-07-30T08:00:34.861Z | Not public |
| `firestone-restaurant-frederick` | firestone-restaurant-frederick | no | — | CLOSED_PERMANENTLY | 2026-07-29T08:00:10.704Z | Not public |
| `gourmet-restaurant` | gourmet-restaurant | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `green-health-docs` | Green Health Docs | yes | — | CLOSED_PERMANENTLY | 2026-07-29T08:00:10.704Z | [Recorded](https://greenhealthdocs.com/maryland-medical-marijuana-doctors/) |
| `heavenly-wings` | heavenly-wings | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `mazako` | Mazako | yes | — | CLOSED_PERMANENTLY | 2026-08-01T08:00:33.740Z | [Recorded](https://mocoshow.com/2026/04/13/mazako-to-close-in-frederick-just-months-after-opening/) |
| `miscellaneous-distillery-mount-airy` | miscellaneous-distillery-mount-airy | no | — | CLOSED_PERMANENTLY | 2026-07-31T08:00:46.675Z | Not public |
| `mistero-bar-italian-grill` | mistero-bar-italian-grill | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `mon-bon-croissant` | mon-bon-croissant | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `quince-orchard-psychotherapy` | Orchard Mental Health Group | yes | — | CLOSED_PERMANENTLY | 2026-08-01T08:00:33.740Z | [Recorded](https://orchardmentalhealth.com/contact/) |
| `sabor-casero-bakery-frederick-frederick` | Sabor Casero Bakery Frederick | yes | — | CLOSED_PERMANENTLY | 2026-07-29T08:00:10.704Z | [Recorded](https://www.frederickcountymd.gov/DocumentCenter/View/344522) |
| `salvation-army-family-store-and-donation-center` | salvation-army-family-store-and-donation-center | no | — | CLOSED_PERMANENTLY | 2026-07-30T08:00:34.861Z | Not public |
| `saxbys-at-mount-st-marys-university-emmitsburg` | Saxbys at Mount St. Mary's University | yes | — | CLOSED_TEMPORARILY | 2026-07-29T08:00:10.704Z | [Recorded](https://msmary.edu/student-life/living-on-campus/campus-dining.html) |
| `serendipity-market-more` | serendipity-market-more | no | — | CLOSED_PERMANENTLY | 2026-07-29T08:00:10.704Z | Not public |
| `summers-farm-middletown` | summers-farm-middletown | no | — | CLOSED_TEMPORARILY | 2026-07-30T08:00:34.861Z | Not public |
| `terressentials` | terressentials | no | — | CLOSED_TEMPORARILY | 2026-07-31T08:00:46.675Z | Not public |
| `vault-of-visions-art-gallery` | vault-of-visions-art-gallery | no | — | CLOSED_PERMANENTLY | 2026-08-01T08:00:33.740Z | Not public |

### Reopened

No reopenings were observed.

## Reviewer checklist

- Verify every unreviewed public removal and addition before merging the data PR.
- For a newly closed place, prefer the business's own current notice or another official source over a directory echo.
- Confirm that the coverage gain comes from current schedules and that unmatched rows did not erase a canonical identity.
- Do not edit generated client data by hand. Correct the source or reviewed override, rebuild, and regenerate this report.
