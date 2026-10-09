# October 9 feedback release status

This is the pre-publication verification record for the October 9 feedback release, based on main `8cc159d633dc2fb6425d9628f862cef88fdb9617`. At the time of these checks, that earlier revision remained on production and its Today weather was below the first screen. Publication is verified separately against the merged commit and public alias; a local build alone is not deployment proof.

The consolidated branch is `codex/feedback-release-20261009`. It includes the reviewed cleanup from [#1762](https://github.com/mikedlabs/frederick-radius/pull/1762), [#1763](https://github.com/mikedlabs/frederick-radius/pull/1763), [#1764](https://github.com/mikedlabs/frederick-radius/pull/1764), [#1765](https://github.com/mikedlabs/frederick-radius/pull/1765), and the weather presentation from [#1775](https://github.com/mikedlabs/frederick-radius/pull/1775), with October 9 feedback changes:

- Today brings weather and Find forward, with a compact reading and truthful forecast issuance. The daily heading is separate from the scenic photograph. The owner permits their photos without visible credits or dates; required third-party attribution remains visible.
- Place cards use larger approved photographs, event artwork is more prominent, and cards regain clear borders and depth. Missing or failed photos retain usable facts. Owned photography supplies visual context without suggesting it captures current activity.
- Local news uses the existing approved Google News RSS queries. Headlines retain publisher attribution, publication dates or an explicit unavailable-date label, and original outlinks. Official city and county civic updates remain separately labelled. Failed, partial, and empty reads are distinct.
- Saved confirms the requested change against actual stored or server state, including changes from another tab, before showing success.
- Map separates pending and failed searches, keeps the query and area through recovery, and measures its search dock so recovery controls remain usable on phones and desktops.
- County status retains source check times through cached responses, shows current alerts alongside partial checks, and distinguishes earlier road and incident reports from current counts. Client displays expire at the earliest usable source deadline, and the summary endpoint does not re-cache an assembled current label. Unverifiable feeds use calm wording; source times are separate from the page assembly time.
- Event filters own the foreground, keep their existing sticky title and Done control, show the selected time and town independently of long queries, and preserve scroll and focus through filtering. Global Find remains the shared search surface.

The original 13 dirty Compass files in the user's checkout remain preserved. This release adds no vendors, paid collection, or Responses API integration.

Local verification of the frozen source:

| Check | Result |
| --- | --- |
| Full unit suite | 8,679 passed; two existing skips |
| Node / helper suites | 35 / 57 passed |
| Full typecheck and ESLint | Passed |
| Style, color and stacking checks | Passed |
| Component workshop | 173 passed |
| Production build | Passed with Next.js 16.3.8 |
| Built-app browser acceptance | 120 passed, one worker, zero retries; includes all 51 required UX/accessibility checks |
| Actual runtime Today layout | 15 phone/desktop light/dark checks passed |
| Production dependency audit | Zero vulnerabilities |

The local Map acceptance exercises intentional renderer failure and preserves query, town, return link, and usable recovery controls. One existing healthy-renderer journey was excluded from this local run because the isolated checkout has no Mapbox token. That existing test remains unchanged. The actual production map worked in the baseline review and is checked again after publication. Optional external image requests were blocked by the promoted-data network guard during local acceptance; fallback rendering remained usable.

The source manifest covers 200 changed files against the base and has SHA256 `548936ed4bcc7ba58d538bdf647f3b71c8ce7fdd801334bf407580c3510fa9fc`. The final app source stayed unchanged during its build and browser gates. Two exact caption-contract expectations were corrected after the owner-photo copy pass; the full unit suite then passed on the final test source. Private browser configurations, logs, raw RSS reads and cache backups are excluded from the commit. The manifest and receipts are in `/private/tmp/fr-feedback-release-20261009/`.

The existing tested security fix [#1760](https://github.com/mikedlabs/frederick-radius/pull/1760), at `8df63dd5823ceeb945e89b873a35bd8c072b717d`, is included: Next.js and its matching lint configuration move from 16.3.6 to 16.3.8. The current whole-app release instruction supersedes the earlier cleanup-only scope; this small repair clears the existing release blocker. The production dependency audit reports zero vulnerabilities.

These other branches are not included:

| Work | Why it stays separate |
| --- | --- |
| [#1759 venue collector](https://github.com/mikedlabs/frederick-radius/pull/1759) | Changes collection jobs and the venue snapshot, and still needs post-deployment proof that durable events reach the app. |
| [#1761 source intelligence](https://github.com/mikedlabs/frederick-radius/pull/1761) | Repairs discovery state and budget recovery. It needs a separate recovery run after merge. |
| [#1757 earlier Saved / Day Plan work](https://github.com/mikedlabs/frederick-radius/pull/1757) | Overlaps the candidate's reviewed Saved changes. Combining both implementations would require another integration review. |
| [#1739 competing Today rewrite](https://github.com/mikedlabs/frederick-radius/pull/1739) | Uses a different page structure and event-selection policy, with dependency changes. It is not a small addition to this candidate. |
| [#1774 historical mobile proof](https://github.com/mikedlabs/frederick-radius/pull/1774) | Documents an earlier candidate. Its screenshots and receipts do not verify the October 9 changes. |

The first required browser gate correctly blocked publication: the old weather-order assertion no longer matched the requested priority, the Events test referenced the removed filter-summary element, and a photo-bearing map row was clipped on short phones. The repairs retain actual fold, filter selection/focus, and full-row visibility assertions. Later checks are recorded against the final frozen source, and the initial failures remain preserved.

Publication requires the release PR's required `verify` and `style-lint` checks and resolved review threads. After merge, Vercel owns one production build. Acceptance then checks the deployed metadata and public `/sw.js` against the exact merged SHA, runs the production canary, and reads back Today, County status, Map and Events. The attached release PR and final deployment receipt identify those subsequent results.
