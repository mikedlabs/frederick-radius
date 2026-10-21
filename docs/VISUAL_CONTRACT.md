# Visual contract workflow

The visual contract covers Frederick Radius's shared Find, Ask, and map
surfaces at the 375 × 812 mobile viewport and a 1366 × 900 desktop viewport.
The default manual workflow runs 10 provider-free cases and excludes the two
working styled-map chooser cases, which require a separate approved run.
The checks turn off animation, wait for the actual product fonts, suppress the
first-visit install invitation, and mask the live map canvas and attribution.
They intentionally test the app's existing routes instead of a parallel demo
page. Playwright starts `npm run dev`; its current `predev` hook validates
committed release artifacts rather than regenerating place data. A visual
review uses the committed release and leaves tracked place data untouched.

## Why the first run is capture-only

Text rasterization differs between macOS and the Linux runner used by GitHub
Actions. A screenshot made on a developer Mac is therefore not a safe CI
reference, even when the CSS is identical. The spec includes the platform in
every filename, and the manual workflow keeps capture separate from compare.
No visual job runs on every pull request yet.

## Review and promote the Linux references

1. Run **Visual contract candidates** from GitHub Actions with `capture`.
2. Download the `visual-contract-capture-*` artifact and review every PNG
   from its `visual-contract-candidates` directory — ten of them: five
   surfaces (find-empty, ask-empty, ask-working, pulse-bus-sheet,
   compass-directions) at both viewports. The workflow summary records the
   outcome and explicitly excludes the working styled-map reference.
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
npm run test:visual:capture -- --grep-invert 'the map chooser preserves the map while revealing one command layer$'
```

Once references for the current platform exist, compare them with:

```sh
npm run test:visual:compare -- --grep-invert 'the map chooser preserves the map while revealing one command layer$'
```

## Separate working styled-map reference

Only run the styled-map chooser cases in an explicitly configured, approved
renderer-enabled environment. The default workflow supplies no renderer token
or secret; do not add one to make the provider-free capture pass.

```sh
npm run test:visual:capture -- --grep 'the map chooser preserves the map while revealing one command layer$'
```

Keep the test's actual `data-map-loaded="true"` assertion unchanged. Before
calling these captures working-map proof, independently record the actual
renderer load and `data-map-place-marks="ready"` state on the visible map.
The screenshots mask the live canvas and attribution, so they cannot prove
rendered marks or attribution compliance on their own. Report the 10-case
provider-free result and any separately verified styled-map result distinctly;
neither an excluded case nor a missing-token fallback is a full-suite pass.
