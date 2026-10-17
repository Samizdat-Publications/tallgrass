# Gemini video critique (gemini-3.1-pro-preview, 2 fps sampling, 2026-10-17 18:37)

Video: reel.mp4

**First impression (2 sentences):** The sweeping vistas, massive herds, and detailed graphs promise a deep, meditative god-game that I'd love to leave running as a desktop terrarium. Unfortunately, the moment the camera zooms in, stiff animations and sliding animals shatter the illusion, making it feel more like a spreadsheet visualization than a living documentary.

**Scores (1 to 10):** Visual quality 6 / Readability 7 / Sense of life and motion 3 / Ecosystem believability 5 / UI clarity 8 / "Would I keep watching?" 4

**Top issues, ranked by how much fixing each would help:**

1. **Severity:** Critical. **What I see:** Animals slide across the terrain like hovercrafts, with leg movements completely detached from their actual ground speed (e.g., wolves running at 00:03-00:05, geese walking at 00:21-00:28). **Why it hurts:** It instantly destroys the illusion of physical weight and presence, making the world feel cheap and amateurish. **What I'd change:** Sync animation playback speed to movement velocity and ensure feet stay planted during the contact phase of a stride.
2. **Severity:** Major. **What I see:** Predation lacks any physical connection; wolves just run alongside or bump into bison like bumper cars until something dies (00:14-00:20). **Why it hurts:** Watching the drama of the hunt is core to the "nature documentary" fantasy; without bespoke interactions, the life-and-death struggle feels entirely sterile. **What I'd change:** Implement specific, synchronized animations for lunging, biting, and taking down prey, rather than relying on proximity-based stat checks.
3. **Severity:** Major. **What I see:** Birds get stuck in unnatural, tight, swirling tornado patterns just above the ground (00:06-00:14). **Why it hurts:** It draws the eye for all the wrong reasons, looking like a broken pathfinding script rather than a flock of living creatures. **What I'd change:** Overhaul aerial movement with standard boids algorithms (separation, alignment, cohesion) to create fluid, sweeping flock behaviors.
4. **Severity:** Major. **What I see:** During the extended fast-forward sections (00:39 onwards), the animals turn into jittering, chaotic swarms that rapidly snap across the landscape. **Why it hurts:** If the game is designed to be observed over long periods at high speeds, watching buzzing static isn't visually pleasing or relaxing. **What I'd change:** Abstract the high-speed movement; smooth out paths or represent moving herds as shifting, organic shapes rather than individually rendering hyper-speed models.
5. **Severity:** Minor. **What I see:** Dead animals are rigid statues that clip through each other, and living animals clip right through massive piles of corpses (01:43-01:47). **Why it hurts:** It turns the aftermath of a dramatic die-off into a messy, immersion-breaking glitch-fest. **What I'd change:** Give corpses simple ragdoll physics so they settle naturally, and implement visual decay stages so they don't pile up into permanent, awkward mounds.
6. **Severity:** Minor. **What I see:** Animals ignore terrain variations, running up steep hills or near water bodies without altering their gait or speed (00:03-00:05). **Why it hurts:** It makes the landscape feel like a flat painted backdrop rather than an environment the animals have to physically navigate. **What I'd change:** Adjust movement speed based on incline and add simple splashing or wake effects when animals interact with water.

**What's working:**

1. The user interface is excellent—clean, unobtrusive, and the tracking graphs provide immediate, satisfying context for long-term population trends.
2. The wide-angle views of large herds migrating across the plains successfully capture the immense scale of a prairie ecosystem.
3. The visual transitions between seasons (snowy winters, dry brown summers, lush greens) effectively communicate changing conditions and the passage of time.
4. The atmospheric lighting and varied landscape topography create a pleasant, pastoral mood when viewed from a distance.

**The single change that would help most:** 
Fix the fundamental locomotion so that animals' feet are locked to the ground, giving them actual physical weight instead of letting them slide over the terrain.
