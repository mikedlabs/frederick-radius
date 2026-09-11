# Frederick Radius font package

The brand kit includes installable TrueType files for desktop design work and
WOFF2 files for websites and generated assets.

## Installable desktop files

- `LibreCaslonDisplay-Regular.ttf` — Libre Caslon Display Regular 400. Use for
  the Frederick Radius wordmark and rare editorial or hero moments. This family
  has no approved bold or italic; do not synthesize either style.
- `PublicSans-Variable.ttf` — Public Sans upright variable, weights 100-900.
  Use for product titles, section and card titles, body text, controls, and
  data. Normal product work stays between 400 and 700.
- `PublicSans-VariableItalic.ttf` — Public Sans italic variable, weights
  100-900. Use this real italic for emphasis and attribution.

On macOS, double-click a TTF and choose **Install Font**. On Windows,
right-click a TTF and choose **Install**. Install both Public Sans files so
upright and italic styles are available to design applications.

If a design application does not support variable fonts, use the files in
`static/` instead. That folder includes Regular 400, Medium 500, SemiBold 600,
and Bold 700, with matching italics. Install the variable pair or the static
set, not both; installing both can create duplicate family menus in desktop
applications.

## Browser files

- `libre-caslon-display-400.woff2`
- `public-sans-variable.woff2`
- `public-sans-variable-italic.woff2`

WOFF2 files are for web use and are not the desktop handoff. CSS should use the
family names `Libre Caslon Display` and `Public Sans`.

## Upstream sources and licenses

The desktop fonts are unmodified files from the typefaces' official upstream
repositories:

- Libre Caslon Display at commit
  `3491f6a9cfde2bc15e736463b0bc7d93054d5da1`:
  `fonts/TTF/LibreCaslonDisplay-Regular.ttf`
- Public Sans at commit `d3df3455fb94643925f816276e81b231bc31619f`:
  `fonts/variable/PublicSans[wght].ttf`,
  `fonts/variable/PublicSans-Italic[wght].ttf`, and the matching files in
  `fonts/ttf/`

Both families are licensed under the SIL Open Font License 1.1. The license
copies are in `../licenses/OFL-Libre-Caslon-Display.txt` and
`../licenses/OFL-Public-Sans.txt`.
