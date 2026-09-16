# UX browser automation

The full mobile UX audit runs nightly and can be started manually before a
release from the **UX browser audit** GitHub workflow. It covers render health,
WCAG A/AA checks, and a conservative interaction crawl across the primary
surfaces. It is intentionally not added to every pull request because the
full route matrix starts a real app and reads live, fail-soft sources.

The 05:15 UTC run uses the dedicated `radius-browser` NAS runner. That runner
accepts only the private repository's trusted `main` revision, receives no
stored repository or provider secrets, and limits its ephemeral `GITHUB_TOKEN`
to read-only repository contents. Pull request browser gates remain on
GitHub-hosted runners. The NAS job uses the browser already pinned in its image
instead of modifying the container at job time.

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

The policy has Vitest coverage and therefore runs in normal CI even though the
real-browser sweep runs nightly or on manual pre-release demand.
