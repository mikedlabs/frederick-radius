# Gate Record

Every session appends its `scripts/budget.sh` output and `clutter.spec.ts` result here with the date. This file is the progress record; the targets live in CLAUDE.md (/today under 150 lines and 150 KB; /events under 400 lines and 300 KB).

## Baseline, pre-Session 0 (June 12, 2026, 5:38 PM ET, production)

```
Clutter budget against https://frederickradius.app on Fri Jun 12 17:38:09 EDT 2026
page | visible lines | decoded bytes
-----|---------------|--------------
/ | 50 | 157179
/today | 304 | 322071
/events | 954 | 788892
/map | 19 | 126334
/alerts | 7 | 31314
```

Matches the June 12 capture in `frederickradius-handoff/docs/05-site-capture.md` within a few lines (/today 304 vs 310 captured; /events 954 vs 951). `/alerts` does not exist yet; its row measures the 404 page and becomes meaningful after Session 1 stubs the route.

## Gate, pre-Session 0 (June 12, 2026, production): 5 failed, 2 passed

Failures are expected at baseline; they are the work the sessions exist to do.

| Test | Result | First failing rule |
|---|---|---|
| clutter contract: / | pass | |
| clutter contract: /map | pass | |
| clutter contract: /today | FAIL | Rule 3, counts as content: body matches "places open" (the stat card) |
| clutter contract: /events | FAIL | Rule 4, one search system: text inputs render inside main |
| count integrity: /events | FAIL | Section "Today 1" claims 1 but renders 25 h3 elements |
| routes: twins are redirects | FAIL | /guide returns 200, not 301/308 (Decision 1 not yet executed; /radius and /pulse untested past first failure) |
| payload budgets | FAIL | /today decoded HTML 346,642 bytes, budget 150,000 (/events untested past first failure; budget run above shows 788,892 vs 300,000) |

Note on stability: across three runs the two page-contract tests flipped once (passed in one run minutes apart), so they are sensitive to time-of-day content on production. The other three failures were identical in every run. Fixes land in Sessions 1 (routes), 2 (/today), and 3 (/events).
