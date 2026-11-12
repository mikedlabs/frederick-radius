# UX browser automation

The full mobile UX audit is dispatch-only. Start it from the **UX browser
audit** GitHub workflow, or run `npm run test:ux` locally, before a release.
It has no schedule, and `scripts/automation-ownership-audit.mjs` fails if
`ux-audit.yml` gains one before its runner budget is re-reviewed. The audit
covers render health, WCAG A/AA checks, and a conservative interaction crawl
across the primary surfaces. It is intentionally not added to every pull
request because the full route matrix starts a real app and reads live,
fail-soft sources.

The interaction crawler is read-only by design:

- It follows same-origin links that do not point at API, admin, account,
  submission, or other mutation-shaped routes.
- It exercises buttons only when their semantics identify a disclosure,
  toggle, tab, popup, or clearly read-only action.
- It refuses submit buttons, downloads, contact/external links, new windows,
  mutation-shaped labels, and controls marked `data-crawler-safe="false"`.
- It aborts every non-GET/HEAD/OPTIONS request in the browser. A same-origin
  write attempt fails the test.
- `data-crawler-safe="true"` can opt in a `type="button"` whose side effect is
  read-only but not obvious from its markup. It cannot override a form submit,
  unsafe route, or mutation-shaped label.

The policy has Vitest coverage in
`src/lib/testing/safe-interaction-policy.spec.ts` and therefore runs in normal
CI, even though the real-browser sweep runs only when someone dispatches it
before a release.
