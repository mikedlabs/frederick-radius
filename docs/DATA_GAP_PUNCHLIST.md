# Data gap punch-list — net-new places to ingest

Source: data-completeness audit (July 2026) comparing our dataset against
what a Google/Yelp/AllTrails search returns, across food, drinks, cafes, and
outdoors. Every name below was web-verified as **real and currently open**
(closed names were deliberately excluded — see the tail).

## STATUS — most of this is now SHIPPED

The food and cafe/sweets gaps below were added as curated records with real
Nominatim-geocoded coordinates (PRs #1309, #1310) — 23 places: every restaurant
and cafe in the two tables, plus Mariachi and Sugarloaf Mountain. Fixes to
existing records shipped in #1307 (BackSlash Burger rename, Cafe Nola coffee
tag, Urbana District Park town). The tables are kept as the provenance record;
the enrichment pass can later replace the manual coords with Google ratings,
hours, and photos, but discovery already works today.

Verified as ALREADY covered (no action): the entertainment vertical — The
Boulder Yard (climbing), Urban Air (trampoline), Adventure Park USA, Spinners
(arcade), bowling and escape rooms are all present under the family-fun tag.
Smoketown Creekside (closed) was never in our data; we carry only the open
Brunswick location.

STILL OPEN: the marquee trail geometry (see Outdoors), which wants real GIS
polylines, not point records.

## Food (weighted to Indian + sit-down Japanese — our thinnest verticals)

| Name | Town | Cuisine / note | Address |
|---|---|---|---|
| Cugino Forno | Frederick | Neapolitan wood-fired, ~205 reviews (top pizza gap) | 1705 N Market St |
| White Rabbit Gastropub | Frederick | Detroit pizza + top-5 burger | downtown |
| dōp Pizza | Frederick | wood-fired, inside RAK Brewing | (RAK Brewing) |
| Big Papi's – Real Good Tacos | Frederick | Mexican, 320+ reviews | 5711 Industry Ln |
| Fajita Grande | Frederick | Mexican | 5 Willowdale Dr |
| Mariachi | Frederick | Mexican, live band | — |
| Miyako Japanese Steak & Seafood | Frederick | hibachi/sushi, since 2001 | 1005 W Patrick St |
| Matsutake Sushi & Steak | Frederick | hibachi, since 2005 | Westview Promenade |
| Sushi Nomu | Frederick | modern sushi/ramen | 4969 Westview Dr |
| The Mint Room | Frederick | Indian | 221 Shorebird St |
| Bawarchi | Frederick | Indian/biryani | 5010 Buckeystown Pike |
| Andaz Modern Indian Cuisine | Frederick | Indian | 1020 Mill Pond Rd |
| Aroma Indian Palace | Frederick | Indian | — |
| Saffron Grill & Bar | Frederick | Indian | — |
| Mangia e Bevi | Urbana | Italian, since 2007 | 8927 Fingerboard Rd |
| Pho & More | Frederick | Vietnamese | 5215 Presidents Ct |
| Thai Table | Frederick | Thai | — |
| My Thai | Frederick | Thai | 193 Thomas Johnson Dr |

## Cafes & sweets

| Name | Town | Category | Address |
|---|---|---|---|
| Fractured Prune | Frederick | bakery (hand-dipped donuts) | 1202 E Patrick St |
| Clustered Spires Pastry Shop | Frederick | bakery (custom/wedding) | 285 Montevue Ln |
| Nothing Bundt Cakes | Frederick | bakery | 5597 Spectrum Dr |
| Kulfi Ice Creams | Frederick | ice-cream (Indian kulfi/custard) | 5241 Buckeystown Pike |
| ChocoSombra | Frederick | coffee roaster (B2B, low priority) | 5703 Industry Ln |

## Drinks — essentially complete (verify, don't add blindly)

- **Brewer's Alley** already carries a `brewery` subcategory, so it surfaces
  in brewery discovery. If the Beer page filters strictly on
  `category === "brewery"`, add it there too.
- **Smoketown Creekside** (400 Sagner Ave): Yelp marks CLOSED Apr 2026.
  Verify; drop from any list if confirmed dead.

## Outdoors — marquee named hikes (state/NPS land, hand-enrich from Geo-PDFs)

| Name | Note |
|---|---|
| Sugarloaf Mountain / Northern Peaks Trail | No park OR trail entry today — biggest single gap |
| Cunningham Falls (waterfall) + Lower Trail + Cliff Trail | We have the state-park container, not the falls destination |
| Catoctin National Recreation Trail | 27–28 mi blue-blaze spine |
| Gambrill: Black Locust Trail + Yellow Poplar Trail | Named loops people search by name |
| C&O Canal towpath (Brunswick ↔ Point of Rocks) | Through-trail line geometry |

### GIS feeds for a richer /trails map (geometry, length, blaze, difficulty)
- Frederick County ArcGIS: `maps.frederickcountymd.gov/arcgis/rest/services/FeatureServices/Trails_CTC/MapServer`; portal `gis-fcgmd.opendata.arcgis.com`
- City of Frederick GIS open data (Baker Park, Carroll Creek, city trails)
- MD DNR: `data.imap.maryland.gov` (tags=trail → GeoJSON); AIMSTrailBlazes MapServer (blaze color per segment); per-park Geo-PDFs
- NPS: Catoctin Mountain Park + C&O towpath centerline (NPS open-data hub)
- AllTrails: no free geometry API (ToS) — reference only, hand-key attributes

## Deliberately EXCLUDED — closed, do NOT add (Google/Yelp still list these)
VOLT · Thacher & Rye (now "The Ordinary Hen") · Renzi's Wood Fired (Walkersville)
· Padmini's Curry Grill · Idiom Brewing (closed Feb 2026) · Flying Dog · Jug
Bridge Brewery · House Cat Brewing · Guido's Speakeasy (→ Spacie Gracie) ·
Firestone's (→ Fire & Oak). Pruning these is where we already beat Google.
