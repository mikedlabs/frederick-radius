# Frederick Radius campaign assets

These assets extend Frederick Radius Brand System 1.2. They use the current
Ripple, Cream, Ink, Brick, Catoctin Forest, Libre Caslon Display, and Public
Sans system.

## Campaign idea

`A field guide that knows what time it is.` explains the product difference in
one line. Frederick Radius is not a static directory. It organizes current
local information around where someone is now.

The supporting photography line is `See Frederick as it is right now.` It is
paired with original Frederick Radius photography and should not be applied to
stock imagery.

## Poster masters

- `poster-field-guide.svg`, `.pdf`, and `.png`: 18 by 24 inch portrait master built
  around the cartographic Ripple artwork.
- `poster-right-now.svg`, `.pdf`, and `.png`: 18 by 24 inch portrait master using the
  owned `Frederick Night.jpg` aerial.
- `cartographic-ripple-background.png`: generated campaign artwork used by the
  field-guide poster. It has no embedded wording or QR code.

The poster QR opens:

`https://frederickradius.app/?utm_source=poster&utm_medium=qr&utm_campaign=field-guide`

The QR is built as vector modules inside each SVG. The PNG is a proof and a
general-purpose raster export. Use the SVG or 18 by 24 PDF for commercial
printing.

## Radius Signal card

- `../nfc/signal-front.svg`, `.pdf`, and `.png`: premium CR80 front master.
- `../nfc/signal-back.svg`, `.pdf`, and `.png`: premium CR80 back master with a working
  QR fallback.
- `radius-signal-card-mockup.png`: presentation mockup showing the intended
  matte stock, blind emboss, and Brick edge paint. Do not extract or scan the
  QR from the mockup. Use the exact SVG or PNG master for production.

The printed QR opens:

`https://frederickradius.app/?utm_source=radius-card&utm_medium=qr&utm_campaign=field-guide`

Program the NFC chip with:

`https://frederickradius.app/?utm_source=radius-card&utm_medium=nfc&utm_campaign=field-guide`

This separation allows Plausible to distinguish a tap from a scan. Test both
destinations before locking the NFC chip or approving a print run.

## Production recommendation

Use a heavy uncoated stock or matte PVC with a soft paper texture. The large
front Ripple is intended for blind embossing. Brick edge paint is optional but
helps the card feel like a deliberate local object instead of a generic access
card. Order one physical proof before a full run.
