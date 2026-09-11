# Fair admission and schedule correction

Reviewed September 9, 2026 against the official visitor page, schedule page,
and public calendar. The reported screenshots were from the older production
release, not the queued candidate.

- Single advance gate admission is $10 online; gate admission is $15.
- The $80 Blue Ribbon Bundle includes 10 admissions. It now has a direct,
  visible link in the ticket drawer.
- The unsupported $8 opening-Friday admission and its purported sales cutoff
  have been removed from canonical offers, the group calculator, and stories.
- Children age 10 and under remain free.

## Schedule coverage

The calendar feed still contains the previously imported 190 rows. The live
visitor schedule differs. Its nine public Fair-day tables contain 188 nonempty
rows, all included in the new pack. Promotions removed from table headers remain
in the separately verified admission offers where the visitor information page
still lists them. Pre-fair exhibitor intake and September 27 exhibit pickup are
outside the September 18–26 visitor planner; the official schedule remains linked.

The reviewed page snapshot preserves source URL, publisher modification time,
retrieval time, and table HTML. The calendar fixture remains unchanged for gate
hours and recurrence validation. The pack builder explicitly chooses the reviewed
visitor-page program; it does not silently refresh data during a production build.

Material corrections include Chris Kirkpatrick in the September 19 lineup,
PeeWee/Open Class Dairy Showmanship at 5:30 p.m. September 20, the beef fit-out
contest at 4 p.m. September 22 instead of September 24, the September 22 Cars
derby description, STEM presenter attribution, livestock-sale detail, and Chris
Darlington as the September 26 opener. Unknown opener information stays unknown.
The current visitor page and schedule both list the Tuesday Carload Special at
$60; it is distinct from the $80 admission bundle.

## Release size allowance

The previously approved 1,881,518-byte real aerial blocked the queued release
because it lacked an explicit repository asset classification. It now has a
1,900,000-byte deployment snapshot cap. The total budget increases by 3 MB to
cover this asset, its evidence, and the immutable corrected pack. The default
large-file cap and category budgets are unchanged. No unrelated files were
removed.

Sources:
- https://thegreatfrederickfair.com/come-to-the-fair/
- https://thegreatfrederickfair.com/schedule/
- https://calendar.google.com/calendar/ical/gffcal%40gmail.com/public/basic.ics

## Local verification

The corrected candidate passed 7,532 unit tests (two intentional skips),
TypeScript, changed-file lint, the public-copy style gate, and the repository
size gate. The 50 usability/accessibility browser checks passed. Program map
coverage now checks all 147 rows with published locations. Live row-by-row
comparison found no substantive text or time differences across the 188 visitor
schedule rows; the only residual formatting difference was a space before a
bullet. Production verification is separate from these local checks.
