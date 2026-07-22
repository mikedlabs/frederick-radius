# Frederick Radius brand assets

Frederick Radius Brand System 1.2 - July 22, 2026

These files are generated from `src/lib/brand.ts`. Run `npm run build:brand` after changing the brand contract or asset templates.

## Brand contract

- Frederick Radius uses the tagline `Frederick County starts where you are.`
  Its plain-language description is `Current local information for Frederick
  County, organized around where you are.`
- Brick `#B5462B`, Cream `#F4EEE2`, Ink `#221C15`, the solid Ripple, and owned
  Frederick photography form the recognition system.
- Catoctin Forest `#315A43` is a restrained outdoor, terrain, or small
  positive-state cue. It is not a generic selected color or page theme.
- Creek `#285D73` organizes civic, map, transit, and data information. Plum
  `#7E2C6F` is a limited culture accent.
- Catoctin Forest carries the open state. Ochre Amber `#C58A32` is used for a
  real live, caution, or sunlight state with Ink text. Beer is the product
  exception: it also marks active
  taste controls, flagship beers, and beer or brewery metadata. It is not a
  decorative yellow or a page theme.
- Libre Caslon Display Regular is reserved for the wordmark and rare editorial
  or hero moments. Public Sans is the product-title, body, interface, and data
  face. The kit includes Public Sans Variable upright and italic. Do not add a
  third typeface or synthesize a bold or italic Caslon cut.

The current color and type tokens are in `tokens.json` and `tokens.css`. The
build locks the current core colors and font families, checks the guide names,
and rejects unapproved colors in authoritative guidance or exported SVGs.

## Fonts

- `fonts/LibreCaslonDisplay-Regular.ttf`: installable Libre Caslon Display
  Regular 400 for the wordmark and rare editorial or hero moments.
- `fonts/PublicSans-Variable.ttf`: installable Public Sans upright, weights
  100-900, for product titles, interface, text, and data.
- `fonts/PublicSans-VariableItalic.ttf`: installable Public Sans italic,
  weights 100-900, for real emphasis and attribution.
- `fonts/static/`: compatibility cuts for Regular 400, Medium 500, SemiBold
  600, and Bold 700, with matching italics. Install these only when the design
  application does not support variable fonts.
- `fonts/libre-caslon-display-400.woff2`,
  `fonts/public-sans-variable.woff2`, and
  `fonts/public-sans-variable-italic.woff2`: matching browser files.

See `fonts/README.md` for installation, exact upstream commits, and usage. The
`fonts/static/` folder provides 400, 500, 600, and 700 upright and italic cuts
for software without variable-font support. Install the Public Sans variable
pair or the static set, not both. The corresponding SIL Open Font License 1.1
files are in `licenses/`.

## Marks

- `ripple-full-*`: Use at 48 px and larger.
- `ripple-compact-*`: Use from 24 px through 47 px.
- `ripple-favicon-*`: Use below 24 px.
- `ripple-full-cream-tile`: Use for app icons and large avatar tiles.

## Lockups

- `horizontal-brick`: Primary lockup on light surfaces.
- `horizontal-cream`: Reverse lockup on Brick, Catoctin Forest, Ink, or a dark photograph.
- `descriptor-*`: Horizontal lockup with the canonical tagline. The retained
  filename is for backwards-compatible asset paths.
- `stacked-brick`: Square or narrow placement.
- `stacked-cream`: Reverse square or narrow placement.

## Social

- `avatar`: Canonical account avatar. Its complete mark stays inside the center
  68 percent so Facebook's circular crop does not remove an arc or the origin
  point.
- `facebook-cover`: 1640 by 624 Brick cover with its complete lockup inside the
  shared desktop and mobile safe area.
- `facebook-cover-photo`: Coordinated natural-photography cover. Keep the
  supplied center crop and do not place new text in the outer 180 px on either
  side. Those edges may disappear on narrower screens.
- `feed-brand`: 1080 px square brand post.
- `feed-portrait`: 1080 by 1350 portrait brand post.
- `facebook-group-launch`: 1080 by 1350 food-truck campaign post using owned
  Frederick night photography. Use this when sharing the food-truck board in a
  Frederick community group. The printed campaign code is `food-truck`.
- `feed-event-template`: Editable event post.
- `feed-live-template`: Editable live or open-now post.
- `photo-post-template`: Replace the 4:5 placeholder area with owned Frederick photography.
- `photo-story-template`: Replace the 9:16 placeholder area with owned Frederick photography.
- `story-brand`: 1080 by 1920 story frame.
- `og-default`: 1200 by 630 share card.

## Posters

- `you-are-here`: 18 by 24 brand poster using the owned summer skyline photograph.
- `whole-county`: 18 by 24 countywide poster using the owned fall downtown photograph.
- `product-today`: 18 by 24 product poster built around the current Today
  interface. Recapture the screen before a major campaign if the product has
  materially changed.
- `ask-radius`: 18 by 24 activation poster built around the current Ask Radius
  interface. Replace the outlined QR placeholder with a tested production QR
  code before printing.
- `campaign/poster-field-guide`: 18 by 24 poster for the live field-guide
  campaign, with a working tracked QR code.
- `campaign/poster-right-now`: 18 by 24 owned-photography campaign poster with
  a working tracked QR code.

The poster SVGs are editable 1800 by 2400 masters. The PNG exports are ready
for review or a short-run proof. The campaign pair also includes 18 by 24 PDF
exports with generated QR codes. Add a tested QR code to the older templates
only after the final destination URL and campaign tracking are locked.

## NFC cards

- `nfc/general-front` and `nfc/general-back`: General Frederick Radius card.
- `nfc/signal-front` and `nfc/signal-back`: Premium Radius Signal CR80 card.
  The QR and programmed NFC destination use separate analytics media values.
- `campaign/radius-signal-card-mockup.png`: Presentation view of the intended
  stock, embossing, and edge treatment. Production should use the SVG masters.
- `nfc/partner-front` and `nfc/partner-back`: Blank partner or venue template.

All six masters are CR80 cards at 300 dpi with 0.125 in bleed: 1088 by 713
px. The general and partner templates retain deliberate QR placeholders. The
Radius Signal back contains a generated production QR. Follow
`docs/brand/NFC_CARD_GUIDE.md` for trim, safe area, programming, and proofing
requirements.

SVG is the editable master. PNG is the ready-to-upload export. Do not enlarge a PNG to create a new master.

The included fonts are licensed under the SIL Open Font License. The kit ships
Libre Caslon Display Regular plus Public Sans Variable upright and italic,
with a static compatibility set. License copies are in `licenses/`.

`examples/frederick-skyline-natural.webp` is the natural-color, owned Frederick
photograph used on page 09 of the guide. `examples/frederick-aerial.webp` is an
additional owned geographic reference. Do not treat either as generic stock
imagery or transfer its rights with the open-font licenses.

The `examples/ui-*-mobile.webp` files are optimized 390 px viewport captures of
the current product system: Today, Ask Radius, County map, Live conditions,
All tools, and Beer. They are guide references, not evergreen campaign creative;
live facts in the screens reflect the July 22, 2026 capture state. The captures
exclude the Next.js development indicator, private account data, and degraded
local API states.

## Platform outputs

The 32 assets in this directory are the identity, lockup, social, poster, and
NFC kit. App delivery assets are generated separately by
`scripts/build-push-icons.ts` and are recorded under `platform` in
`manifest.json`:

- `public/icons/icon.svg`, `icon-192.png`, and `icon-512.png` are the standard
  PWA launcher artwork.
- `public/icons/icon-maskable.svg` and `icon-maskable-512.png` are the
  full-bleed maskable launcher artwork.
- `src/app/icon.png`, `apple-icon.png`, and `favicon.ico` cover browser and
  Apple surfaces.
- `public/icons/badge-72.png` is the monochrome Android notification badge.
- `/apple-splash` renders installed-app launch images. `/api/og` renders the
  default 1200 by 630 share card and the optional 1080 by 1920 story format.

Versioned icon URLs come from `src/lib/platform-brand.ts`. Bump the icon
version after changing generated icon artwork. Rebuilding these files is a
local operation; they are not live until the commit is deployed and the public
manifest and asset URLs have been checked.
