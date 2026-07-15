/**
 * Google Places photos must not be downloaded into permanent first-party
 * storage. This command used to fetch the photo bytes, upload them to a
 * public Vercel Blob, and write the resulting URLs into app data. Keeping
 * the command name as an explicit refusal prevents an old runbook or CI job
 * from silently reintroducing that behavior.
 *
 * Existing Blob objects and places-photos.json entries are intentionally not
 * deleted here. Removing already-published data is a separate, auditable
 * cleanup operation.
 */

console.error(
  [
    "Refusing to mirror Google Places photos.",
    "Frederick Radius now serves requested photos through the no-store,",
    "same-origin /api/place-photo transport and does not create new Blob copies.",
  ].join(" "),
);

process.exitCode = 1;
