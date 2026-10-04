# Gemini video critique (gemini-3.1-pro-preview, 2026-10-03 23:13)

Video: reel.mp4

**First impression (2 sentences):** From a distance, this looks like a beautifully clean, UI-rich management game that I'd love to nerd out over. But the second the camera zooms in, the illusion shatters completely because the animals look like stiff plastic toys sliding on ice. 

**Scores (1 to 10):** 
Visual quality: 5
Readability: 8
Sense of life and motion: 3
Ecosystem believability: 6
UI clarity: 9
"Would I keep watching?": 5

**Top issues, ranked by how much fixing each would help:**

1. **Critical:** Animation/locomotion mismatch (0:09–0:21, 1:41–1:47). The wolves and pronghorns moonwalk wildly, sliding across the terrain much faster than their legs are moving. It entirely kills the "nature documentary" promise. Match the playback speed of the run cycle to the actual ground velocity.
2. **Major:** Broken collision and pathing (0:03–0:07). During the stampede, the bison clip directly through solid tree trunks and slide through each other. Implement steering behaviors so animals naturally flow around rigid obstacles.
3. **Major:** Rigid camera tracking (0:09–0:21). The camera locks instantly and perfectly to the center of the running pack, which creates a sickening judder on the background and highlights the sliding animations. Add spring damping to the camera so it follows with a slight, smooth delay.
4. **Major:** Weightless kills (0:28–0:38). A wolf simply bumps into a bison, causing the bison to instantly freeze and tip over sideways like a rigid statue. Add a brief stagger state or a specific takedown animation to give the interaction some physical weight.
5. **Minor:** Unnatural herd behavior (0:03–0:07). The "stampede" consists of animals running in a tight, endless circle for no apparent reason, which doesn't look like panic. Program herds to scatter outward or travel in a linear direction away from a specific threat.
6. **Minor:** Persistent center-screen text (1:24–1:34). The "Sickness in the herd" text stays dead center on the screen for far too long while years of simulation fly by in the background. Move these environmental flavor texts to the lower third, or fade them out after three seconds.
7. **Minor:** Harsh, noisy shadows (0:00–0:27). The shadows cast by the trees and animals are jagged and flicker heavily as they move, making the ground look messy. Soften the shadow edges or adjust the shadow cascades for close-up views.

**What's working:**

1. The data overlays are fantastic; the Wolf Territories view (1:26) is a brilliantly clear way to communicate complex spatial data without cluttering the screen.
2. The population graph (1:06) evolving in real-time is clean, readable, and exactly what simulation nerds want to see.
3. The fast-forward macro view (0:40 onwards) is highly effective; watching the snow accumulate and melt while populations shift gives a great "god view" perspective.
4. The "Chronicle" event log on the right side provides excellent narrative context to the raw numbers, turning data into a story.
5. The UI typography and layout are elegant, dark, and appropriately minimalist, staying out of the way of the world.

**The single change that would help most:** 
Fix the root motion of the animals so their feet actually plant on the ground instead of sliding, which will instantly upgrade the game from looking broken to looking like a living world.
