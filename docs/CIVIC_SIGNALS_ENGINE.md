# Civic Signals

## Product rule

Civic Signals turns public Frederick data into findings a resident can inspect.
It is not a crime map, a neighborhood score, a predictive-policing system, or
an AI summary of records.

The calculation comes first. A published signal must retain the exact source
snapshot, unit, geography, period, comparison, rule version, exclusions, and
caveats that produced it. Language is rendered only after those facts are
locked.

## Public shape

Every signal answers:

- What does this source show?
- What period and geography does the finding cover?
- What is the literal comparison?
- Why might a resident care?
- What limits the conclusion?
- How was it calculated?

The public API returns approved aggregate signals. It never returns source
records, resident text, addresses, exact incident coordinates, names, or other
identifiers.

## Data path

```text
official or approved source
  -> immutable source snapshot
  -> normalized civic facts
  -> deterministic, versioned rule
  -> privacy and quality gates
  -> human review when sensitive
  -> published signal with evidence
```

AI can help offline with document extraction, entity matching, and plain
language after the values are fixed. It cannot calculate the result, invent a
missing value, waive a suppression rule, infer causation, or publish a
public-safety finding on its own.

## Release gates

General aggregate findings require at least 11 qualifying records. A sensitive
category requires at least 20 records spread across at least three dates and
three source locations. Small cells are suppressed everywhere, including API
responses, percentages, charts, alt text, exports, and maps.

Routine records wait at least seven days and must appear in two successive
ingests before publication. Sensitive public-safety records wait at least 30
days and publish only as monthly or quarterly aggregates. Active incidents are
never published by this engine.

A trend needs complete comparable periods, stable definitions, stable
coverage, and enough history. A public-safety anomaly needs at least 104
completed weeks, a seasonally matched model, an absolute and relative effect,
and a multiple-testing correction. Until those gates pass, Radius may describe
a dated snapshot but must not call it a trend or spike.

Calls for service are always labeled as reported calls or calls recorded by the
source. They are never labeled as crimes. Reported offenses, arrests, victims,
incidents, calls, and service requests are different record units and cannot be
summed into one measure.

## First vertical slice

The first implementation reads the latest normalized FCG FixIt page. It:

- validates IDs, categories, workflow status, and timestamps;
- removes duplicate and malformed records;
- converts only approved fields into civic facts;
- discards resident descriptions, addresses, URLs to individual reports, and
  coordinates before analysis;
- publishes the accepted page count when the general minimum passes;
- withholds a category share unless both the named category and its implied
  remainder pass the same minimum;
- labels the result as a snapshot, not a trend; and
- exposes the full method and caveat through the signal card.

The current fetch retains one API page. It cannot represent a complete day,
week, backlog, or resolution history. Radius must obtain acceptable reuse terms
and build a complete paginated history before it publishes those analyses.

Frederick County identifies FCG FixIt as its non-emergency service-request
system: <https://www.frederickcountymd.gov/dpwworkrequest-viewer>.

## Source roadmap

1. Build daily history for FCG FixIt and add status-duration analysis only when
   the source supports a defensible updated timestamp.
2. Join reviewed County parks assets to answer practical questions about
   maintained seating, water, waste receptacles, bike facilities, toilets, and
   other park amenities.
3. Reconcile survey year and location for County and MDOT traffic counts before
   using traffic as an exposure denominator.
4. Reconcile the current County residential-pipeline report with its GIS layer
   before publishing development trends.
5. Obtain written reuse permission for City Spires development data before
   caching or republishing it.
6. Extract official budgets, contracts, agendas, permits, and performance
   reports into dated facts with document-page citations.
7. Add police and sheriff data only through an approved export, public-records
   response, or agency partnership, followed by privacy, taxonomy, coverage,
   and comparability review.

The County GIS catalog is discoverable at
<https://fcgis.frederickcountymd.gov/server_pub/rest/services>. A readable
endpoint is a lead, not automatic permission or proof of current coverage.

## Public-safety boundary

Never publish:

- people, households, addresses, narratives, exact points, or detailed
  sensitive infrastructure;
- neighborhood safety rankings or labels such as “dangerous” or “crime-prone”;
- future crime forecasts, patrol recommendations, or person-level risk scores;
- causal explanations from observational correlations;
- arbitrary filters that let users reconstruct a suppressed count; or
- a comparison that mixes NIBRS and legacy reporting as one uninterrupted
  series.

The Frederick Police Department explicitly states that calls for service do
not establish what crime, if any, occurred:
<https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map>.

## Production storage

The first slice can compute from an approved local snapshot. A production
history should add server-only tables for:

- source snapshots;
- normalized civic facts;
- candidate and published signals; and
- signal evidence.

Those tables should deny anonymous access. The public endpoint reads only
reviewed aggregate output. Each source revision creates a new snapshot and
recomputes affected findings rather than silently changing an old result.

## Success

Measure whether residents open the evidence, use a next action, save or share a
finding, and mark it useful. Also count suppressed candidates by reason. The
engine is succeeding when it produces a few timely, inspectable findings—not
when it produces the most cards.
