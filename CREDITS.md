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

## a3 spike (branch a3-spike, behind ?a3=1): authored near-LOD animal meshes
Owner ruling 2026-10-09: any model source and license is allowed for the spike, he handles licensing later. Both meshes are decimated, re-oriented, retargeted to our leg rig and baked to 1K textures by `tools/import_animal.py` and `tools/label_animal.py`.
- **Bison**: "Bison - animal" by Brian Trepanier, https://sketchfab.com/3d-models/bison-animal-4b8f112fffb84ce19dac2578b39e03b1 , CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Output: `public/models/a3/bison.*`.
- **Wolf**: "WOLF - Realistic 3D Model (DEMO FREE)" by WildMesh 3D, https://sketchfab.com/3d-models/wolf-realistic-3d-model-demo-free-8840b859a566485c874a27b1731e1db8 , CC Attribution-NonCommercial 4.0 (http://creativecommons.org/licenses/by-nc/4.0/). Output: `public/models/a3/wolf.*`. NON-COMMERCIAL: resolve before any commercial release.
## r-trees3 spike (branch r-trees3, behind ?trees3=1): branching cottonwoods
- **ez-tree** by Daniel Greenheck, https://github.com/dgreenheck/ez-tree , MIT License (Copyright (c) 2024 Daniel Greenheck). `src/render/eztree.ts` is a geometry-only TypeScript port of its deciduous branch and leaf-anchor generator (the package's own build embeds 4 MB of textures, which the port leaves out). The bark texture and the leaf-cluster atlas are not from the library: the bark is shaded procedurally and the leaves are drawn by `makeLeafAtlas()` in `src/render/trees3.ts`.
## Third-party assets
None so far. Any CC0 or CC-BY asset added later is listed here with its author, source URL and license.
