# Frederick Radius — Find Taxonomy (data-grounded)

> The names a user navigates: **main lanes** → **subcategories** → cross-cutting
> **lenses**. Every name + count below is derived from the live dataset
> (`places-client.json`, 1,675 places, 30 raw category slugs) — not invented.
>
> **The honest rule that shapes everything:** subcategory detection is partial.
> Many business names carry no category keyword (190/237 shops, 177/273
> wellness are "unclustered" by name). So subs are **optional refinement chips
> that only appear when they have real members**, and every lane always offers
> **"All <lane>."** Never a rigid tree that hides places.

## The workflow (layout)

1. **Pick a lane** — the clean grid (The Radius, clean direction).
2. **It narrows in place** — the lane's sub-chips + the lenses appear as a
   *combinable refine rail above the results* (no full-screen jump). Results
   update live. "All <lane>" is always the default.
3. **Tap a result → it expands inline** (accordion) to the quick answer
   (open/closing, distance, why, photos, Directions/Save) with a **"Full
   details"** link to the deep sheet — not a disorienting takeover.

## Main lanes (12) + subcategories

| # | Lane | ~count | Subcategories (shown when populated) | Sub source |
|---|------|-------:|--------------------------------------|------------|
| 1 | **Eat** | ~215 | Sit-down · Pizza · Food trucks · Bakeries* · *cuisines:* American · Italian · Asian & sushi · Mexican · Seafood · BBQ · Breakfast & brunch · Indian · Mediterranean | category + cuisine classifier (name/blurb) |
| 2 | **Drinks** | ~99 | Breweries & taprooms · Wineries & cideries · Bars & pubs · Distilleries | category + name regex |
| 3 | **Coffee** | ~90 | Cafés & roasters · Bakeries · Tea | category |
| 4 | **Outdoors** | ~171 | Parks · Trails & towpaths · Playgrounds · Gardens · Water & creek | category + name |
| 5 | **Shops & makers** | ~322 | **Fashion & boutiques** · Vintage & thrift · Home & garden · Gifts · Books · Jewelry · Makers & artisan · Grocery & specialty food · Markets | subcategory field (`clothes`, `boutique`, `thrift_store`, `gift`, `jewelry`) + name |
| 6 | **Arts & culture** | ~98 | Galleries · Museums · Theaters · Live-music venues · Public art | category |
| 7 | **Family** | ~96 | Playgrounds · Libraries · Kid-friendly museums · Parks · Classes & camps | category + tags |
| 8 | **Wellness & self-care** | ~285 | Yoga & pilates · Gyms & fitness · Spas & massage · Hair & barbers · Nails · Skin & lashes · **Chiropractic & therapy** | category + name regex (spa 26, hair 25, chiro 23, gym 22) |
| 9 | **Stay** | 42 | Hotels · Inns & B&Bs | category + name |
| 10 | **Dispensaries** | ~6 | — (small set; browse all) | category fix (currently miscategorized) |
| 11 | **Faith & worship** | 167 | All (denomination not reliably structured — browse the list) | category |
| 12 | **Civic & services** | ~110 | Libraries · Government · Public safety · Voting · Pharmacies · Post & shipping | category |

\* Bakeries appear under both Coffee (morning ritual) and Eat (sweets) — the
same place can match two lanes; that's intentional, not a bug.

### Deliberately NOT a discovery lane
**Everyday services** (auto repair 11, banks 5, laundromats) — utilitarian,
low discovery value. Reachable via **search + map**, not given a lane tile.
(Pharmacies are the exception — they live under Civic & services.)

## Cross-cutting lenses ("Or by the moment")

These cut **across** lanes (tag/signal-based, honest — only surface tagged
members): **Open now · Near me · Date night · With kids · Dog-friendly · Patio
& outdoor · Live music · Local favorites · Free · Rainy day.**

## Honest data gaps (worth closing later)
- **Fashion** is real but thinly tagged (~13 by name, 10–14 via the `clothes`/
  `boutique` subcategory field) — undercounts the downtown boutique scene.
  Better tagging (or a curated set) would let it graduate from sub to lane.
- **Subcategories field** is only ~13% populated — the richest sub signal is
  underused; an ingest pass to fill it would sharpen every lane's chips.
- **Cuisine** reaches ~40% of food by name+blurb; the rest sit under "All."
