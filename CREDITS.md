# Credits

Tallgrass's own code is MIT (see `LICENSE`). Everything below keeps its own licence.

## Animal models
Authored meshes from Sketchfab. Each one is decimated, re-oriented, retargeted to the game's own leg rig and rebaked to 1K textures by `tools/import_animal.py` and `tools/label_animal.py`; the animation, gaits, foot lock and IK are the game's own. Output: `public/models/a3/`. `?a3=0` shows the earlier procedural animals instead.

| Animal | Source | Author | Licence |
|---|---|---|---|
| Bison | ["Bison - animal"](https://sketchfab.com/3d-models/bison-animal-4b8f112fffb84ce19dac2578b39e03b1) | Brian Trepanier | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Wolf | ["WOLF - Realistic 3D Model (DEMO FREE)"](https://sketchfab.com/3d-models/wolf-realistic-3d-model-demo-free-8840b859a566485c874a27b1731e1db8) | WildMesh 3D | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Mule deer | ["DEER - Realistic 3D Model (DEMO FREE)"](https://sketchfab.com/3d-models/deer-realistic-3d-model-demo-free-3997d669818c4e0d8c8bcafb0a1ae2ee) (source antlers left out; procedural antlers) | WildMesh 3D | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Pronghorn | ["Pronghorn"](https://sketchfab.com/3d-models/pronghorn-a8cb6abfb49841ed97f8480a36c26b3b) | FennecFyre | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Coyote | ["coyote"](https://sketchfab.com/3d-models/coyote-e350e508749c45baab4df6fb6cba8cd9) | Raven-Woods | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Cougar | ["Puma Gray"](https://sketchfab.com/3d-models/puma-gray-90f0fd2c4ce24d05acce011256953ca5) (whiskers and claws left out) | 1225659838@qq.com (as listed on Sketchfab) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The three CC BY-NC models (wolf, mule deer, pronghorn) limit Tallgrass to non-commercial use while they ship. Ravens, hawks, eagles, cranes, small prey, beavers, trees and shrubs are procedural, built in code.

## Trees
- **ez-tree** by Daniel Greenheck, https://github.com/dgreenheck/ez-tree , MIT License (Copyright (c) 2024 Daniel Greenheck). `src/render/eztree.ts` is a geometry-only TypeScript port of its deciduous branch and leaf-anchor generator. The bark is shaded procedurally and the leaf clusters are drawn by `makeLeafAtlas()` in `src/render/trees3.ts`; no textures come from the library.

## Ground textures
Photo-scanned ground, 1K sources from [Poly Haven](https://polyhaven.com) (CC0, no attribution required; credited anyway). `tools/build_ground_textures.py` reduces each scan to a 512 px high-pass detail map (`*_d.jpg`) and a tangent normal (`*_n.jpg`) in `public/textures/ground/`; the original colours are not shipped.

| File pair | Poly Haven asset | Source URL | Licence |
|---|---|---|---|
| `litter_*` | Withered Grass | https://polyhaven.com/a/withered_grass | CC0 |
| `soil_*` | Brown Mud Dry | https://polyhaven.com/a/brown_mud_dry | CC0 |
| `stony_*` | Grass Path 2 | https://polyhaven.com/a/grass_path_2 | CC0 |
| `mud_*` | Brown Mud 03 | https://polyhaven.com/a/brown_mud_03 | CC0 |
| `ash_*` | Burned Ground 01 | https://polyhaven.com/a/burned_ground_01 | CC0 |
| `snow_*` | Snow 02 (a clean crop, footprints softened) | https://polyhaven.com/a/snow_02 | CC0 |

## Fonts
- **Alegreya** and **Alegreya Sans** by Juan Pablo del Peral (Huerta Tipográfica), SIL Open Font License 1.1, via [Fontsource](https://fontsource.org).

## Code and libraries
- [three.js](https://threejs.org) (MIT): rendering and post-processing addons.
- [Vite](https://vitejs.dev) (MIT): build and dev server.
- [Playwright](https://playwright.dev) (Apache-2.0): in-browser capture for reviews (development only).
- matplotlib and numpy (BSD-style): stability charts (development only).

## Generated for this project
- Sound effects, ambience, animal calls, music cues and narration (`public/audio/`): generated with ElevenLabs. The ledger is in `ASSETS.md`.
- Concept art (`art/concept/`, `journey/`): generated with Google Gemini image models, used as art-direction reference only; none of it ships in the game.
