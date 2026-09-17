# Great Frederick Fair 2026 map truth review

Checked: 2026-09-04 UTC

This review covers the public Fair map facts that Radius adds to its reviewed
OpenStreetMap geometry. It does not treat a schematic publisher map as
survey-grade geometry. The Fair says its schedule may change without notice,
so on-site signs and official updates remain authoritative.

## Current source evidence

| Source | Checked fact | Radius use |
| --- | --- | --- |
| [The Great Frederick Fair: Plan Your Visit](https://thegreatfrederickfair.com/plan-your-visit/) | Gate 3 infield parking is $15 and accepts cash or credit. Lots A, B, C, and D are $10 cash only. The page supplies official entrance pins and says county Transit is free to ride. | Parking entrance points, price and payment details, and source links. |
| [The Great Frederick Fair: FAQ](https://thegreatfrederickfair.com/faq/) | Gate 4A is the rideshare and friend drop-off area. Gate 3 serves special-needs vehicles. Special-needs unloading is permitted outside Gate 1, Gate 4A, or Building 15. A free ADA-compliant shuttle runs from the Monocacy Boulevard side of Lot D to Gate 4A. The page also documents Family Care, restroom changing stations, and the grandstand ASL-interpreter viewing area. | Accessible arrival annotations, Gate 4A detail, Family Care, restrooms, and grandstand accessibility detail. |
| [The Great Frederick Fair: Guest Services](https://thegreatfrederickfair.com/guest-services/) | Visitor centers have volunteers and schedules. Mobility scooters, wheelchairs, strollers, wagons, and push cars are first come between Buildings 12 and 13; published prices and the driver's-license requirement are current. | Mobility-rental search terms and published-area detail. |
| [2026 Schedule of Events brochure](https://thegreatfrederickfair.com/wp-content/uploads/2026/08/2026-GFF-SoE_website.pdf) | The current grounds map labels Gate 4 as exit only, Gate 5 as exhibitors only, Gate 6 as closed, and Gate 4A as pedestrian only. It labels Buildings 3, 9, 12, 13, and 15, the Free Stage, First Aid, and information booths. PDF SHA-256 at review: `0c8ea6678908514ddd389e1100f73cf09e920aec7b668b75e975ac25863791f3`. | Gate restrictions, official public names and aliases, and schematic service-area evidence. |
| [2026 Vendor Guide](https://thegreatfrederickfair.com/wp-content/uploads/2026/03/Vendor-Guide-2026.pdf) | First Aid is next to Building 15, inside Gate 3, and is open during Fair hours. | First Aid published-area result. |
| [Official 2026 EventHub guide](https://mobile.eventhub-floorplan.net/?Show_ID=18209) | The official Fair vendor page currently links Show ID 18209 for the September 18 through 26, 2026 Fair. It exposes a floorplan, exhibitors, schedule, and sponsors. | Viewable cross-check only. Radius does not trace, scrape into this map, rehost, or reproduce its artwork or vendor pins. |
| [Frederick County Transit Services](https://www.frederickcountymd.gov/105/Transit-Services), [Shuttle Schedules](https://www.frederickcountymd.gov/200/Shuttle-Schedules), and [Connector Schedules](https://www.frederickcountymd.gov/199/Connector-Schedules) | Transit is fare free. County buses have lifts or ramps. The East Frederick Shuttle page remains current, and the 15 Connector schedule is marked effective July 6, 2026. | Provider and accessibility context. Radius still does not claim that the walk from a stop is step free. |
| [Current Frederick Transit static GTFS](https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip) | Snapshot downloaded 2026-09-04. Feed window is September 3 through October 4, 2026. ZIP SHA-256: `550a04b4ad2aca909dc0a0dbc238f9fa0f4d63a1148edc4e217af7d8307de3ed`. Five nearby stops remain present at the same coordinates. | Static stop points and Fair-week timetable statements. |
| [OpenStreetMap API extract](https://api.openstreetmap.org/api/0.6/map?bbox=-77.401%2C39.409%2C-77.389%2C39.418) | Snapshot SHA-256: `eb5f3bbb245b6aa8ba357f032df718c07af2e559e91c2c5b963b633e10c23c5a`. Re-materialization produced the same 44 reviewed features and the same feature content as the September 2 artifact; only the review date and source snapshot hash changed. | ODbL base geometry, feature anchors, and direct OSM attribution links. |

## Transit timetable evidence

The current GTFS calendar makes the East Frederick Shuttle weekday service
active during the Fair. A second nominal all-days service is explicitly removed
for every September 2026 date in `calendar_dates.txt`, so Radius does not claim
weekend East Frederick Shuttle service.

| Stop | Route | Current published departures used by Radius |
| --- | --- | --- |
| `163112`, Monroe Avenue across from FCC Monroe Center | East Frederick Shuttle | Seven weekday departures, 9:05 AM through 5:05 PM. The previous 6:05 PM statement was not present in the current feed and was removed. |
| `163103`, Monroe Avenue at FCC Monroe Center | East Frederick Shuttle | Weekday departures, 8:20 AM through 5:20 PM. |
| `163111`, Monocacy Boulevard at Bucheimer Road | East Frederick Shuttle | Seven weekday departures, 9:02 AM through 5:02 PM. |
| `162919`, East Patrick Street at Hamilton Avenue | 15 Connector | Hourly weekday departures, 6:18 AM through 9:18 PM. |
| `162918`, East Patrick Street at Fairground Center | 15 Connector | Hourly weekday departures, 6:17 AM through 9:17 PM. |

The East Frederick Shuttle trips reference the two East Patrick Street stops,
but their GTFS stop times are blank there. Radius therefore does not present
East Frederick Shuttle departure times at those stops.

## Precision and routing rules

- Gate 4, Gate 5, and Gate 6 retain their reviewed OSM anchors. They appear in
  the arrival view because knowing which gates cannot be used prevents a bad
  arrival. Directions are disabled for all three.
- First Aid is represented as a `published-area` result at the reviewed Building
  15 restroom anchor. Information booths are represented as `published-area`
  results at the reviewed Gate 4A and Administration anchors. These anchors make
  the services searchable without presenting schematic artwork as exact GPS.
  Directions are disabled, and the interface says to follow on-site signs.
- Official parking pins remain the only non-OSM Fair features with direct
  routing enabled. Static county transit stops may open external directions,
  but Radius explicitly says it has not verified the walking route or step-free
  access.
- Buildings 3, 9, 12, 13, and 15 and the Free Stage use official 2026 labels and
  schedule aliases in the enrichment layer. The OSM snapshot remains unchanged
  apart from its review metadata.
- Administration and the Building 12 mobility-rental area are included in the
  essentials view. This makes Family Care, Security, lost-and-found help, and
  mobility rentals discoverable without making users browse the full building
  directory.

## Claims deliberately not made

- No live parking availability, queue time, gate status, or Lot D shuttle ETA.
- No guarantee that a route is accessible, passable, or the safest path today.
- No exact GPS claim for First Aid or information booths.
- No EventHub vendor locations or publisher artwork copied into Radius.
- No inference that a route serves a stop when its current GTFS time is blank.

## Reproduction and release checks

The OSM artifact can be rebuilt with the repository's materializer after a
fresh API download:

```sh
npm run fair:map:materialize -- \
  --input /path/to/fairgrounds.osm \
  --output public/data/fair/great-frederick-fair-2026-map.geojson \
  --reviewed-on 2026-09-04
```

Before release, run the grounds-map unit contract, TypeScript, focused lint,
and the Fair map browser suite. Then verify the public production revision and
repeat the Fair map search for `First Aid`, `Gate 4`, `Building 13`, and the
five nearby transit stops.
