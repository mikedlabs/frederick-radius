# Visual contract workflow

The visual contract protects Frederick Radius's shared Find, Ask, and map
surfaces at the 375 × 812 mobile viewport and a 1366 × 900 desktop viewport.
The checks turn off animation, wait for the actual product fonts, suppress the
first-visit install invitation, and mask the live map canvas and attribution.
They intentionally test the app's existing routes instead of a parallel demo
page. The visual scripts also bypass the repository's data-regenerating
`predev` hook, so a UI review uses the committed release and leaves tracked
place data untouched.

## Why the first run is capture-only

Text rasterization differs between macOS and the Linux runner used by GitHub
Actions. A screenshot made on a developer Mac is therefore not a safe CI
reference, even when the CSS is identical. The spec includes the platform in
every filename, and the manual workflow keeps capture separate from compare.
The manual job runs on the dedicated `radius-browser` NAS runner so every
candidate comes from one pinned Playwright/Chromium image. It accepts only the
private repository's trusted `main` revision and never runs pull-request code.

## Review and promote the Linux references

1. Run **Visual contract candidates** from GitHub Actions with `capture`.
2. Download the `visual-contract-capture-*` artifact and review all 12 PNGs
   from its `visual-contract-candidates` directory.
3. Copy the approved Linux/Chromium images into
   `e2e/visual-contract.spec.ts-snapshots/` without renaming them.
4. Run the workflow with `compare`.
5. Keep the workflow manual until the references prove stable across ordinary
   data refreshes. A later reviewed change may add a trusted-main weekly
   `compare` schedule. Do not route pull-request code to the persistent NAS
   runner; required PR browser checks remain on GitHub-hosted runners.

Local capture is useful for reviewing a branch, but it creates Darwin
references on macOS and must not replace the Linux files:

```sh
npm run test:visual:capture
```

Once references for the current platform exist, compare them with:

```sh
npm run test:visual:compare
```
