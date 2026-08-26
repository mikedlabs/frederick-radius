# Native menu review intake

The native-menu tables are a private review store, not a scraper destination.
They accept only a restaurant/operator-authorized upload or an OAuth-authorized
POS snapshot. Firecrawl, Tavily, and Apify may help an editor find an official
menu URL, but their extracted text must not be staged as an authorized menu or
used to assert item availability, dietary suitability, or allergen safety.

## Stage an authorized pilot menu

1. Validate without writing:

   ```sh
   npx tsx scripts/import-native-menu.ts --input menu.json --dry-run
   ```

2. Confirm that `place_id` matches an existing public Radius place and that the
   business/operator supplied or authorized the snapshot.

3. Stage it in the private review inbox:

   ```sh
   npm run menus:stage-review -- --input menu.json
   ```

The command writes the complete source, menu, section, and item tree in one
database transaction. Every row is forced to:

- `record_status = draft`
- `verification_status = unverified` on the source
- `freshness_status = unknown`
- no `valid_until`
- no `published_at`

Those states cannot appear in public menu reads. Re-running the same source may
replace only its existing draft/unverified candidate. It refuses to alter a
reviewed, rejected, or published source.

Inspect the private queue without changing it:

```sh
npm run menus:review-queue
```

There is intentionally no publication command yet. The next step for a real
restaurant pilot is an authenticated reviewer screen that compares the staged
menu against the authorized source and records the reviewer, validity window,
and publication decision.
