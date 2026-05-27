# Photo downloader runbook

A one-shot script that turns rotating Google Place photo references
into permanent Vercel Blob URLs.

## Why this exists

Google Places returns photo references like
`places/ChIJ.../photos/AfL...` instead of stable image URLs. Google
rotates those references every few weeks. The visible result is "all
the photos disappeared from the site," because the live proxy starts
returning 400s for every reference at once. The fix is to download
the bytes once and host them ourselves.

## What it does

1. Reads `src/data/places-enrichment.json` (the existing Google
   Places metadata).
2. For each enriched place with a photo reference and no existing
   Blob URL, fetches the hero photo bytes from Google.
3. Uploads the bytes to Vercel Blob at `places/<slug>/hero.jpg`.
4. Writes the resulting public URL into `src/data/places-photos.json`
   keyed by slug.

The places loader prefers a Blob URL when present and falls back to
the rotating proxy when it doesn't — so the moment you commit and
deploy the updated JSON, the photos stop rotting.

## Prerequisites

Two env vars need to be set. The easiest way is to pull the Vercel
project's env locally:

```
vercel env pull .env.local
```

That gives you `GOOGLE_PLACES_API_KEY` if it's set on the project.

For the Blob token:

1. Vercel dashboard → your project → **Storage**
2. Create a Blob store if you don't have one (free tier: 1 GB)
3. Connect it to the project
4. The `BLOB_READ_WRITE_TOKEN` env var lands in the project's env
   automatically — pull it the same way:

```
vercel env pull .env.local
```

Confirm both are visible:

```
grep -E "GOOGLE_PLACES_API_KEY|BLOB_READ_WRITE_TOKEN" .env.local
```

## Dry run (free)

```
npm run download:photos
```

Prints the count of slugs that would be downloaded and exits without
calling Google or Vercel Blob.

## Live run

```
npm run download:photos -- --live --confirm
```

Both flags are required so the live mode can't fire accidentally.

The script is resumable. It skips any slug already present in
`places-photos.json`, so a Ctrl-C and restart costs nothing. A single
failed Google fetch logs and continues — one bad reference doesn't
abort the run.

### Optional flags

- `--limit <N>` — download at most N slugs. Useful for smoke tests.

### Concurrency

Hardcoded to 4 in flight. The full county set (about 1,300 places)
should complete in a few minutes.

## Cost

- **Vercel Blob**: ~50 KB per JPEG. 1,300 places ≈ 65 MB. Comfortably
  inside the 1 GB free tier.
- **Google Places**: photo media calls don't bill — you already paid
  for the photo reference via Place Details when the enricher ran.

## After the run

1. Commit `src/data/places-photos.json` and push.
2. Vercel rebuilds; the places loader picks up the new map; every
   place with a Blob URL now serves from `<store>.public.blob.vercel-storage.com`.
3. Re-run after every enrichment pass that adds new photo references.

## Future extensions

- Download all 8 photos per place, not just the hero, so the detail
  page's photo gallery is permanent too.
- Add a build-time sanity check that fails the deploy if more than
  10% of place-photos.json URLs return 404.
- Automate via Vercel Cron + a one-shot API route so the user never
  runs the script by hand.
