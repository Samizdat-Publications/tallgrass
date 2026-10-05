# Concept match (gemini-3.1-pro-preview, 2026-10-05 02:03)

Build still: `concept_cap.jpg`  
Concept: `00_prairie_golden_hour.jpg`

**Overall match: 4 / 10**

The build captures the basic time of day but lacks the concept's rich contrast, vibrant golden palette, and dynamic composition. Adjusting the camera angle, water shader, and lighting contrast will significantly improve the match.

| Criterion | Score (1-10) |
|---|---|
| light | 4 |
| palette | 4 |
| haze | 4 |
| water | 3 |
| trees | 4 |
| grass | 4 |
| composition | 4 |
| **overall** | **4** |

## Top differences (what the build should change)

1. **composition**
   - Concept: Lower oblique angle emphasizing rolling hills and depth.
   - Build: High top-down drone angle that flattens terrain.
   - Change: Lower the camera pitch to look across the valley.
2. **water**
   - Concept: Highly reflective surface catching bright sun glints.
   - Build: Dark, matte surface resembling asphalt.
   - Change: Increase water specular reflection and skybox reflection intensity.
3. **light**
   - Concept: High contrast with deep, long shadows and strong rim lighting.
   - Build: Flat, washed-out lighting with weak shadows.
   - Change: Increase directional light intensity and darken shadow values.
4. **palette**
   - Concept: Rich, saturated ochre and orange grasses.
   - Build: Muddy, desaturated yellow-green grasses.
   - Change: Shift the global grass albedo toward warmer, saturated ochres.
5. **haze**
   - Concept: Directional sun bloom and localized atmospheric dust.
   - Build: Uniform, heavy yellow fog that flattens depth.
   - Change: Reduce global fog density and implement directional volumetric scattering.
