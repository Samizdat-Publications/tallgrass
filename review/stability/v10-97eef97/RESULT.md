# Checkpoint v10 "The long breath": acceptance and shocks (2026-10-09)

Candidate: v9 + evolution2 1, climate2 0.3 (climate regimes, with climatePrairie 0.5 and the other climate defaults), wolfDenMinDist 280, wolfTerritory 130. Frozen commit 97eef97.

Acceptance (20 worlds x 1,200 valley years; bison reach a median 534 generations on their slower single-calf clock, pronghorn pass 1,000): every gate passes (tools/adoption.py: eligible).
- Bison persist 20/20; wolves, pronghorn and ravens present >= 90% of the time in 20/20; every species >= 90% present in >= 19/20 (prairie dogs 19, cougars 20).
- Wolf CV 0.23 (gate 0.2), wolves follow bison at a lag corr of 0.50 (gate 0.4), raven CV 0.38 (gate 0.1), pronghorn starvation 49% of their deaths (limit 50%).
- Means: bison 484, wolves 37 (1:13), pronghorn 543, ravens 469, coyotes 76, mule deer 19, cougars 7, prairie dogs 16.
- Dominant period of bison, wolves and ravens 45 years (v9: 8 to 10); bison follow the climate index at 0.52.

Shocks (12 worlds x 500 years, shock at year 200): bison and wolves persist 12/12 and recover in 100% after cull70 (bison median 14 years), drought (19) and wolfwipe (27). Pronghorn recover in 100%, 92% and 58% (the predator-free decades after a wipeout let them boom past their old range).

Known weak spots, addressed by the v10b candidate (twins cap for pronghorn, wolf sprintCost 0.3, equilibrium starts): mule deer low (19), pronghorn spikes in wet years, wolf ratio 1:13 rather than 1:20.
