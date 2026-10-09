# Mobile verification, 8 October 2026

**Local verification complete; not live.** Four Chromium cases passed at 390 × 844 in light and dark. Independent review inspected all 14 scene inventories and 28 color/grayscale captures. Eight qualified follow-ups remain. Required application CI verify is blocked by a dependency security audit; no merge or deployment is claimed.

The report covers the four primary tabs, Find from Events, and a real promoted event detail with actual device save, Close, Saved wallet, and reload. It contains documentation, receipts, and unmodified images only.

## Candidate and provenance

| Evidence | Revision or scope |
| --- | --- |
| Report base | Main `8cc159d633dc2fb6425d9628f862cef88fdb9617` |
| Application candidate | `49aa28ca3135a561601e23b7e101e433475838fc` |
| Candidate tree | `b00c2733b83394713b5b0e5bb745af7fb00f3fda` |
| Changed-source freeze | 100 files; SHA256 `8f31ad51e273beda18402fc2351d21c0e8994db4a8fd5a9af180b16ec3c65581` |
| Exact-commit build | `-OpsyG-ZplTq6jnIokvMZ`; [build receipt](receipts/build.json) |
| Candidate/mobile/review records | [Candidate gates](receipts/candidate.json), [mobile and image hashes](receipts/mobile.json), [independent review](receipts/review.json) |
| Functional fixes | [PR #1762](https://github.com/mikedlabs/frederick-radius/pull/1762), `91df6f28a343ce2804edd4d6386aec03e4fe2ea6` |
| Copy hygiene | [PR #1763](https://github.com/mikedlabs/frederick-radius/pull/1763), `e989fe8c109424fe56c118ffa4bcc0742173c0cd` |
| Local search history | [PR #1764](https://github.com/mikedlabs/frederick-radius/pull/1764), `68937041bee32a7cffc67920a702506e0506769a` |
| Visual/confirmed-save polish | [PR #1765](https://github.com/mikedlabs/frederick-radius/pull/1765), `a834ac81ec3fee3353d72a102a87c8c13a28b443`; stacked on PR #1762 |

## Verification

The committed candidate retained the exact tested source freeze. Durations are gate wall time.

| Check | Result |
| --- | --- |
| Style / colors / z-index / types | Passed; 1.64 / 0.42 / 0.23 / 4.57 seconds |
| Changed-file lint | 97 files passed; 29.74 seconds |
| Full unit suite | 8,493 passed; 2 existing skips; 386.75 seconds (1,035 files passed, 1 skipped) |
| Guarded promoted-data build | Passed; 113.81 seconds |
| Component workshop | 128 passed; 12.06 seconds |
| Full UX gate | 51 passed; 172.32 seconds |
| Fresh exact-commit build | Passed; 79.268 seconds |
| Final mobile run | 4 passed; no failures, skips, flaky cases, or retries; 31.91 seconds |
| Report baseline | Style/colors/z-index/types passed; 8,298 unit tests passed, 2 existing skips; all 3,831 tracked base-file hashes unchanged |
| Required remote verify | All four application PRs failed before tests during the production dependency security audit (one high-severity vulnerability); style/review checks passed |

The [22:21 UTC CI snapshot](receipts/ci.json) records exact PR heads and checks. A separate Next.js 16.3.6 → 16.3.8 patch awaits scope approval. Local checks do not waive required verify. The docs-only branch needs no extra build/UX/workshop under the repository's [verification norms](../../../CLAUDE.md#verification-norms). Failed setup/load runs remain preserved privately; they are not counted as passes.

## Mobile results and limits

Both themes passed Today → Map → Events → Saved and Find from Events, plus event detail → actual local save → header Close → Saved → reload. All 14 document/body widths are 390 pixels and headers fit. Navigation controls are **48 pixels tall**, **95.5 wide on Map / 91 wide elsewhere**, in the lower viewport. The real header Close is 77.03 × 44 pixels. These controls pass center/cardinal ±21.5-pixel probes; five points do not establish every point in a square or every control's target size.

All 42 route/color/grayscale readiness records have at least two settled samples and zero relevant native/finite animations remaining (maximum 1,544 ms). Four Close stability proofs pass. The 17 document-scroll samples reached the selected root's end and restored position. Find/detail received viewport-only inventories; covered background controls and closed regions are not treated as actionable.

Axe reports zero violations with **28 incomplete rule records**: 14 contrast, 8 aria-prohibited-attr, 6 aria-valid-attr-value. Twelve contrast checks skipped after a TypeError; both Map captures retain undetermined gradient backgrounds. This is not complete AA proof. The peer review confirmed readable primary title/action grouping in color and grayscale, with the factual-detail/link contrast and other exceptions in [followups.md](followups.md).

Settled layout does not establish provider health. Map rendered its disabled/provider-error fallback; Today shows checking/unavailable live-data states. This anonymous pass does not prove live-map interaction/freshness, account persistence, place wallets, pending/failed mutations, exhaustive modal scrolling, or service-worker lifecycle behavior.

## Screenshots

All 16 selected PNGs are unchanged final-commit captures: 14 color plus two grayscale. Full-page image height may exceed the viewport, including underlying content below a modal. Blocked provider photos may appear unavailable.

| Surface | Light | Dark |
| --- | --- | --- |
| Today | [Capture](images/light-today.png) | [Capture](images/dark-today.png) |
| Map fallback | [Capture](images/light-map.png) | [Capture](images/dark-map.png) |
| Events | [Capture](images/light-events.png) | [Capture](images/dark-events.png) |
| Saved, empty | [Capture](images/light-saved.png) | [Capture](images/dark-saved.png) |
| Find | [Capture](images/light-find.png) | [Capture](images/dark-find.png) |
| Event detail | [Capture](images/light-event-detail.png) | [Capture](images/dark-event-detail.png) |
| Saved event wallet | [Capture](images/light-saved-event-wallet.png) | [Capture](images/dark-saved-event-wallet.png) |

Grayscale: [light Today](images/light-today-grayscale.png), [dark Events](images/dark-events-grayscale.png). All groups used CDP achromatopsia/reset-none, without an HTML filter. Formatted extracted-JSON file hashes are labelled separately from original embedded-body hashes, which the private index retains.

The initial e9 run's four failures remain archived: wrong backdrop Close locator and premature Map probes. The final harness retains cases/thresholds, uses the actual header Close without force, and waits boundedly for route/animation/geometry readiness. Older HTML-filter images are excluded. A separate production Map baseline rendered a real public map at 390 × 844; it is not candidate-provider acceptance or freshness/pan/zoom proof.
