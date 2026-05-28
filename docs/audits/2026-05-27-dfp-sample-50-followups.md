# DFP sample-50 follow-ups — May 27, 2026

Date: 2026-05-27
Author: Michael DeMattia (with Claude Opus 4.7)
Scope: The 5 candidates the [2026-05-27 sample-50 smoke test](2026-05-27-dfp-mash-fixes.md#3-50-record-random-sample--broader-dfp-audit)
flagged for follow-up after the 17 blurb-mash fixes landed.

Follow-up to:
- PR [#337](https://github.com/mikedlabs/frederick-radius/pull/337) — the 17 blurb-mash fixes.

---

## 0. Headline

3 confirmed relocations, 1 no-change-needed (Yelp says address is right, Google's match was a second location), 1 bad-data record flagged as `needs_verification` and repositioned to its real municipality.

The interesting one is **surelocked-in-escape-games** — the relocation was hiding in its own scraped blurb the whole time: `"With only a few days left before we move to 13 E Patrick St"`. That blurb is exactly the kind of signal a smarter scraper could have caught at ingest time. Worth a note for a future ingest-side rule.

---

## 1. Per-record

### Real relocations (3) — `is_verified: false`, geom updated

| Slug | Old → new address | Verification source |
|---|---|---|
| `frederick-gastroenterology-associates` | 310 W 9th St → **7109 Guilford Dr Suite 300** (postal 21701 → 21704) | [fgamd.com](https://www.fgamd.com/) — main office + Endoscopy Center both at the Guilford Dr campus. No mention of 9th St. |
| `frederick-cosmetic-family-dentistry` | 337 W Patrick St → **198 Thomas Johnson Dr Suite 20** (postal 21701 → 21702) | [frederickcosmeticdds.com](https://www.frederickcosmeticdds.com/) — current address listed in contact + footer. |
| `surelocked-in-escape-games` | 220 N Market St → **13 E Patrick St** (same postal) | The DFP blurb itself: `"Less than 26 rooms remaining at 5 N Market in 2026! With only a few days left before we move to 13 E Patrick St…"`. Cross-confirmed by Google Place `ChIJ…` text match in the sample-50 run. |

### No-change (1) — blurb-only refresh

| Slug | Notes |
|---|---|
| `pain-management-massage-studio` | DFP address **205 Broadway St** is correct per [Yelp's Jan 2026 update](https://www.yelp.com/biz/pain-management-massage-and-studio-frederick), [Downtown Frederick Partnership](https://downtownfrederick.org/place/pain-management-massage-studio/), [ClassPass](https://classpass.com/studios/pain-management-massage-and-studio-frederick), and a Facebook post explicitly naming the suite. The 4 McCain Dr address Google's bias-search returned is a *second* location ("Studio 2" per [massagebook](https://www.massagebook.com/search/MD/Frederick/massage-therapy/PainManagementMassageandstudio/) + [Fresha](https://www.fresha.com/lvp/pain-management-massage-studio-llc-mccain-drive-frederick-85qGPY)), not a move. Per the original brief's multi-location rule, the downtown storefront stays as our primary pin. |

### Bad data → needs_verification (1)

| Slug | Action | Reason |
|---|---|---|
| `cranberryjade-services-middletown-md` | `address: "Middletown, MD"`, `municipality: middletown`, geom moved to Middletown centroid (39.4434, −77.5447), postal → 21769, `is_operational → needs_verification` | The DFP `address` field was literally the word `"Frederick"` — not a real address. The business is a small-business media consultancy based in Middletown (per [Facebook](https://www.facebook.com/cranberryjadeservices/)); no fixed retail/office address surfaces in any source. The pin was placed in downtown Frederick despite the slug literally containing "Middletown MD". Now flagged so the trust badge is honest, but kept in the set since `needs_verification` is not hidden by the loader filters. |

---

## 2. Files touched

- `src/data/places-dfp.json` — 5 records patched in place.
- `src/data/places-client.json` — regenerated via `npm run build:client-places`. `surelocked-in-escape-games` (the one record that surfaces on user-visible client surfaces among these 5) reflects the new E Patrick address.
- `scripts/apply-dfp-sample-50-fixes.mjs` — idempotent patch script.

---

## 3. Process notes

- This pass cost **0 net Google Places calls** — all verification was via venue websites + already-collected sample-50 output + Yelp/BBB/Downtown Frederick Partnership.
- The `surelocked-in-escape-games` find is a small but interesting result: the relocation announcement was in the blurb-mash itself. A scraper-side rule that looks for `\bmove(?:d)? to\s+([\dA-Z][^,.]+)` could surface these at ingest time, before the bad address ever lands in the DFP set. Cheap follow-up idea, not in this PR.
- Adjusted "real address-issue" rate from yesterday's sample-50 (3 confirmed relocations + 1 invalid + 1 false positive) = ~10 %. Still above the 5 % threshold; a broader sample-200 with stricter accept criteria is still recommended (separate work).
