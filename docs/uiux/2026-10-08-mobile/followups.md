# Follow-ups and coverage

Local verification is complete for `49aa28ca` / build `-OpsyG-ZplTq6jnIokvMZ`. Independent review inspected 14 inventories, 28 visuals, and all 100 frozen source hashes. The eight published issues below cover the supported findings; no additional untracked finding was identified within this bounded pass. [Canonical issue receipt](receipts/followups.json).

## Published follow-ups

| Issue | Qualified evidence | Bounded next step |
| --- | --- | --- |
| [#1766: Serialize device Saved writes across tabs](https://github.com/mikedlabs/frederick-radius/issues/1766) | Whole-array device writes can overwrite another tab's update. Source risk; no simultaneous-tab collision reproduced. | Review serialization while preserving existing keys, data, and unrelated rows. |
| [#1767: Keep initial follow controls aligned with verified bootstrap](https://github.com/mikedlabs/frederick-radius/issues/1767) | Inherited source plus a controlled story: verified parent membership can briefly disagree with child controls. No authenticated production/mobile occurrence established. | Preserve identity/reset barriers while avoiding the transient unknown-state retry. |
| [#1768: Align primary Map fallback gutters with shared spacing](https://github.com/mikedlabs/frederick-radius/issues/1768) | Final provider-disabled fallback retains 14-pixel header / 12-pixel list gutters beside the shared 16-pixel rule. | Align fallback spacing; preserve intentional edge-to-edge Map layout. |
| [#1769: Complete effective mobile targets for Saved titles and footer](https://github.com/mikedlabs/frederick-radius/issues/1769) | Actual event-title upper/lower probes miss its 183.17 × 21-pixel link; the thin footer link's lower probe hits the adjacent disclosure. Place-wallet equivalent is source-only. | Expand effective regions without overlapping adjacent controls. |
| [#1770: Keep Map fallback row actions clear of the search dock](https://github.com/mikedlabs/frederick-radius/issues/1770) | Two rows partially overlap the dock at the initial position. All 12 sampled rows pass at another ordinary scroll position. No permanently unreachable row demonstrated. | Preserve clear row actions around the fixed dock. |
| [#1771: Make event-detail facts and links readable in dark mode](https://github.com/mikedlabs/frederick-radius/issues/1771) | Settled dark Free/category copy and See full page are faint. Fixed link role at `EventSheet.tsx:503` gives source-derived 1.66:1 plain / 1.55:1 maximum-Plum bounds, not rendered AA measurements. | Use readable factual/link roles; verify actual composed light/dark/tinted backgrounds. |
| [#1772: Restore meaningful contrast checks in mobile accessibility verification](https://github.com/mikedlabs/frederick-radius/issues/1772) | Twelve contrast TypeError skips and two gradient-undetermined Map captures; placeholder ratios are not measured passes/failures. | Restore meaningful contrast execution and retain manual contrast/ARIA review. |
| [#1773: Reduce empty space in collapsed Saved event cards](https://github.com/mikedlabs/frederick-radius/issues/1773) | Both settled themes retain the inherited 186-pixel minimum after decoration/stub is hidden: over 120 pixels blank below the header. Save/reload and real wallet/loading-zero assertions pass. | Review closed single/last-card spacing while preserving expansion, deck overlap, and title/disclosure targets. |

The historical bootstrap trace in e9 `useFollows.ts` replaces the identity promise at line 238, returns unknown at 275, and retries after one second at 403. Fixture staging did not repair the inherited runtime window. Map's negative margin intentionally cancels AppMain padding; the shared scale did not fix every legacy gutter. Saved empty copy's local 2-pixel inset is not a page-title gutter defect.

For #1771, the maximum-tint value is a conservative source bound; the actual footer lies below the gradient span. It is not a sampled pixel ratio. For #1773, `globals.css:2975` retains the card minimum while primary Saved hides decoration and the closed stub stays hidden. This is settled inherited deck geometry exposed by the neutral face, not missing data or a failed save.

## Coverage and release limits

Five-point targets are bounded samples. Small painted rectangles alone are not failures: the save icon and outbound detail link pass their extended sampled regions. Modal backgrounds, offscreen rows, and closed disclosure content are not treated as disabled/broken controls. Document sampling reached the selected root's end; modal inner scrolling was not exhausted.

Zero axe violations does not resolve the 28 incomplete records or certify AA. Generic-element labels need manual review. Incomplete aria-controls results alone do not establish dangling IDs; Events/Find target IDs exist in source. Positioned photos/gradients and future images remain outside a general contrast claim. Guarded provider-disabled/partial-data states do not prove live-provider regressions, freshness, or authenticated persistence.

The [22:21 UTC CI snapshot](receipts/ci.json) shows all four application PRs failing required verify before tests during the production dependency security audit (one high-severity vulnerability). Style/review checks passed; the source-only cross-tab finding remains filed. A separate Next.js **16.3.6 → 16.3.8** patch awaits scope approval. No dependency change, merge, or deployment belongs to this report, and local passes do not waive required verify.
