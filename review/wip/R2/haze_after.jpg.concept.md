# Concept match (gemini-3.1-pro-preview, 2026-10-04 14:58)

Build still: `haze_after.jpg`  
Concept: `00_prairie_golden_hour.jpg`

**Overall match: 4 / 10**

The build captures the basic topography and sun direction but lacks the vibrant contrast and volumetric depth of the concept. Key improvements are needed in water rendering, grass texture, and lighting contrast to match the target's dynamic feel.

| Criterion | Score (1-10) |
|---|---|
| light | 4 |
| palette | 4 |
| haze | 4 |
| water | 3 |
| trees | 4 |
| grass | 3 |
| composition | 4 |
| **overall** | **4** |

## Top differences (what the build should change)

1. **water**
   - Concept: Reflective, bright creek mirroring the sky with natural banks.
   - Build: Dark, flat, non-reflective surface resembling an asphalt road.
   - Change: Increase water reflectivity to mirror the sky and blend lighter dirt textures along the edges.
2. **grass**
   - Concept: Volumetric, sweeping golden grass with visible directional blades.
   - Build: Flat, low-resolution painted terrain textures without volume.
   - Change: Implement volumetric grass meshes or a directional shell texture with warm golden highlights.
3. **palette**
   - Concept: High contrast between vibrant golden hills and rich green valleys.
   - Build: Uniform, desaturated greenish-brown across the entire landscape.
   - Change: Shift hill terrain albedo to warmer ochre and increase saturation of valley greens.
4. **light**
   - Concept: Strong directional sunlight creating deep shadows and bright rim lighting.
   - Build: Flat, washed-out lighting with weak shadows and no rim highlights.
   - Change: Increase directional light intensity, darken shadow values, and add rim lighting to vegetation.
5. **trees**
   - Concept: Dense, overlapping clusters of voluminous cottonwoods.
   - Build: Sparse, evenly spaced trees with flat, dark canopies.
   - Change: Group trees into tighter clusters and improve canopy self-shadowing for better volume.
