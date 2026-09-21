# Fair PDF coverage review, September 21, 2026

## Source and scope

Source: [The Great Frederick Fair 2026 Schedule of Events](https://thegreatfrederickfair.com/wp-content/uploads/2026/08/2026-GFF-SoE_website.pdf).
The downloaded PDF has 24 pages and August 25, 2026 metadata. Pages 12 and 13
were rendered and visually reviewed as a two-page grounds map. The complete
extracted text was compared with the promoted Fair pack and map overlays.
This is a coverage audit, not a claim that the PDF has been fully imported.

Baseline: main revision `1fdf43c7`, before this branch's changes. The promoted
pack is `sha256:3076104cfce3b3cd30e4a5501fdc64a735755390f69d3d2d99e905208b105e6d`.
It contains 188 rows across September 18–26, from the official schedule's
August 28 source revision. Daily row counts are 11, 23, 28, 19, 21, 21, 24,
22, and 19. These include opening hours and utility rows, not just performances.

## Ground-map corrections in this branch

- Pages 13–14 place Funky Joe's Bandwagon / Free Stage in the Resthaven area
  between Home Arts & Crafts (Building 9) and Youth Indoor Exhibits (12).
  The baseline incorrectly renamed the infield stage polygon
  `osm-way-307321838` to Free Stage. Its original footprint is retained as
  Grandstand stage; a separate published-area point now reuses Building 9's
  reviewed anchor, has no directions, and explains the location in text.
- Page 13 marks Gate 2 pedestrian-only. This restriction is now present.
  Pedestrian-only labels for Gates 1 and 4A, Gate 4 exit-only, Gate 5
  exhibitors-only, and Gate 6 closed are now visible in names. The latter
  three restrictions were already in baseline details and already had
  directions disabled. Gate 4A's reviewed drop-off and shuttle facts remain.
- Pages 12–13 identify Dairy Office 31 and Milking Parlor 43. Their matching
  existing geometry now has numbered names and search aliases. Dairy Barns
  33–39 remain one honestly labeled mapped area, not seven invented footprints.
- Only the PDF map source review time is refreshed to September 21.
  Parking, FAQ, rental, transit, and OSM source dates are not advanced.

## Remaining map gaps

The baseline has 44 geographic features plus 12 reviewed additions. This
branch adds the separate Free Stage area. Neither count means complete PDF
map coverage. Remaining named items on pages 12–13 without dedicated reviewed
grounds features include:

- Gate 3A (pedestrians only), Lot E (livestock exhibitor parking only), Lots Q
  and R. The PDF does not establish general visitor eligibility for Q or R.
- Kid Zone, Cowboy Circus, Grand Rental Events Stage, RC racing, Amazon Think
  Big, Public Eatery, Birthing Center, It's Fiber, and Milky Way.
- Individual Commercial Exhibits 7/8, Box Office 2, Maintenance 11, and the
  unseparated sheep/goat and dairy building footprints.
- Searchable internal-road areas for Machinery Row, Grange, Concession Way,
  Music Row, Welcome Way, and Midway.
- ATMs and the souvenir shop. Security and Family Care are primarily described
  in Administration's details rather than independent visitor-service results.
  Two information-area results do not capture all three published locations.

Use known building anchors for clearly labeled area references when useful.
Do not derive exact GPS entrances, walking routes, or booth footprints from
the schematic artwork. Recheck source ambiguity before adding new geometry.

## Program gaps at baseline

The main daily tables on pages 6–11 and 14–15 are broadly represented. The
following supplemental information was not in the structured 188-row pack:

| PDF pages | Confirmed gap at baseline |
| --- | --- |
| 14, 20–21 | 43 Funky Joe's music slots. The grid has 44 occupied slots; Faith at the Fair is the one already represented. |
| 18–20 | All nine character-visit windows. |
| 19–20 | Bluey at Building 9, September 23–25, 1–3pm. |
| 18–19, 21 | Individual times for Agricadabra, Baby Dino, Foam Pop Up Party, RC tournaments, Comedy Hypnosis, Team T&J, and Mr. Jon. |
| 19–21 | Strolling-attraction details, Wood Mobile / Woodmizer dates, and other attraction descriptions. |
| 5, 15 | Pre-Fair entry/drop-off events and September 27 exhibit/livestock release times, outside the current nine-day visitor model. |
| 16–17 | Souvenir-shop hours, the public Wi-Fi network name, and additional guest-service details are not fully structured. |

At baseline the Kid Zone filter exposes general opening-hours rows and the
September 25 STEM Showcase, not the detailed family timetable.

The local branch now adds 55 separately sourced rows: 43 music slots, three
Bluey windows, and nine character visits. Together with the unchanged 188-row
promoted pack, the workspace presents 243 rows. Focused automated checks
confirm that all 193 rows with a published map place resolve to exactly one
reviewed feature. All 43 added music slots resolve to Funky Joe's published
area, and all three Bluey windows resolve to Building 9. The nine strolling
character visits intentionally have no map pin because the PDF does not give
a fixed meeting point. Their date, time, and source remain available.

These are verified local changes, not a claim that they are live or that the
full PDF is imported. Timed family shows, the other program gaps above, and
the remaining map gaps still require separate source review and implementation.

## Source conflicts, not automatic correction instructions

- Page 11 puts Youth Beef Fit Out at September 24, 11am; the imported official
  schedule has September 22, 4pm. Do not silently promote either as a correction.
- Page 9's Tuesday main table says Trucks & Vans, while page 3's Grandstand
  section distinguishes Cars from Trucks & Vans. The imported official
  schedule lists Cars Tuesday and Trucks & Vans Wednesday.
- Pages 3 and 11 name Bay Turner as Danny Gokey's opener; the current reviewed
  display adapter still says TBA. Pages 2 and 6 name Daughtry's opening acts;
  the adapter says the opener is not named in its imported row.
- Page 7's POP 2000 billing names Jeff Timmons, whereas the imported schedule
  and display adapter name Chris Kirkpatrick. The imported source revision is
  later than the PDF metadata, so publication order alone is not resolution.
- Pages 18 and 20 include opening-Friday character/Kid Zone times before the
  4pm admission start. These require an explicit source caveat or reconciliation,
  not invented public access hours.

## Usability baseline

Program search was selected-day-only literal substring matching. A valid
event on another date therefore looked missing. The next release should
verify cross-day search independently from new-data coverage, preserve source
links and uncertainty, and connect each scheduled stop to its reviewed place
or clearly labeled area. Avoid presenting an incomplete import as the full PDF.
