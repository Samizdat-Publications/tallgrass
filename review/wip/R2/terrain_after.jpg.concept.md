# Concept match (gemini-3.1-pro-preview, 2026-10-04 15:29)

Build still: `terrain_after.jpg`  
Concept: `00_prairie_golden_hour.jpg`

**Overall match: 4 / 10**

The build establishes the basic topography but lacks the dramatic lighting, volumetric textures, and rich color separation of the concept. Upgrading water reflectivity, grass volume, and directional atmospheric scattering will significantly improve the match.

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
   - Concept: Reflective surface catching sky and sun glints with organic banks.
   - Build: Flat, dark, non-reflective ribbon with hard edges.
   - Change: Increase water specularity/reflectivity and blend bank transitions.
2. **grass**
   - Concept: Sweeping, volumetric blades with distinct wind-blown streaks.
   - Build: Flat terrain texture lacking depth and directional flow.
   - Change: Add volumetric grass meshes and directional wind shaders.
3. **haze**
   - Concept: Directional sun bloom and low-hanging dust.
   - Build: Uniform, milky atmospheric fog.
   - Change: Implement volumetric lighting and directional scattering.
4. **light**
   - Concept: Strong rim lighting on hills and deep, warm shadows.
   - Build: Flat lighting with weak shadows and minimal rim highlights.
   - Change: Increase shadow contrast and boost rim lighting intensity on terrain.
5. **trees**
   - Concept: Dense, voluminous clusters of cottonwoods with warm highlights.
   - Build: Sparse, isolated trees with flat shading.
   - Change: Group trees into denser clusters and improve canopy volume shading.
