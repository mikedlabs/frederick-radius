# Intent coverage scorecard

Town-by-intent coverage using the same multi-role matcher as Today and Nearby.
Counts include published places after overrides, deduplication, municipality
claiming, status suppression, and seasonal filtering. Regenerate with
`npm run coverage:intents`.

_Generated 2026-07-25 — 1616 published places, 20 user intents._

| Town | Population | All places | Food | Coffee | Drinks | Parks | Grocery | Shops | Zero-result intents | One-result intents |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Frederick City | 78,171 | 854 | 91 | 24 | 38 | 38 | 18 | 370 | — | Wineries, Golf |
| Brunswick | 7,281 | 97 | 13 | 3 | 3 | 25 | 1 | 10 | Wineries, Wine & liquor, Golf, Farms & PYO, Family fun, Movies, Salons & barbers | Breweries, Live music, Grocery, Pools |
| Thurmont | 6,762 | 117 | 18 | 2 | 3 | 26 | 1 | 14 | Movies, Pools | Breweries, Ice cream, Golf, Grocery, Wellness |
| Middletown | 4,628 | 85 | 12 | 4 | 3 | 16 | 1 | 8 | Breweries, Movies, Pools | Wine & liquor, Golf, Live music, Grocery, Art, Family fun, Stay |
| Walkersville | 6,215 | 87 | 12 | 1 | 3 | 12 | 1 | 16 | Breweries, Golf, Movies, Stay | Coffee, Wineries, Grocery, Family fun, Pools, Salons & barbers |
| Emmitsburg | 2,886 | 60 | 7 | 2 | 0 | 6 | 1 | 7 | Drinks, Wineries, Breweries, Golf, Family fun, Movies, Salons & barbers | Ice cream, Live music, Grocery, Pools, Stay |
| New Market | 1,563 | 79 | 8 | 4 | 1 | 13 | 0 | 7 | Breweries, Ice cream, Grocery, Movies, Pools, Salons & barbers | Drinks, Wineries, Wine & liquor, Live music, Family fun |
| Mount Airy | 9,852 | 67 | 13 | 4 | 6 | 11 | 1 | 7 | Wine & liquor, Golf, Live music, Movies, Pools, Salons & barbers | Farms & PYO, Grocery, Family fun, Stay |
| Myersville | 1,834 | 56 | 3 | 1 | 1 | 20 | 1 | 4 | Breweries, Wine & liquor, Farms & PYO, Art, Family fun, Movies, Pools, Salons & barbers, Stay | Coffee, Drinks, Wineries, Ice cream, Golf, Grocery |
| Woodsboro | 1,140 | 42 | 1 | 0 | 2 | 7 | 1 | 9 | Coffee, Wineries, Golf, Live music, Family fun, Movies, Pools, Salons & barbers, Stay | Food, Breweries, Wine & liquor, Grocery, Wellness |
| Burkittsville | 142 | 37 | 1 | 0 | 1 | 10 | 0 | 5 | Coffee, Breweries, Wine & liquor, Golf, Live music, Grocery, Movies, Pools, Salons & barbers, Wellness, Stay | Food, Drinks, Wineries, Ice cream, Family fun |
| Rosemont | 272 | 4 | 0 | 0 | 0 | 1 | 0 | 0 | Food, Coffee, Drinks, Wineries, Breweries, Wine & liquor, Ice cream, Golf, Farms & PYO, Live music, Shops, Grocery, Art, Family fun, Movies, Pools, Salons & barbers, Wellness | Parks, Stay |
| Urbana | 13,304 | 31 | 11 | 4 | 2 | 6 | 1 | 2 | Wineries, Breweries, Wine & liquor, Movies, Pools, Salons & barbers, Stay | Golf, Farms & PYO, Live music, Grocery, Family fun, Wellness |

## Core gaps

- Emmitsburg: Drinks
- New Market: Grocery
- Woodsboro: Coffee
- Burkittsville: Coffee
- Burkittsville: Grocery
- Rosemont: Food
- Rosemont: Coffee
- Rosemont: Drinks
- Rosemont: Grocery
- Rosemont: Shops

> Zero does not always mean a missing business. In very small towns it may be
> an honest absence. It always means the UI needs a helpful nearby fallback.
