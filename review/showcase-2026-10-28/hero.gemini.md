# Gemini video critique (gemini-3.1-pro-preview, 8 fps sampling, 2026-10-28 14:44)

Video: hero.mp4

**First impression (2 sentences):** 
The pitch promises a mesmerizing, living terrarium, but the footage delivers a frantic, stuttering jumble of unconvincing, sliding assets. It looks less like a balanced natural ecosystem and more like a chaotic engine stress test.

**Scores (1 to 10):** 
Visual quality: 4 
Readability: 2 
Sense of life and motion: 2 
Ecosystem believability: 3 
UI clarity: 1 (None present to clarify the chaos)
"Would I keep watching?": 2

**Top issues, ranked by how much fixing each would help:**

1. **Critical:** Broken locomotion. Throughout (especially 00:00-00:03 and 00:12-00:15), animals slide and skate across the terrain rather than stepping on it. The wolf's run cycle in the snow looks completely untethered from its forward momentum. It immediately shatters any illusion of life; match footfalls to ground speed and add a sense of physical weight to the animations.
2. **Critical:** Incomprehensible fast-forward pacing. From 00:05 to 00:09, speeding up the simulation turns the animals into a chaotic, jittering swarm of insects. You can't read population dynamics, predator-prey cycles, or migration—it's just visual noise. Instead of playing animations at 100x speed, abstract the movement at higher time scales (e.g., smooth flow lines, moving heatmaps, or merging individuals into cohesive groups).
3. **Major:** Complete lack of visual information/UI. The prompt mentions "watch the population graphs," but there is absolutely no UI, overlay, or visual cue in the video to tell me *why* the system is changing. Without data, I'm just watching random models bump into each other. You must overlay some form of clear data (heatmaps, population counters, status icons) so the player can actually understand and read the simulation.
4. **Major:** Robotic bird behavior. From 00:03 to 00:09, the flocks of birds look like they are rigidly attached to invisible conveyor belts, gliding unnaturally through the air without reacting to the landscape or each other. Implement basic flocking (boids) algorithms so they move organically, swirl, and react to ground activity.
5. **Major:** Unconvincing predation and interaction. When predators hunt (00:09-00:11, 00:17), there's no sense of struggle or actual physical interaction; models just intersect, jitter, or snap awkwardly. This is the core drama of an ecosystem. If detailed takedown animations are too difficult, use clever camera work or abstract the moment of the kill to avoid highlighting the janky collisions.
6. **Minor:** Lack of herding intelligence. At the start (00:00-00:03), the bison behave like individual, unrelated Roomba vacuums rather than a cohesive herd. Implement steering behaviors so prey animals move as a unit and react to threats collectively, which is vital for believable ecology.

**What's working:**
1. The environmental transitions (moving from autumn to spring to winter) successfully convey the passage of deep time and changing conditions.
2. The density of the grass and ground foliage provides a solid, visually pleasing foundation for the grazing simulation.
3. The lighting and atmospheric effects, particularly the shift to the snowy twilight scene (00:12), set a nice mood.
4. The engine seems capable of handling a very high density of entities on screen at once, which fits the ambitious "god-game" scale.

**The single change that would help most:** 
Completely rebuild the core locomotion system so that animal footfalls match their ground speed, making them look anchored to the world rather than sliding weightlessly over it.
