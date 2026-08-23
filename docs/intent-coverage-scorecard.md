# Intent coverage scorecard

Town-by-intent coverage using the same multi-role matcher as Today and Nearby.
Counts include published places after overrides, deduplication, municipality
claiming, status suppression, and seasonal filtering. Regenerate with
`npm run coverage:intents`.

_Generated 2026-08-22 — 1567 published places, 20 user intents._

| Town | Population | All places | Food | Coffee | Drinks | Parks | Grocery | Shops | Zero-result intents | One-result intents |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Frederick City | 78,171 | 851 | 104 | 22 | 38 | 39 | 18 | 175 | — | Wineries, Golf |
| Brunswick | 7,281 | 97 | 13 | 3 | 3 | 25 | 1 | 10 | Wineries, Wine & liquor, Golf, Farms & PYO, Family fun, Movies, Salons & barbers | Breweries, Live music, Grocery, Pools |
| Thurmont | 6,762 | 110 | 18 | 1 | 3 | 25 | 1 | 13 | Movies, Pools | Coffee, Breweries, Ice cream, Golf, Grocery, Wellness |
| Middletown | 4,628 | 85 | 12 | 4 | 3 | 16 | 1 | 8 | Breweries, Movies, Pools | Wine & liquor, Golf, Live music, Grocery, Art, Family fun, Stay |
| Walkersville | 6,215 | 86 | 12 | 1 | 3 | 11 | 1 | 16 | Breweries, Golf, Movies, Stay | Coffee, Wineries, Grocery, Family fun, Pools, Salons & barbers |
| Emmitsburg | 2,886 | 57 | 7 | 2 | 0 | 5 | 1 | 6 | Drinks, Wineries, Breweries, Golf, Family fun, Movies, Salons & barbers, Stay | Ice cream, Live music, Grocery, Pools |
| New Market | 1,563 | 75 | 8 | 4 | 1 | 12 | 0 | 7 | Breweries, Ice cream, Grocery, Art, Movies, Pools, Salons & barbers | Drinks, Wineries, Wine & liquor, Live music, Family fun |
| Mount Airy | 9,852 | 63 | 12 | 4 | 6 | 10 | 1 | 6 | Wine & liquor, Golf, Live music, Movies, Pools, Salons & barbers | Farms & PYO, Grocery, Family fun, Stay |
| Myersville | 1,834 | 46 | 3 | 1 | 0 | 14 | 1 | 4 | Drinks, Breweries, Wine & liquor, Ice cream, Farms & PYO, Art, Family fun, Movies, Pools, Salons & barbers, Stay | Coffee, Wineries, Golf, Grocery |
| Woodsboro | 1,140 | 36 | 1 | 0 | 1 | 3 | 1 | 8 | Coffee, Wineries, Breweries, Golf, Live music, Family fun, Movies, Pools, Salons & barbers, Stay | Food, Drinks, Wine & liquor, Grocery, Wellness |
| Burkittsville | 142 | 30 | 0 | 0 | 1 | 8 | 0 | 4 | Food, Coffee, Breweries, Wine & liquor, Golf, Live music, Grocery, Family fun, Movies, Pools, Salons & barbers, Wellness, Stay | Drinks, Wineries, Ice cream |
| Rosemont | 272 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Food, Coffee, Drinks, Wineries, Breweries, Wine & liquor, Ice cream, Parks, Golf, Farms & PYO, Live music, Shops, Grocery, Art, Family fun, Movies, Pools, Salons & barbers, Wellness | Stay |
| Urbana | 13,304 | 29 | 11 | 4 | 2 | 4 | 1 | 2 | Wineries, Breweries, Wine & liquor, Movies, Pools, Salons & barbers, Stay | Golf, Farms & PYO, Live music, Grocery, Family fun, Wellness |

## Core gaps

- Emmitsburg: Drinks
- New Market: Grocery
- Myersville: Drinks
- Woodsboro: Coffee
- Burkittsville: Food
- Burkittsville: Coffee
- Burkittsville: Grocery
- Rosemont: Food
- Rosemont: Coffee
- Rosemont: Drinks
- Rosemont: Parks
- Rosemont: Grocery
- Rosemont: Shops

> Zero does not always mean a missing business. In very small towns it may be
> an honest absence. It always means the UI needs a helpful nearby fallback.
