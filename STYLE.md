# Society of Explorers: one look

Every SoE page on societyofexplorers.com (repo ChrisTaylor17/soe), the Salon World, the Explorers' Study and this figure chat app
share this look. In this app the tokens are the `--soe-*` variables in
`app/globals.css`; on the static site they live in `soe-style.css`. Keep the two
in step. Fonts here come from @fontsource (Cinzel, Cormorant Garamond, EB Garamond);
don't add Playfair Display or other display faces.

## Colors: night and gold

| Token | Value | Use |
| --- | --- | --- |
| `--soe-black` | `#0a0a0a` | deepest background, footer, app background, theme color |
| `--soe-bg` | `#0c0b09` | page background |
| `--soe-panel` | `#14120e` | cards and panels |
| `--soe-raised` | `#1c1913` | hover, raised blocks |
| `--soe-line` | `#3d3424` | rules and borders |
| `--soe-gold` | `#c9a84c` | accent, links, outlines, primary button |
| `--soe-gold-light` | `#e2c97e` | hover, small gold text |
| `--soe-gold-deep` | `#7a6228` | quiet gold borders |
| `--soe-ivory` | `#f0e8d5` | headings |
| `--soe-text` | `#e6dcc5` | body text |
| `--soe-muted` | `#b3a88f` | secondary text |
| `--soe-on-gold` | `#0a0a0a` | text on a gold button |

No green, navy, copper or light cream backgrounds on SoE pages. Discover Truth
keeps its own accent on top of this base.

## Type

- **Cinzel** (`--soe-label`): the wordmark, eyebrows, navigation, buttons. Uppercase, letter-spaced.
- **Cormorant Garamond** (`--soe-display`): headlines. Italic gold for the emphasized phrase.
- **EB Garamond** (`--soe-body`): reading text, about 18 to 19px.

## Logo

A gold four-point star (✦) followed by SOCIETY OF EXPLORERS in Cinzel, gold.
The app icons are the same gold star on black.

## Buttons

- Primary: solid gold, black Cinzel text, 2px corners.
- Secondary: gold outline, gold text, transparent fill.
