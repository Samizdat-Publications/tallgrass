# Concept match (gemini-3.1-pro-preview, 2026-10-04 15:24)

Build still: `water_after.jpg`  
Concept: `00_prairie_golden_hour.jpg`

**Overall match: 4 / 10**

The build captures the basic topography and sun angle but lacks the vibrant golden palette and volumetric lighting of the concept. Significant improvements to water rendering, foliage density, and material lighting are needed.

| Criterion | Score (1-10) |
|---|---|
| light | 4 |
| palette | 4 |
| haze | 4 |
| water | 3 |
| trees | 4 |
| grass | 4 |
| composition | 6 |
| **overall** | **4** |

## Top differences (what the build should change)

1. **water**
   - Concept: Highly reflective surface mirroring the bright sky and sun.
   - Build: Flat, matte grey-blue ribbon with no reflections.
   - Change: Increase water material reflectivity and enable sky/sun specular highlights.
2. **grass**
   - Concept: Vibrant golden-ochre color with sweeping, wind-blown directional flow.
   - Build: Patchy, muddy green and brown flat textures.
   - Change: Shift grass albedo to warmer ochre and apply directional flow maps or anisotropic highlights.
3. **light**
   - Concept: High-contrast, warm directional light with deep, soft shadows.
   - Build: Flat, low-contrast lighting with cooler tones.
   - Change: Increase directional light intensity, warm the light color, and soften shadow edges.
4. **trees**
   - Concept: Lush, naturally clustered groves with warm, translucent leaves.
   - Build: Sparse, evenly spaced trees with dark, opaque foliage.
   - Change: Group trees into denser clusters and increase subsurface scattering on leaf materials.
5. **haze**
   - Concept: Glowing, volumetric dust and haze settling in the valleys.
   - Build: Uniform, flat distance fog lacking volume or glow.
   - Change: Implement height-based volumetric fog with strong forward light scattering.
