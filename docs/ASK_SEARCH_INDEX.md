# Ask search index

Living, reviewed 2026-10-08. This is the background for the search-index rule
in `CLAUDE.md` (Data pipeline). If the two disagree, `CLAUDE.md` wins and this
file gets fixed.

## What it is

`public.radius_search_documents` holds one private text document per public
place, built by `buildRadiusSearchDocument()` in
`src/lib/ask/search-index-document.ts`. Ask's `hybridPlaceSearch()` in
`src/lib/ask/hybrid-search.ts` ranks it with Postgres full-text search, which
is the required baseline, and adds pgvector recall only when runtime
embeddings are switched on.

- The scheduled writer is `/api/cron/radius-search` (daily, in `vercel.json`).
  It does nothing unless `RADIUS_SEARCH_CRON=1`.
- `npm run build:radius-search` bootstraps or refreshes the index at once.
  Both paths need `DATABASE_URL`, and both are incremental.
- The `semantic-index` tripwire in `src/lib/quality/tripwires.ts` turns
  /admin/data-health red when the index is empty or covers less than 80% of
  public places. It reports vector coverage only when the semantic switch says
  vectors should exist.

## Why an empty index is dangerous

`hybridPlaceSearch()` fails soft to `[]` when the database, the query or the
index is unavailable, so an empty index looks the same as a healthy one at the
call site. The index once shipped empty, and Ask ran keyword-only for months
before anyone noticed. Keep `RADIUS_SEARCH_CRON=1` in Vercel Production and
treat a red `semantic-index` tripwire as a real fault.

## Vectors are optional and paid

The writer (`src/lib/ask/search-index-builder.ts`) and the runtime query both
embed through the direct OpenAI provider (`@ai-sdk/openai`), so vectors need
`OPENAI_API_KEY`. Do not infer transport support from a provider catalog or
from Ask's text-generation credentials.

- Scheduled document vectors run only when `RADIUS_SEARCH_SEMANTIC_ENABLED=1`,
  `RADIUS_SEARCH_EMBEDDING_DAILY_DOCUMENT_LIMIT` is positive and the key is set
  (`radiusSearchSemanticConfigured()` in `src/lib/ask/search-index-budget.ts`).
  A key alone never starts paid work.
- Query-time vectors run only when `askRuntimeEmbeddingsConfigured()` in
  `src/lib/ask/runtime-budget.ts` passes. Otherwise Ask keeps the full-text
  result.

## Why vectors are not worth buying yet

The documents are too alike to embed usefully. The fields that would tell
places apart are nearly empty, and address and postal-code lines, which every
document carries, make up over a third of the text. Embedding this corpus would
mostly produce near-identical "restaurant in Frederick" vectors whose cosine
ranking is close to arbitrary. Enrich the documents first. Vectors are worth
buying once there is something distinctive in them to embed.

Measured 2026-10-08 over all public-place documents, with the script below:

| Measure | Value |
| --- | --- |
| Documents | 1,570 |
| Average length | 152 characters |
| Median length | 137 characters |
| Under 100 characters | 47 |
| Under 200 characters | 1,386 |
| Documents with an address line | 1,570 |
| Share of all characters in address and postal-code lines | 0.37 |
| Places with `amenities` | 8 |
| Places with `search_aliases` | 22 |
| Places with `description` | 3 |
| Places with `known_for` | 5 |

Aliases are already in the indexed document: #1634 added them, and they are
the `search_aliases` line in `buildRadiusSearchDocument()`. Do not re-add a
note saying they are missing. That claim once sent agents to redo finished
work.

## Reproduce the measurements

Save this as `/tmp/corpus.ts` and run
`npx tsx --tsconfig tsconfig.json /tmp/corpus.ts 2>/dev/null` from the repo
root. Update the table and its date together.

```ts
import { radiusSearchDocuments } from "@/lib/ask/search-index-document";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";

const docs = radiusSearchDocuments().map((d) => d.content);
const lens = docs.map((c) => c.length).sort((a, b) => a - b);
const boiler = (c: string) =>
  c.split("\n").filter((l) => /^(Address|Postal code):/.test(l)).join("\n").length;
const places = publicPlaces().map((p) => decoratePlace(p)) as unknown as Record<string, unknown>[];
const filled = (key: string) =>
  places.filter((p) => (Array.isArray(p[key]) ? (p[key] as unknown[]).length > 0 : Boolean(p[key]))).length;
console.log(JSON.stringify({
  documents: lens.length,
  averageChars: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
  medianChars: lens[lens.length >> 1],
  under100: lens.filter((n) => n < 100).length,
  under200: lens.filter((n) => n < 200).length,
  withAddressLine: docs.filter((c) => /\nAddress:/.test(c)).length,
  addressAndPostalShare: +(docs.reduce((a, c) => a + boiler(c), 0) / docs.reduce((a, c) => a + c.length, 0)).toFixed(2),
  amenities: filled("amenities"),
  search_aliases: filled("search_aliases"),
  description: filled("description"),
  known_for: filled("known_for"),
}));
process.exit(0);
```
