# Municipal civic ingestion (the town-parity agent)

**Problem:** the City of Frederick + the County have rich civic data;
the 12 municipalities publish **no feeds**, so they were getting unequal
treatment. **Solution:** a Claude-powered extraction agent that reads
each town's official gov page(s) and produces structured civic data with
**source + freshness**, on a schedule — so every town reaches parity.

## How it works
```
config/municipal-civic-sources.json   ← which town pages to read
        │
        ▼
scripts/ingest-municipal-civic.ts      ← fetch page → Claude extracts strict JSON
        │   (npm run ingest:civic)        (omits anything not on the page; never guesses)
        ▼
src/data/municipal-civic.json          ← { slug → { townHall, trashRecycling, … , source:{url,fetchedAt} } }
        │
        ▼
src/lib/loaders/municipalCivic.ts      ← typed read side: municipalCivicFor(slug), findMunicipalCivic(query)
        │
        ▼
the "ask Frederick" answer engine       ← town-aware: "Brunswick trash" → Brunswick's office + source
```

## To turn it on
1. **Add URLs.** Fill `urls: []` for each town in
   `config/municipal-civic-sources.json` with its official gov page(s)
   (e.g. a "Government / Departments" or "Trash & Recycling" page). The
   agent validates each URL at fetch time and logs failures.
2. **Set the secret.** Add a standard workspace API key as
   `ANTHROPIC_CIVIC_API_KEY` in GitHub's protected **Data Enrichment**
   environment. Do not use an Anthropic Admin API key.
3. **Run it.** `npm run ingest:civic` locally (writes the JSON), or let
   `.github/workflows/ingest-civic.yml` run it **daily** and commit the
   refresh. `npm run ingest:civic brunswick` does one town.

## Guarantees
- **Never fabricates.** Claude is instructed to omit any field not on
  the fetched page. A failed fetch leaves the town unchanged.
- **Always sourced.** Every record carries `source: { url, fetchedAt }`,
  so the UI shows "Town of Brunswick · updated 2d ago."
- **Extensible.** The same pattern works for any no-feed source (trash
  calendars, gov hours, council agendas) — add a URL + an extraction
  field. For pickup-day-by-address, point a URL at the collection-zone
  page; the agent will extract the schedule rule.

## Status
System is built and wired (read side + answer-engine matcher
`findMunicipalCivic`). It produces data as soon as URLs + the key are in
place. The search UI surfaces gov departments today; the town-civic
render lights up the moment `municipal-civic.json` has entries.
