# Frederick Radius brand guide

Version 1.2 - Frederick Radius Brand System - July 22, 2026

This is the source of truth for Frederick Radius. It applies to the product, social posts, presentations, printed material, app icons, and partner handoffs.

## The idea

Frederick Radius helps someone understand what is useful around them without making them search through several sites and social feeds. The brand should feel local, informed, calm, and practical. It should never feel like a tourism campaign, a government portal, or a generic technology product.

The Ripple begins at one point and reaches beyond the frame. It represents a person standing somewhere in Frederick County and the useful things within reach.

The canonical tagline is:

> Frederick County starts where you are.

The plain-language description is:

> Current local information for Frederick County, organized around where you are.

Use `Frederick Radius` as the name. Use `Radius` only where an operating system or small control requires a short name.
Use `Frederick Radius Brand System` for the identity and interface system in
guides, handoffs, and governance. It is not a second public-facing product
name.

## Logo

The Ripple is the only primary mark. Do not replace it with initials, a location pin, a target, or the retired circle-and-dot mark.

### Optical sizes

| Rendered size | Version | Rule |
| --- | --- | --- |
| 48 px and larger | Three arcs | Primary mark, app icon, lockups, hero artwork |
| 24-47 px | Two arcs | Product header and other compact UI placements |
| Below 24 px | One arc | Favicon and notification badge only |

Clear space around the mark should be at least the radius of its inner arc. Never stretch, rotate, outline, crop into a different shape, or add a second symbol.

### Primary lockups

- The product header uses the two-arc mark followed by a one-line `Frederick Radius` wordmark.
- The tagline lockup adds `FREDERICK COUNTY STARTS WHERE YOU ARE` below the wordmark.
- Use the Brick mark with the Ink wordmark on light surfaces. Use the Cream reverse lockup on Brick, Catoctin Forest, Ink, or photography with enough contrast.
- The app-icon tile is for launchers, avatars, and app-store use. Do not put the tile inside the normal product header.

Editable marks and lockups are in [`public/brand`](../../public/brand). Each source SVG has a matching PNG export.

## Color

### Recognition system

| Token | Hex | Use |
| --- | --- | --- |
| Brick | `#B5462B` | Logo, links, primary actions, selected states |
| Cream | `#F4EEE2` | Main page ground and reverse artwork |
| Ink | `#221C15` | Text, deliberate dark frames, high-contrast controls |

Brick, Cream, Ink, the Ripple, and owned Frederick photography are what make a
surface recognizably Frederick Radius. Brick and Ink pass WCAG AA for normal
text on Cream. Keep this recognition system stable across Today, Ask Radius,
the map, All tools, Live conditions, Beer, campaigns, and platform surfaces.

### Functional data colors

| Token | Hex | Use |
| --- | --- | --- |
| Catoctin Forest | `#315A43` | Parks, trails, terrain, and small positive or open signals |
| Creek | `#285D73` | Civic, map, transit, and data information |
| Plum | `#7E2C6F` | Limited arts, culture, and editorial accent |
| Ochre Amber | `#C58A32` | Live, caution, sunlight, or a Beer selection and flagship fill with Ink on top |
| Ridge | `#3F5E8F` | A limited supporting data accent |

Functional colors organize a real topic or state. They do not create separate
sub-brand palettes and must not replace the Cream, Ink, Brick, and Ripple
shell. Catoctin Forest belongs to outdoor content and small positive or open
signals. Creek is a utility color rather than another page identity. Ochre
appears when it means live, caution, or sunlight. Beer is the deliberate
product exception: Ochre can mark an active taste control, a flagship beer, or
beer and brewery metadata. It still does not become the Beer page ground or a
decorative yellow theme.

### Working colors

| Token | Hex | Use |
| --- | --- | --- |
| Surface | `#FBF8F0` | Elevated cards and sheets |
| Paper deep | `#EAE1D1` | Inset or selected paper surfaces |
| Border | `#D8CDBA` | Decorative rules and card edges |
| Control border | `#927F63` | Form boundaries that must meet 3:1 contrast |
| Muted Ink | `#6C6357` | Secondary copy on Cream |
| Amber text | `#925E16` | Text-safe Amber on Cream and in Beer controls |

## Typography

Frederick Radius uses two typefaces.

### Libre Caslon Display

Use Libre Caslon Display Regular for the wordmark and rare editorial or hero
moments. It is a signature, not the normal product-heading face. Product page
titles, section headings, card titles, controls, labels, and data use Public
Sans.

The family has one upright Regular cut. Do not fake bold or italic. Hierarchy
should come from size, spacing, and position. Keep Caslon at 18 px or larger
when it is used outside the wordmark.

### Public Sans

Use Public Sans for product page titles, section headings, card titles, body
copy, navigation, buttons, labels, forms, times, distances, and data. The kit
ships both variable upright and variable italic files. The CSS family name is
`Public Sans`; available weights run from 100 through 900, although most
product work should stay between 400 and 700. Use real italic when emphasis or
attribution needs it instead of mechanically slanting the upright file.

On phones, normal reading copy should be 15 to 16 px. Eleven to 13 px is
reserved for short captions, metadata, freshness, and attribution.

Times and counts use Public Sans with tabular numerals. A third monospace face is not part of the brand.

The handoff includes installable desktop fonts and matching browser files:

| File | Purpose |
| --- | --- |
| `fonts/LibreCaslonDisplay-Regular.ttf` | Installable Caslon Regular 400 |
| `fonts/PublicSans-Variable.ttf` | Installable Public Sans upright, weights 100-900 |
| `fonts/PublicSans-VariableItalic.ttf` | Installable Public Sans italic, weights 100-900 |
| `fonts/libre-caslon-display-400.woff2` | Caslon browser file |
| `fonts/public-sans-variable.woff2` | Public Sans upright browser file |
| `fonts/public-sans-variable-italic.woff2` | Public Sans italic browser file |

Install both Public Sans TTF files in desktop design applications so upright
and italic resolve as one family. If a design application cannot use variable
fonts, install the 400, 500, 600, and 700 upright and italic cuts from
`fonts/static/` instead. Install the variable pair or the static set, not both,
because duplicate installs can split or duplicate the family menu. License
copies and upstream source details ship beside the fonts in
[`public/brand/fonts`](../../public/brand/fonts).

### Product type scale

| Role | Size and line height | Typeface and normal weight |
| --- | --- | --- |
| Caption | 11 px / 1.4 | Public Sans 400-600 |
| Prominent metadata | 13 px / 1.5 | Public Sans 400-600 |
| Compact body | 15 px / 1.55 | Public Sans 400 |
| Reading body | 16 px / 1.6 | Public Sans 400 |
| Item or card title | 20 px / 1.15 | Public Sans 600 |
| Product page title | 32 px / 1.05 | Public Sans 600-700 |

Use Public Sans 500 for compact controls and 600 for titles or primary labels.
Reserve 700 for numerics or rare emphasis rather than normal prose. On touch
devices, inputs, textareas, and selects stay at 16 px so iOS does not zoom the
page when a field receives focus.

Mapbox supplies the cartographic type used for labels drawn inside the map
canvas. Treat that as a functional map exception, not a third Radius typeface.
Map controls, popups, sheets, and lists remain Public Sans.

## Product design

The product should feel like a well-edited local field guide with live information inside it.

### Hierarchy

- Lead with the current condition, the strongest answer, or the next useful action.
- Keep one clear primary action in a section. Secondary actions should be quieter.
- Reveal supporting detail after the first decision is understandable.
- Remove cards, labels, and buttons that do not help someone decide or act.
- Use headings to name content, not to add a slogan above it.

### The product proof sequence

The interface earns the brand promise in this order:

1. **State the scope.** Use the user's precise location when they gave it,
   then their chosen town or the county. Do not quietly substitute a rough
   network location for a named place.
2. **Lead with the useful current fact.** The place, condition, event, or
   service comes before a catalog count, decorative label, or pitch.
3. **Show why it is trustworthy.** Put the source, checked time, and any
   material uncertainty beside a live claim, not behind a generic trust page.
4. **Offer one honest next move.** Give a clear action such as directions,
   a phone number, a reservation link, or a way to widen the search. Do not
   imply that Radius completed an action it cannot complete.

If a surface cannot satisfy this sequence, simplify it until it can. The
product should feel like someone who knows the county and is careful with
facts, not a feed trying to fill space.

### Surfaces

- Cream is the default page ground. Surface is for cards, sheets, and menus.
- Use thin rules and restrained shadows. A card should not look inflated or glossy.
- Use rounded corners because they improve grouping and touch comfort, not as decoration on every element.
- Dark Ink frames are reserved for live-status artwork, important contrast moments, or media. They should not become the default appearance of Beer, Live conditions, All tools, or other product pages.
- Beer keeps the same Cream, Ink, Brick, and ruled-paper foundation as the rest of the app. Real beer colors and taproom photography may carry the subject; Ochre Amber is limited to active taste choices, flagship markers, and beer-specific metadata.
- Oversized Ripple arcs may run off an edge on a hero, onboarding screen, empty state, or social image. Do not place them behind every section.
- The normal product shell is plain Cream, rules, typography, real local
  material, and useful data. A Ripple bloom is an opt-in editorial moment,
  never a default page background. Use one visual idea at a time.

### Interaction

- Touch targets are at least 44 by 44 px.
- A control must look interactive before hover. Mobile has no hover state.
- Use one disclosure system for rows and cards. A chevron means more detail; it should not appear on inert content.
- Keep primary navigation stable across pages.
- Preserve a user's position when opening and closing sheets or map details.

### Motion

Motion should explain state or place, not advertise the interface.

- Fast response: 160 ms.
- Normal transition: 240 ms.
- Larger reveal: up to 420 ms.
- Use gentle ease-out motion. Avoid bouncing cards, looping blobs, or decorative parallax.
- The Ripple may expand once during launch or a meaningful live-state change.
- Respect reduced-motion preferences and preserve all information without animation.

### Release gate

Before a new or materially changed public surface ships, review it at a 375px
phone width and a wide desktop width. Check that the primary task is visible
without reading a long introduction, the active scope is clear, every visible
control works on touch, and live statements show their source or freshness.
Review Today, Ask Radius, Beer, Live conditions, All tools, and the map as a
set whenever a shared visual token, navigation rule, or data-display pattern
changes. The app should remain one field guide, not a collection of separately
designed screens.

## Photography

Real Frederick photography is one of the strongest advantages of the product. Use owned work before stock or generated imagery.

- Show recognizable streets, businesses, towns, landscapes, and people using Frederick County.
- Keep color natural. A small warm adjustment is fine; heavy presets are not.
- Do not put a Brick, Plum, or warm color wash over a photograph. When text
  needs contrast, give it a separate neutral Ink panel or a local neutral
  gradient that does not recolor the image.
- Avoid generic hands-with-coffee, empty storefront glamour shots, and images that could represent any town.
- Favor a clear subject and enough negative space for interface text when a photo is used as a hero.
- Use aerial photography when it adds geographic understanding. Do not use it as filler.
- Preserve rights, date, location, and attribution in the private Lightroom or asset manifest. Remove unnecessary public EXIF and precise GPS coordinates from web derivatives.

Recommended master crops are 3:2 for photography, 4:3 for product cards, 1:1 for social posts, 1.91:1 for link previews, and 9:16 for stories. Choose the crop around the subject instead of forcing one master crop into every channel.

## System in use

The current product is the working example of the brand system. The reference
captures in [`public/brand/examples`](../../public/brand/examples) use a 390 px
mobile viewport and were made on July 22, 2026. They contain no development
indicator, private account data, or degraded local API state. Time-sensitive
facts shown in a capture document that interface state; they are not evergreen
claims for future campaign use.

Every product task should make three behaviors clear:

1. **Start from a chosen scope.** Name the town, county, or user-selected
   location before ranking nearby results.
2. **Show source and freshness.** Keep the source and update time beside the
   live claim they support.
3. **Lead to the next useful action.** Make one next step clear and keep
   secondary detail behind an honest disclosure.

### Shared interface hierarchy

- Cream is the normal ground. Surface holds a card, sheet, form, or grouped
  row only when the boundary helps someone understand the task.
- Public Sans carries product page titles, section and card titles, labels,
  body copy, source, freshness, time, place, distance, controls, and data.
  Libre Caslon Display is reserved for the wordmark and a rare editorial or
  hero moment.
- Brick identifies the Radius shell and primary action. A chevron only appears
  when a row or card opens more information.
- The top bar and primary navigation remain stable. Specialty pages change the
  subject and may use a functional data color, but they do not invent a new
  shell, type hierarchy, or card language.

### Current reference surfaces

| Surface | What the current UI demonstrates | Reference capture |
| --- | --- | --- |
| Today | The next useful item leads; time, place, status, action, and disclosure remain in one reading order. | [`ui-today-mobile.webp`](../../public/brand/examples/ui-today-mobile.webp) |
| Ask Radius | Area scope appears before the question; example prompts stay quiet; Brick identifies the primary submit action. | [`ui-ask-radius-mobile.webp`](../../public/brand/examples/ui-ask-radius-mobile.webp) |
| County map | The base map stays warm and quiet; streets, water, controls, and attribution remain legible. | [`ui-map-mobile.webp`](../../public/brand/examples/ui-map-mobile.webp) |
| Live conditions | Urgency, update time, source, and next action appear together. Creek can structure live-system data while Brick marks an alert. | [`ui-pulse-mobile.webp`](../../public/brand/examples/ui-pulse-mobile.webp) |
| All tools | A large practical-tool directory still uses the same page hierarchy, rows, disclosure, Cream ground, and stable navigation. | [`ui-compass-mobile.webp`](../../public/brand/examples/ui-compass-mobile.webp) |
| Beer | Ochre describes beer color, taste choices, flagship status, or metadata. It does not replace the normal Radius shell. | [`ui-beer-mobile.webp`](../../public/brand/examples/ui-beer-mobile.webp) |

Search and Ask Radius have different jobs. Search retrieves a known place,
event, town, or tool. Ask Radius gives a sourced answer or builds a plan around
constraints. Keep that boundary clear in labels, descriptions, and handoffs.

## Maps and data

The map is part of the identity because Radius is about place.

- Keep the base map warm and quiet so markers and live layers remain legible.
- Use category colors to organize data, but keep the product shell in the core palette.
- A selected marker must show a name and useful context. A bare pin is not an answer.
- Live layers need a timestamp and source. Stale or unavailable data must say so.
- Countywide views should include Frederick City without making downtown the automatic center of every answer.
- Never imply government endorsement. Official data should keep its source label and link.

## Voice

Frederick Radius should sound like a careful local editor.

- Write complete sentences in public copy.
- Use specific Frederick facts when they help someone decide.
- Say what the app knows, where the information came from, and when it may be stale.
- Keep third-party attribution attached to the fact it supports.
- Use short labels where a label is expected. Do not turn normal paragraphs into fragments.

Avoid generic slogans, repeated rhetorical patterns, groups of three used for rhythm, and filler such as `discover`, `curated`, `hidden gem`, or `vibrant` when a concrete detail would be more useful. Generated answers must not claim personal experience or certainty that the data does not support.

## Social and share assets

The source kit includes:

- A 1024 px avatar.
- A 1640 by 624 Brick Facebook cover and a coordinated natural-photography cover, both composed for the shared safe area.
- A 1080 px square brand post.
- A 1080 by 1350 portrait brand post.
- Editable square event and open-now templates.
- A 1080 by 1350 owned-photography post template.
- A 1080 by 1920 owned-photography story template and brand frame.
- A 1200 by 630 Open Graph card.
- Four 18 by 24 poster masters: two use owned Frederick photography; two explain Today and Ask Radius with current UI captures.
- Four CR80 NFC card masters: general and partner front/back pairs with tested-QR and printed-URL fallbacks.

NFC cards follow [`NFC_CARD_GUIDE.md`](NFC_CARD_GUIDE.md). Never ship a
decorative or untested QR code, and test both the tap target and printed
fallback before production.

Use the Brick frame for brand messages. Use the Cream frame for events and
useful information. Use Catoctin Forest for an open-state label. Use an Amber
label when the subject is live, time-sensitive, sun-related, or specifically
about beer.

Keep Catoctin Forest as a small landscape or outdoor cue in campaign work. It
should not replace Brick as the brand frame. Ochre Amber should describe a real
condition or a specific beer subject; it is not a decorative yellow accent.

Do not publish placeholder copy. Confirm names, dates, times, and source information before export.

## Platform and app delivery

The operating-system surfaces use the same Ripple geometry and palette as the
product. They are generated by `scripts/build-push-icons.ts`.

| Surface | Current asset or route | Rule |
| --- | --- | --- |
| Browser icon | `src/app/icon.png` | 32 px Brick tile with the one-arc favicon Ripple |
| Multi-size favicon | `src/app/favicon.ico` | One-arc Ripple at 16, 32, and 48 px |
| PWA launcher | `public/icons/icon.svg`, `icon-192.png`, `icon-512.png` | Three-arc Ripple on a Brick squircle with transparent corners |
| Maskable launcher | `public/icons/icon-maskable.svg`, `icon-maskable-512.png` | Full-bleed Brick with the Ripple inside the mask-safe center |
| Apple touch icon | `src/app/apple-icon.png` | Opaque 180 px Brick tile; iOS supplies the corner mask |
| Push notification icon | `public/icons/icon-192.png` | Same branded launcher icon used by the service worker |
| Android status badge | `public/icons/badge-72.png` | Monochrome one-arc silhouette; Android applies the color |
| Installed-app splash | `/apple-splash` and the PWA manifest | Cream ground with the Brick tile and display wordmark |
| Link preview | `/api/og` | 1200 by 630 by default; `format=story` creates 1080 by 1920 |

The manifest name is `Frederick Radius`; the operating-system short name is
`Radius`. Installed-app chrome, launch backgrounds, and theme color use Cream.
The default site and beta share cards use a Brick frame. Place, event,
municipality, category, collection, and daily cards use the lighter information
frame and may apply a semantic accent.

Launcher and notification URLs carry the version from
`src/lib/platform-brand.ts`. Bump `ICON_VERSION` whenever generated icon
artwork changes so installed apps and service workers do not retain the old
files. Stable share cards must avoid open-now or clock-dependent claims. A
time-specific card needs the date in its URL, as the daily almanac does, so a
social cache cannot reuse yesterday's image.

## Governance

The canonical values, revision, and Ripple geometry live in
[`src/lib/brand.ts`](../../src/lib/brand.ts). Platform names, descriptions,
theme color, versioned icon URLs, and operating-system asset roles live in
[`src/lib/platform-brand.ts`](../../src/lib/platform-brand.ts). The product
token mirror lives in [`src/app/globals.css`](../../src/app/globals.css).

Run the following after changing the identity:

```sh
npm run build:brand
npm run build:push-icons
npm run build:brand-guide
npm run typecheck
npm run style:lint
npm test
```

`npm run build:brand` rebuilds the editable SVGs, PNG exports, font package, licenses, and asset manifest. Do not redraw the Ripple in a component or design file when the source asset already exists.

The generated kit contains 32 SVG masters with matching PNG exports: seven
marks, six lockups, eleven social assets, four posters, and four NFC card
masters. Its manifest also records 14 font files plus the separately generated
launcher, favicon, Apple, notification, splash, and dynamic Open Graph
surfaces.

A successful local build does not mean the brand is live. Commit and push the
generated files, wait for the production deployment, then check the public
manifest, icon URLs, default share card, and a new uncached page. Record the
deployed commit when announcing that a brand revision is live.

Before release, check the product header at 320 px, the app icon, installed-app splash, offline page, default share card, and at least one event or place share card.
