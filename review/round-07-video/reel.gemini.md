# Gemini video critique (gemini-3.1-pro-preview, 2026-10-04 07:51)

Video: reel.mp4

**First impression (2 sentences):** It looks like a gorgeous, data-rich ecosystem simulator right up until the camera gets close, at which point the illusion shatters completely. The UI promises a living nature documentary, but the actual gameplay visuals deliver sliding plastic toys on a static diorama.

**Scores (1 to 10):** 
Visual quality: 5
Readability: 7
Sense of life and motion: 2
Ecosystem believability: 4
UI clarity: 8
"Would I keep watching?": 3

**Top issues, ranked by how much fixing each would help:**

1.  **Critical: Sliding, weightless animal locomotion.** (00:09 - 00:21) The bison and wolves are sliding across the terrain. Their leg animations do not match their forward velocity, making them look like rigid models being dragged on invisible strings. It instantly kills any sense of mass or life. Match animation speed to movement speed, or implement foot IK so feet actually plant on the ground.
2.  **Major: Unbelievable hunting behavior.** (00:09 - 00:15) A pack of wolves chases a massive herd of healthy bison in a straight line, and the bison just jog casually away without breaking formation. It looks like two particle emitters moving parallel to each other, not a life-or-death struggle. Predators need to single out weak/slow targets, and herds need to scatter, circle, or react defensively.
3.  **Major: Stiff, mechanical bird animation.** (01:35 - 01:47) The ravens flap with perfectly uniform, robotic wingbeats and fly in straight, unvarying lines. They lack the gliding, banking, and micro-adjustments of real flight. Add distinct states for soaring, gliding, and varied flapping cadences.
4.  **Major: Rigid corpse placement.** (01:35 - 01:47) The dead bison look like frozen statues dropped onto the snow. They don't conform to the angle of the terrain or look like relaxed, dead weight. Implement basic ragdoll settling upon death, or at minimum, align the models to the ground normals.
5.  **Minor: Developer-art territory overlays.** (01:26 - 01:34) The neon, hard-edged geometric circles for wolf packs look like debug UI. They clash terribly with the naturalistic landscape you are trying to present. Soften these into heatmaps, subtle terrain tints, or organic borders.
6.  **Minor: Poor subtitle readability.** (00:09 - 00:21) The italicized white text at the bottom center gets lost against the bright yellow grass of the prairie. Add a subtle, dark gradient overlay at the bottom of the screen or a soft drop-shadow to the text to ensure contrast in all lighting conditions.
7.  **Minor: Central pop-up text obscures the view.** (00:00, 00:54, 01:13) Big text like "Stampede on the plain" or "A dry spell" slaps right across the middle of the screen, pulling focus away from watching the actual event unfold in the world. Move these cinematic notifications to the top or bottom third of the screen, keeping the center clear.

**What's working:**

1.  The overarching UI framing (tools on the left, chronicle on the right) is clean, elegant, and stays out of the way.
2.  The text-based "Chronicle" is a great feature that successfully translates dry simulation data into compelling micro-narratives.
3.  The macro-view of the landscape (00:03) looks decent and conveys a strong sense of a vast, open space.
4.  The ability to fast-forward time while smoothly tracking population graphs (01:06) feels powerful and responsive.
5.  The changing lighting and shadows over the course of a day look quite nice from a high altitude.

**The single change that would help most:** Fix the animal walking and running animations so their feet actually anchor to the terrain instead of sliding over it.
