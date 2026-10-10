# Credits

## Code and libraries
- [three.js](https://threejs.org) (MIT): rendering, post-processing addons.
- [Vite](https://vitejs.dev) (MIT): build and dev server.
- [Playwright](https://playwright.dev) (Apache-2.0): in-engine capture for reviews (development only).
- matplotlib and numpy (BSD-style): stability charts (development only).

## Fonts
- **Alegreya** and **Alegreya Sans** by Juan Pablo del Peral (Huerta Tipográfica), SIL Open Font License 1.1, via [Fontsource](https://fontsource.org).

## Generated assets (made for this project, no third-party license)
- Concept art (`art/concept/`, `journey/`): generated with Google Gemini image models, used as art-direction reference only.
- Sound effects and ambience (`public/audio/`): generated with ElevenLabs sound generation. See `ASSETS.md` for the ledger.
- All 3D models (bison, wolf, raven, pronghorn, rabbit, cougar, cottonwoods, shrubs) are procedural, built in code. No downloaded models are used.

## Third-party assets
Any CC0 or CC-BY asset added later is listed here with its author, source URL and license.

### Ground textures (`public/textures/ground/`, day run r-ground)
Photo-scanned ground, 1K sources from [Poly Haven](https://polyhaven.com) (CC0, no attribution required; credited anyway). Each scan is reduced by `tools/build_ground_textures.py` to a 512 px high-pass detail map (`*_d.jpg`) and a tangent normal (`*_n.jpg`); the original colours are not shipped, the game keeps its own palette. The owner ruled on 2026-10-09 that any texture source and license is allowed for now (licensing handled later); these happen to be CC0.
| File pair | Poly Haven asset | Source URL | License |
|---|---|---|---|
| `litter_*` | Withered Grass | https://polyhaven.com/a/withered_grass | CC0 |
| `soil_*` | Brown Mud Dry | https://polyhaven.com/a/brown_mud_dry | CC0 |
| `stony_*` | Grass Path 2 | https://polyhaven.com/a/grass_path_2 | CC0 |
| `mud_*` | Brown Mud 03 | https://polyhaven.com/a/brown_mud_03 | CC0 |
| `ash_*` | Burned Ground 01 | https://polyhaven.com/a/burned_ground_01 | CC0 |
| `snow_*` | Snow 02 (a clean crop, footprints softened) | https://polyhaven.com/a/snow_02 | CC0 |
