# Frederick Radius page-quality contract

This contract keeps the app recognizable while removing friction. It is the shared review standard for core journeys, specialty guides, and generated templates. A page may have its own visual character, but it should not invent a new navigation language or make people work through repeated explanation before they can act.

## The page contract

Every public page should have:

- One visible H1 that names the page or answers the current intent.
- A useful action in the first viewport at 390 × 844 and 1440 × 900.
- No horizontal document overflow.
- No browser exceptions or error-level console messages.
- No failed, broken, or still-unresolved images after lazy content has had a chance to load.
- Heading levels that do not skip forward (for example, H2 directly to H4).
- Controls with a target of at least 44 × 44 CSS pixels. Inline prose links may require human review rather than card-sized treatment, but essential actions must meet the target.
- Honest loading, empty, stale, unavailable-location, and partial-data states.

The following are review signals rather than automatic failures:

- Duplicate headings or action labels. Repetition may be legitimate in navigation, but repeated section names or competing actions usually indicate information-architecture drift.
- More than five visible results in a section without a disclosure or filtering reason.
- Paragraphs longer than 80 words, especially before the first useful action.
- High interactive-element counts or extreme page height. These numbers need context, but large jumps often expose a page that is trying to do too many jobs at once.
- Multiple consecutive decorative containers, badges, or pills. Cards are for actionable objects; pills are for filters, selection, and status.

## Representative route manifest

The automated audit uses stable representatives instead of taking thousands of nearly identical screenshots.

| Group | Representatives | What they protect |
|---|---|---|
| Core | Today, coffee search, voter-registration search, food-permit search, mixed local search, nearby coffee, open now, events, map, coordinate-centered map, pulse, compass | Ask, authoritative civic answers, local-result precedence, discover, compare, and navigate journeys |
| Guides | Beer, brunch, deals, happy hour, live music, weekend, parking, food trucks, amenities, shipping, rivers, transit, trails | Editorial character plus practical utility |
| Templates | Cafe Nola, Whiskey Creek Golf Club, First Friday, coffee category, Frederick town, Frederick without a plan, Frederick Health | Shared incorporated and unincorporated place, event, category, municipality, collection, and nonprofit renderers |
| Support | Places, towns, about, trust, emergency vet | Browse entry points, product context, trust, and urgent utility |

When adding a materially different shared renderer, add one stable representative route to `scripts/page-quality-audit.ts`. Do not add every generated record.

## Run the audit

Start the app separately, then run:

```bash
npm run dev
npm run audit:pages
```

The default target is `http://127.0.0.1:3000`. A built app or deployment can be checked with:

```bash
BASE_URL=http://127.0.0.1:3000 npm run audit:pages
BASE_URL=https://preview.example.com npm run audit:pages
```

Filter by route id, path, group, or description with a comma-separated environment value or CLI flag:

```bash
ROUTE_FILTER=today,place-detail npm run audit:pages
npm run audit:pages -- --route=guide
```

The harness sets the `fr_onboarded=1` cookie and dismisses the beta-introduction storage keys so it measures the real page. Override or disable the onboarding cookie when testing those states:

```bash
ONBOARDING_COOKIE=fr_onboarded=1 npm run audit:pages
ONBOARDING_COOKIE=none npm run audit:pages
```

If a preview needs additional cookies, pass semicolon-separated `name=value` pairs through `AUDIT_COOKIES`. Do not paste production credentials into terminals, logs, or committed files.

Useful controls:

| Variable | Default | Purpose |
|---|---:|---|
| `AUDIT_TIMEOUT_MS` | `45000` | Navigation and operation timeout |
| `AUDIT_SETTLE_MS` | `800` | Time for client content to settle before scrolling |
| `AUDIT_IMAGE_TIMEOUT_MS` | `6000` | Bounded wait after the audit promotes remaining lazy images to eager loading |
| `TOUCH_TARGET_MIN_PX` | `44` | Minimum width and height used by the target check |
| `HEADED` | unset | Set to `1` to watch Chromium run |
| `FAIL_ON_PAGE_ERRORS` | unset | Set to `1` to exit nonzero when a check has a navigation, HTTP, or browser error |

## Output

Each run creates a timestamped local evidence folder under:

```text
output/page-quality/<timestamp>/
```

It contains:

- A resting-state full-page PNG for every route and viewport.
- An additional `--expanded` PNG when the page has eligible disclosures; attempted/open counts make a control that fails to remain open explicit.
- `summary.md`, a quick human review matrix with prioritized findings.
- `summary.json`, the complete machine-readable report with selectors and measurements.

The output is disposable local evidence and must remain untracked. Do not stage screenshots or reports in a product commit.

## What the harness measures

At mobile 390 × 844 and desktop 1440 × 900 it records:

- Navigation status, redirects, runtime exceptions, and error-level console messages.
- Document height and width.
- Horizontal overflow plus likely offending elements.
- Visible H1–H6 counts, outline, and forward level skips.
- Duplicate normalized headings and interactive labels.
- Visible interactive-element count.
- Controls smaller than the configured touch-target minimum. Inline-link exceptions require actual surrounding prose, and CSS tap extenders must expose a computed, unclipped pseudo-element hitbox.
- Image count, failed image requests, broken images, and images still unresolved after scrolling the full page, promoting remaining native-lazy images inside the disposable audit context, and waiting for the bounded load allowance.
- Every visible paragraph's word count, total words, and longest paragraph.
- The position and label of the first useful action inside main content.
- A second DOM pass after opening native `details` elements and conservative
  main-content `button[aria-expanded="false"]` controls whose collapsed inline
  panel is explicitly identified by `aria-controls`. The harness verifies that
  every measured panel remains visible and, while its trigger stays visible,
  that `aria-expanded` agrees. Attempted/open counts expose accordions or
  controls that close again. Expanded overflow, headings, touch targets,
  images, and density remain separate in both reports so hidden content cannot
  escape review.

The audit deliberately excludes form, navigation, app-chrome, popup/dialog
launchers, and destructive controls from the expansion pass. It does not click
external actions, judge whether editorial data is correct, replace screen-reader
testing, or declare that a page looks good. Each route and viewport receives a
fresh browser context, so local storage, session storage, and cookies cannot make
later results depend on route order. The screenshots and measurements create a
repeatable review surface; a human still decides whether hierarchy, copy, visual
rhythm, and local character are right.

The Markdown matrix shows resting/expanded state pairs. Aggregate target and
image totals deduplicate the same selector across those two states within a
route check. Redirects, duplicate labels or headings, long paragraphs, high
action counts, and extreme page heights remain visible in a separate review
signals section even when the route passes its enforceable checks.

## Release use

For a page-system change:

1. Run the affected route or group before editing and keep the timestamped baseline.
2. Fix shared primitives or templates before route-local symptoms.
3. Run the same filter again and compare the matrix and screenshots.
4. Exercise the primary journey manually on a real phone or device simulator.
5. Run the complete manifest against the preview deployment before promotion.

An automated warning is a prompt to inspect, not permission to make a page generic. The goal is consistent behavior and hierarchy while preserving the useful personality of each guide.
