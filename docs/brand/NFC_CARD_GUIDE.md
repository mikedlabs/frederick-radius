# Frederick Radius NFC card guide

Version 1.2 - July 22, 2026

The files in `public/brand/nfc/` are editable CR80 card masters. They are made
for blank programmable NFC cards, not for a specific printer or chip vendor.
Confirm a vendor's template before placing a production order.

## Production size

- Finished CR80 card: 3.375 by 2.125 in.
- Master with bleed: 3.625 by 2.375 in.
- Raster export: 1088 by 713 px at 300 dpi.
- Bleed: 0.125 in, or about 38 px, outside every trim edge.
- Trim box: 1013 by 638 px, centered at approximately x 38 and y 38.
- Safe area: keep logos, text, URLs, and QR codes at least another 0.125 in,
  or 38 px, inside the trim. Critical content should stay between x 76 and
  x 1012 and between y 76 and y 637.

Background color and photography must continue through the bleed. Do not add
crop marks unless the selected printer requests them. Ask the printer how it
wants the back rotated before approving a two-sided proof.

## Included masters

- `general-front.svg` and `general-back.svg` are the standard Radius card.
- `partner-front.svg` and `partner-back.svg` are the venue template. Replace
  every all-caps placeholder before export.
- `signal-front.svg` and `signal-back.svg` are the premium public-facing Radius
  Signal card. Its back includes a working tracked QR fallback.
- The matching PNG files are proofs and handoff previews. The SVGs are the
  production masters.

The dotted QR areas in the general and partner templates are placeholders.
They are deliberately not fake or decorative QR codes. The Radius Signal back
contains a generated QR that must still be scanned from the final physical
proof before production.

## NFC programming

Program one short HTTPS URL as an NDEF URI record. Use a stable Radius URL that
can redirect later, instead of writing campaign copy or a long tracking URL to
the chip. Lock the card only after the destination, redirect, and analytics
have been verified.

The Radius Signal master uses separate `utm_medium=nfc` and `utm_medium=qr`
destinations. This lets Plausible distinguish a tap from a scan without storing
anything personal on the card.

Do not store names, email addresses, access credentials, or any other personal
information on the card. The chip should only open a public web address.

## Printed fallback

Every NFC card needs a visible fallback because some phones have NFC turned
off, a difficult antenna position, or a case that interferes with the tap.

1. Print the short destination in readable text.
2. Replace the dotted box with a real QR code generated from the same final
   URL. Keep the finished QR at least 0.75 in wide and preserve its quiet zone.
3. Use a high-contrast single-color QR. Do not place it over a photograph,
   gradient, Ripple, or texture.

## Proof before ordering

1. Print both sides at actual size and check every safe margin.
2. Program a sample card and test it on at least one current iPhone and one
   current Android phone.
3. Test the printed URL and scan the final QR from normal arm's length under
   bright and dim indoor light.
4. Verify the card while it is sitting on wood, glass, and a typical counter.
   Metal surfaces can interfere with ordinary NFC cards; use an on-metal card
   or spacer when the installation requires it.
5. Order a physical proof before approving a full run. Compare front-to-back
   registration, corner cuts, color, small type, and QR sharpness.

## Partner handoff

Use one redirect per partner so a venue can change its destination without
reprinting cards. Keep the Radius mark intact, use a supplied vector partner
logo, and document who controls the destination. A paid placement or partner
card must be labeled honestly in the linked experience; the card should never
imply government, city, or county endorsement.
