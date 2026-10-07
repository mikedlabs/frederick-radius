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
No visual job runs on every pull request yet.

## Review and promote the Linux references

1. Run **Visual contract candidates** from GitHub Actions with `capture`.
2. Download the `visual-contract-capture-*` artifact and review every PNG
   from its `visual-contract-candidates` directory — twelve of them: six
   surfaces (find-empty, ask-empty, ask-working, pulse-bus-sheet,
   compass-directions, map-chooser) at both viewports.
3. Copy the approved Linux/Chromium images into
   `e2e/visual-contract.spec.ts-snapshots/` without renaming them.
4. Run the workflow with `compare`.
5. After the references prove stable across ordinary data refreshes, let this
   dedicated workflow run `compare` on pull requests and make its Chromium job
   required. Keep it separate from the style workflow, which does not install a
   browser.

Local capture is useful for reviewing a branch, but it creates Darwin
references on macOS and must not replace the Linux files:

```sh
npm run test:visual:capture
```

Once references for the current platform exist, compare them with:

```sh
npm run test:visual:compare
```

## Type-scale ratchet

Screenshots catch a surface that changes. The type-scale ratchet catches a
source change that adds hand-sized type before anyone takes a screenshot. It
runs in the style workflow and needs no browser:

```sh
npm run lint:type-scale
```

`scripts/check-type-scale.mjs` counts, per file under `src/app/(app)` and
`src/components`, bracketed Tailwind text sizes, any font size below the 11 px
caption, uppercase text with added letter spacing, press-scale literals, and
numeric stroke widths. The check fails when a file's count rises above
`scripts/type-scale-baseline.json`. Counts may fall freely. Lock a reduction in
with `npm run lint:type-scale -- --write`, and review the baseline diff before
committing it, because any number that rose there is new debt.
